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
// Throw out points which have normals n and m where dot(n, m) is smaller than
// this value (the dot function returns 1 if the normals are identical, -1 if
// they are opposite).
#define MIN_NORMAL_DOT 0.9

layout(location = 0) out vec4 outCrossProduct;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec2 outDotAndError;
in vec2 aTexCoord;

// Two depth images from the camera.
uniform highp sampler2D sourceDepthTexture;
uniform highp sampler2D destDepthTexture;

uniform mat4 movement;

${PROJECT_DEPROJECT_SHADER_FUNCTIONS}

// Guess what the normal of a point is by looking at two neighboring points.
// Will return the zero vector if the neighboring points are undefined.
vec3 estimateNormal(sampler2D tex, vec2 imageCoord) {
    vec3 position = deproject(tex, imageCoord);

    ivec2 texSize = textureSize(tex, 0);
    vec2 texStep = vec2(1.0/float(texSize.x), 1.0/float(texSize.y));
    // TODO remove this
    if (imageCoord.x + texStep.x >= 0.5 ||
        imageCoord.y + texStep.y >= 0.5)
            return vec3(0.0, 0.0, 0.0);

    vec3 positionRight = deproject(tex, imageCoord + vec2(texStep.x, 0.0));
    vec3 positionTop   = deproject(tex, imageCoord + vec2(0.0, texStep.y));
    // TODO remove this
    if (positionTop == vec3(0.0, 0.0, 0.0) || positionRight == vec3(0.0, 0.0, 0.0)) {
        return vec3(0.0, 0.0, 0.0);
    }

    vec3 normal = cross(positionTop - position, positionRight - position);
    return normalize(normal);
}


void main() {
    vec4 zero = vec4(0.0, 0.0, 0.0, 0.0);
    outCrossProduct = zero;
    outNormal = zero;
    outDotAndError = vec2(0.0, 0.0);

    // TODO use aTexCoord
    ivec2 texSize = textureSize(sourceDepthTexture, 0);
    vec2 coord = vec2((gl_FragCoord.x)/float(texSize.x),
                      (gl_FragCoord.y)/float(texSize.y));
    // TODO most of these if conditions could be removed or replaced by
    // something that doesn't use branching, but this should be done only after
    // I test that it works properly.
    vec2 imageCoord = coord - 0.5;
    vec3 sourcePosition = deproject(sourceDepthTexture, imageCoord);
    if (sourcePosition.z != 0.0) {
        vec3 sourceNormal = estimateNormal(sourceDepthTexture, imageCoord);
        if (sourceNormal != vec3(0.0, 0.0, 0.0)) {

            sourcePosition = (movement * vec4(sourcePosition, 1.0)).xyz;
            sourceNormal = mat3(movement) * sourceNormal;

            vec2 destImageCoord = project(sourcePosition);
            vec3 destPosition = deproject(destDepthTexture, destImageCoord);
            if (destPosition.z != 0.0) {
                vec3 destNormal = estimateNormal(destDepthTexture, destImageCoord);
                if (destNormal != vec3(0.0, 0.0, 0.0)) {

                    if (distance(sourcePosition, destPosition) < MAX_DISTANCE
                            && dot(sourceNormal, destNormal) > MIN_NORMAL_DOT) {

                        outCrossProduct = vec4(cross(sourcePosition, sourceNormal), 0.0);
                        outNormal = vec4(sourceNormal, 0.0);
                        float dotProduct = dot(sourcePosition - destPosition, sourceNormal);
                        float error = pow(dotProduct, 2.0);
                        outDotAndError = vec2(dotProduct, error);
                    }
                }
            }
        }
    }
}
`;
// vim: set filetype=glsl:
