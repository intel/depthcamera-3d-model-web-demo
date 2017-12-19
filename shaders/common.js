// vim: set filetype=glsl:
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

const PROJECT_DEPROJECT_SHADER_FUNCTIONS = `
// Information from the depth camera on how to convert the values from the
// 'depthTexture' into meters.
uniform float depthScale;
// Offset of the principal point of the camera.
uniform vec2 depthOffset;
// Focal length of the depth camera.
uniform vec2 depthFocalLength;

// Return true if the coordinate is lower than (0, 0) or higher than (1, 1).
bool coordIsOutOfRange(vec2 texCoord) {
    bvec2 high = greaterThan(texCoord, vec2(1.0, 1.0));
    bvec2 low = lessThan(texCoord, vec2(0.0, 0.0));
    return high.x || high.y || low.x || low.y;
}

// Project the point at position onto the plane at approximately z=-1 with the
// camera at origin.
vec2 project(vec3 position) {
    vec2 position2d = position.xy / position.z;
    return position2d*depthFocalLength + depthOffset;
}

// Use depth data to "reverse" projection.
// The 'coord' argument should be between (-0.5, -0.5) and (0.5, 0.5), i.e.
// a point on the projection plane.
vec3 deproject(sampler2D tex, vec2 coord) {
    // convert into texture coordinate
    vec2 texCoord = coord + 0.5;
    float depth = float(texture(tex, texCoord).r) * depthScale;
    // Set depth to 0 if texCoord is outside of the texture. Works only if
    // texture has filtering GL_NEAREST. See
    // https://wiki.linaro.org/WorkingGroups/Middleware/Graphics/GLES2PortingTips
    depth = mix(depth, 0.0, coordIsOutOfRange(texCoord));
    vec2 position2d = (coord - depthOffset)/depthFocalLength;
    return vec3(position2d*depth, depth);
}
`
