const pointsShader = `#version 300 es
// Copyright 2017 Intel Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Find corresponding points between the point clouds created from
// sourceDepthTexture and destDepthTexture. For each corresponding points p and
// q, output their cross product, their normal and the dot product between (p
// - q) and the normal. This is the first stage of the ICP (iterative
// closest/corresponding point), the output values will be used to construct
// a set of linear equations to find a transformation that would move the source
// point cloud (from sourceDepthTexture) onto the destination point cloud. The
// input 'movement' matrix will be used as an initial guess of how the source
// point cloud should be moved. This shader should be run multiple times for the
// same point clouds but each time with a better estimation of the movement
// matrix.
//
// A naive version of this algorithm would use a linear search for each point,
// testing which one is the closest, but this would be O(n^2) where n is the
// number of pixels in the depth texture, which is usually > 10000, which would
// be unacceptably slow. A k-d tree would be another way to do it, but is still
// relatively slow.
//
// What this algorithm does is called "reverse calibration" and is O(n) where
// n is the number of data points in the depth texture, with the disadvantage
// that it's actually a heuristic and therefore doesn't always find the
// corresponding point, but it's good enough. It works by first de-projecting
// the sourceDepthTexture into a 3D point and transforming it by 'movement'.
// This will then get projected back and the coordinate used as an index into
// the destDepthTexture. De-project that point from destDepthTexture and now you
// have two points in 3D that might correspond. If they are reasonably close to
// each other and their normals are similar, consider them to be the
// corresponding points, otherwise ignore them (i.e. the outputs from this
// shader will be all zero).
//
// The paper Efficient Variants of the ICP Algorithm by Rusinkiewicz and Levoy
// has comparisons of various approaches:
// http://www.pcl-users.org/file/n4037867/Rusinkiewicz_Effcient_Variants_of_ICP.pdf
// By their terminology, the algorithm implemented here samples all the points
// (uniformly weighted), uses the point-to-plane error metric, and rejects pair
// based on a point-to-point distance and difference between the angles of their
// normals.
precision highp float;

// Throw out points whose distance is higher than this.
#define MAX_DISTANCE 0.2
// How many steps the raymarcher will take at most.
#define MAX_STEPS 512
// Floats with a difference smaller than this are considered equal.
#define EPSILON 0.000001

// The product (p x n), where p is a point from the previousDepthTexture point
// cloud and n is an estimation of the normal vector at that position. The
// fourth element is unused (rendering into RGB32F is not guaranteed to be
// supported, so I have to use RBBA32F).
layout(location = 0) out vec4 outCrossProduct;
// Estimated normal vector of the point in the point cloud made from
// previousDepthTexture, for which we found a corresponding point.
layout(location = 1) out vec4 outNormal;
// The first element is the dot product (p - q)*n, where p and q are the
// corresponding points and n is the estimated normal. The second element is
// the error of this correspondence. The third and fourth elements are used for
// debugging purposes. The third will be 1.0 if a pair of points (p,q) was
// found and 0.0 otherwise. The fouth will be 1.0 if this pair of points was
// actually used, i.e. the normal could be estimated and they fullfulled the
// conditions (weren't far away from each other and such).
layout(location = 2) out vec4 outDotAndError;
in vec2 aTexCoord;

// Depth data from the camera.
uniform highp sampler2D depthTexture;
uniform highp sampler2D previousDepthTexture;
// Representation of the volumetric model.
uniform highp sampler3D cubeTexture;


uniform mat4 movement;

${PROJECT_DEPROJECT_SHADER_FUNCTIONS}

// Convert world coordinates of the cube into uvw texture coordinates. Imagine
// there is a cube of size 1x1x1 at origin - this function will return the
// coordinate of the texel as if the texture was positioned like that.
vec3 getTexelCoordinate(vec3 position) {
    position.x = -position.x;
    return position + 0.5;
}

// Signed distance function for a box.
float signedDistanceBox(vec3 position) {
    vec3 d = abs(position) - 0.5; // 0.5 is half of the size of each side
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Signed distance function for some objects - negative when inside of some
// object, positive when outside, zero on the boundary.
float signedDistance(vec3 position) {
    // Since the values outside of the texture are 0, we need to draw a box at
    // the same position as the texture cube, which will show us the distance
    // towards it.
    return max(signedDistanceBox(position),
               texture(cubeTexture, getTexelCoordinate(position)).r);
}


vec3 raymarch(vec3 position, vec3 viewDirection) {
    for (int i = 0; i < MAX_STEPS; i++) {
        float dist = signedDistance(position);
        if (dist < EPSILON) {
            return position;
        } else if (length(position) > 10.0) {
            // we are way outside of the cube texture, don't bother anymore
            break;
        } else {
            position += dist * viewDirection;
        }
    }
    return vec3(0.0, 0.0, 0.0);
}

// Guess what the normal of the surface is at this position by looking at nearby
// points on the surface.
vec3 estimateNormalSignedDistance(vec3 position) {
    vec3 normal;
    float gridUnit = 1.0/128.0;
    float unit = gridUnit/2.0;
    normal.x = signedDistance(position + vec3(unit, 0.0, 0.0))
             - signedDistance(position - vec3(unit, 0.0, 0.0));
    normal.y = signedDistance(position + vec3(0.0, unit, 0.0))
             - signedDistance(position - vec3(0.0, unit, 0.0));
    normal.z = signedDistance(position + vec3(0.0, 0.0, unit))
             - signedDistance(position - vec3(0.0, 0.0, unit));
    return normalize(normal);
}

// Guess what the normal of a point is by looking at two neighboring points.
// Will return the zero vector if the neighboring points are undefined.
vec3 estimateNormalPointCloud(sampler2D tex, vec2 coord) {
    vec3 position = deproject(tex, coord);

    ivec2 texSize = textureSize(tex, 0);
    vec2 texStep = vec2(1.0/float(texSize.x), 1.0/float(texSize.y));
    // TODO remove this
    if (coord.x + texStep.x >= 0.5 ||
        coord.y + texStep.y >= 0.5)
            return vec3(0.0, 0.0, 0.0);

    vec3 positionRight = deproject(tex, coord + vec2(texStep.x, 0.0));
    vec3 positionTop   = deproject(tex, coord + vec2(0.0, texStep.y));
    // TODO remove this
    if (positionTop == vec3(0.0, 0.0, 0.0) || positionRight == vec3(0.0, 0.0, 0.0)) {
        return vec3(0.0, 0.0, 0.0);
    }

    vec3 normal = cross(positionTop - position, positionRight - position);
    return normalize(normal);
}

void main() {
    vec4 zero = vec4(0.0, 0.0, 0.0, 0.0);
    outCrossProduct = vec4(0.0, 0.0, 0.0, 0.0);
    outNormal = vec4(0.0, 0.0, 0.0, 0.0);
    outDotAndError = vec4(0.0, 0.0, 0.0, 0.0);

    // TODO use aTexCoord
    ivec2 texSize = textureSize(depthTexture, 0);
    vec2 coord = vec2(((gl_FragCoord.x))/float(texSize.x) - 0.5,
                      ((gl_FragCoord.y))/float(texSize.y) - 0.5);
    coord = -coord;
    // TODO most of these if conditions could be removed or replaced by
    // something that doesn't use branching, but this should be done only after
    // I test that it works properly.
    vec3 sourcePosition = deproject(depthTexture, coord);
    if (sourcePosition != vec3(0.0, 0.0, 0.0)) {
        sourcePosition = (movement * vec4(sourcePosition, 1.0)).xyz;

        // To find the point corresponding to the transformed position, cast
        // a ray into the cube texture which contains data from previous frames.
        vec2 rayCoord = project(sourcePosition);
        // vec3 rayPosition = vec3(rayCoord, -2.0);
        // vec3 camera = vec3(0.0, 0.0, -1.0);
        // vec3 viewDirection = normalize(camera-rayPosition);
        // vec3 destPosition = raymarch(rayPosition, viewDirection);
        vec3 destPosition = deproject(previousDepthTexture, rayCoord);
        // outNormal.xyz = normalize(destPosition);
        if (destPosition != vec3(0.0, 0.0, 0.0)) {
            // Used for debugging, set to 1 if a pair of points was found,
            // though they might not actually get used.
            outDotAndError = vec4(0.0, 0.0, 1.0, 0.0);
            // vec3 normal = estimateNormalSignedDistance(destPosition);
            // move destPosition into camera space (sourcePosition is already in
            // camera space)
            // destPosition.z += 1.0;
            vec3 normal = estimateNormalPointCloud(previousDepthTexture, rayCoord);
            if (normal != vec3(0.0, 0.0, 0.0)) {
                if (distance(sourcePosition, destPosition) < MAX_DISTANCE) {
                    outCrossProduct = vec4(cross(sourcePosition, normal), 0.0);
                    outNormal = vec4(normal, 0.0);
                    float dotProduct = dot(sourcePosition - destPosition, normal);
                    float error = pow(dotProduct, 2.0);
                    outDotAndError = vec4(dotProduct, error, 1.0, 1.0);
                }
            }
        }
    }
}
`;
// vim: set filetype=glsl:
