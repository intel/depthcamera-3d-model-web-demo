// vim: set filetype=glsl:
const modelShader = `#version 300 es
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
//
//
// Create a volumetric model out of the camera depth data. The main inputs are
// the depth data and the movement matrix that describes the movement of the
// camera since the first frame. The volumetric model is stored into a 3D
// texture in the form of a signed distance function. The output is a texel that
// stores (signedDistance, weight).
//
// The previous values from this 3D texture will be summed with the new data.
// The result will be returned as 'outTexel' - it is expected that the 3D
// texture is bound as the framebuffer (or rather a slice of it - this shader
// should be run for each z-slice of the 3D texture). However, it is undefined
// behaviour to read from a texture that is also bound as the framebuffer (see
// Section 4.4.3.1 of the OpenGL ES 3.0 specification, "Rendering Feedback
// Loops"). This should be solved by using two 3D textures of the same size and
// switching between them - read from the first texture and write into the
// second one, then read from the second one and write into the first one on the
// next frame (this method is sometimes called ping-pong).
//
// Each texel contains two numbers - the distance to the nearest surface and the
// weight. To calculate the distance, imagine the cone of the camera - the
// things that the depth camera sees, and place a cube so that most of that cone
// is inside of it. For each item in the cube (let's call it sub-cube), we want
// to calculate the distance from the geometrical center of the sub-cube to the
// nearest surface (to the nearest point in the depth data). Since
// finding the closest point would be slow, we rather just find the closest
// point along the line from the camera to the center of the sub-cube.
// We calculate the position of the geometrical center of the sub-cube and
// project it onto the projection plane at z=-1. Assuming that the depth image
// is at the projection plane, we deproject that point and get the depth point.
// The result we want will be the distance between the depth point and the
// camera, minus the distance between the sub-cube center and the camera.
//
// This is called a signed distance function - it is positive when outside of
// the surface and negative when inside of the surface. The surface is where the
// zero-crossing is - where the distance function is equal to zero.
// The following diagram shows a rounded surface that was detected by the camera
// and the cube shown from one side. The renderer can figure out from the cube
// where the original surface was, thanks to interpolation.
//
//                   ^ x
//                   |                               XX
//                   |        +-----+-----+-----+---XX+-----+
//                   |        |     |     |     |  XX |     |
//    |              |        |     | 0.4 | 0.2 |XX   | -0.4|
//    |              |        |     |     |     |XX   |     |
//    |              |        +-----------------XX----------+
//    |              |        |     |     |     XX    |     |
//    |              |        | 0.5 | 0.3 | 0.1 X -0.2| -0.5|
//    |              |camera  |     |     |    X|     |     |
// --------------------------------------------X----------------------------->
//  -1|             0|        |     |     |    X|     |     |                z
//    |              |        | 0.5 | 0.3 | 0.1 X -0.2| -0.4|
//    |              |        |     |     |     X     |     |
//    |              |        +-----------------XX----------+
//    |              |        |     |     |     |XX   |     |
//    |              |        |     | 0.5 | 0.2 | XX  | -0.3|
//                   |        |     |     |     |  XX |     |
// projection        |        +-----+-----+-----+----XX-----+
//  plane
//
//
// As the camera moves, the want to add information about the other parts of the
// surface to the old information. We calculate the final signed distance
// function (sdf) by adding it to the previous one, using weights.
//
//    sdf = (previousSdf*previousWeight + newSdf*1.0)/(previousWeight + 1.0)
//    weight = previousWeight + 1.0
//
// It is possible to use different weighting, for example the new data could
// have equal weight to the old data. The weight will be maxed out at
// 'MAX_WEIGHT', chosen arbitrarily.
//
// The distance function will be calculated only close to the surface, given by
// 'sdfTruncation', otherwise there would be a lot of noise in places far away
// from anything.

precision highp float;

// Maximum weight of each sub-cube, chosen arbitrarily. A lower value will make
// newer data count more, a higher value will make old and established data
// count more.
#define MAX_WEIGHT 20.0

layout(location = 0) out vec2 outTexel;
in vec2 texCoord;

// Length of each side of the cubeTexture.
uniform int cubeSize;
// Representation of the volumetric model.
uniform highp sampler3D cubeTexture;
// Depth image from the camera.
uniform highp sampler2D depthTexture;
// Which slice of the cubeTexture in the z direction we are rendering. Goes
// from 0 to (cubeSize-1).
uniform uint zslice;
// Maximum distance from a surface where we still bother updating the
// information about the distance - if too far, the weight of the new data is 0.
uniform float sdfTruncation;
// Estimated movement of the (real-world) camera.
uniform mat4 movement;

// Information from the depth camera on how to convert the values from the
// 'depthTexture' into meters.
uniform float depthScale;
// Offset of the principal point of the camera.
uniform vec2 depthOffset;
// Focal length of the depth camera.
uniform vec2 depthFocalLength;

// Project the point at position onto the plane at approximately z=-1 with the
// camera at origin.
vec2 project(vec3 position) {
    vec2 position2d = position.xy / position.z;
    return position2d*depthFocalLength + depthOffset;
}

// Use depth data to "reverse" projection.
// The 'coord' argument should be between (-0.5, -0.5) and (0.5, 0.5), i.e.
// a point on the projection plane.
vec3 deproject(vec2 coord) {
    // convert into texture coordinate
    vec2 texCoord = coord + 0.5;
    float depth = float(texture(depthTexture, texCoord).r) * depthScale;
    vec2 position2d = (coord - depthOffset)/depthFocalLength;
    return vec3(position2d*depth, depth);
}

// Return the new sdf value to be stored in the sub-cube.
// The 'position' argument is the center of the sub-cube for which we are
// calculating this (where the 'sub-cube' is a single texel of the 3D
// cubeTexture). The cubeTexture is assumed to be centered at (0, 0, 0.5) and
// each side has length 1.
// Returns the current value of the texture if anything goes wrong.
vec2 calculateSdf(vec3 texelCoordinate, vec3 position) {
    // Current value in the texture, to be updated.
    vec2 old = texture(cubeTexture, texelCoordinate).rg;
    vec2 p = project(position);
    // Landed outside of the projection plane.
    if (p.x < -0.5 || p.y < -0.5 || p.x >= 0.5 || p.y >= 0.5) return old;
    vec3 depth = deproject(p);
    // The depth camera stores zero if depth is undefined.
    if (depth.z == 0.0) return old;
    vec3 camera = vec3(0.0, 0.0, 0.0);
    //vec3 camera = (movement*vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sdf = distance(depth, camera) - distance(position, camera);
    if (sdf >= -sdfTruncation && sdf <= sdfTruncation) {
        float newWeight = old.y + 1.0;
        float newSdf = (old.x*old.y + sdf)/newWeight;
        return vec2(newSdf, min(newWeight, MAX_WEIGHT));
    } else {
        // Don't update sub-cubes that are too far away from the surface. Same
        // as setting weight to zero if too far.
        return old;
    }
}

// Calculate the texel coordinate for a texel with index (i, j, k).
vec3 texelCenter(uint i, uint j, uint k) {
    float size = float(cubeSize);
    return vec3((float(i) + 0.5) / size,
                (float(j) + 0.5) / size,
                (float(k) + 0.5) / size);
}

void main() {
    vec2 texel2 = texCoord;
    // We are reading from the same texel as we are outputting.
    vec3 texel = texelCenter(uint(gl_FragCoord.x),
                              uint(gl_FragCoord.y),
                              zslice);
    //if (abs(texel.x - texel2.x) < 0.5) {
    if(texel2.x < 0.001) {
        outTexel = vec2(0.0, 0.0);
    } else {
    // Convert texel coordinate where each component is from 0 to 1, into global
    // coordinates where each component is from -0.5 to 0.5, i.e. the cube
    // texture is going to be centered at the origin.
    vec3 position = texel - 0.5;
    // Center the cube at (0, 0, 0.5). The camera will be at the origin and the
    // projection plane at z=-1.
    position.z += 0.5;
    position = (movement * vec4(position, 1.0)).xyz;
    outTexel = calculateSdf(texel, position);
    }
}
`;
