// vim: set filetype=glsl:
const sumShader = `#version 300 es
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
precision highp float;

layout(location = 0) out vec4 outSum;

uniform highp sampler2D crossProductTexture;
uniform highp sampler2D normalTexture;
uniform highp sampler2D dotAndErrorTexture;

#define EPSILON 0.0001


void main() {
    int part = int(gl_FragCoord.x);
    vec3 sum = vec3(0.0, 0.0, 0.0);
    // The size of the input textures should be the same.
    ivec2 texSize = textureSize(crossProductTexture, 0);
    for (int i = 0; i < texSize.x; i++) {
        for (int j = 0; j < texSize.y; j++) {
            vec2 coord = vec2(float(i)/float(texSize.x),
                              float(j)/float(texSize.y));
            vec3 c = texture(crossProductTexture, coord).rgb;
            vec3 n = texture(normalTexture, coord).rgb;
            vec2 dotAndError = texture(dotAndErrorTexture, coord).rg;
            float d = dotAndError.x;
            float e = dotAndError.y;

            if (part == 0) {
                sum += c.x * c;
            } else if (part == 1) {
                sum += c.y * c;
            } else if (part == 2) {
                sum += c.z * c;

            } else if (part == 3) {
                sum += n.x * c;
            } else if (part == 4) {
                sum += n.y * c;
            } else if (part == 5) {
                sum += n.z * c;

            } else if (part == 6) {
                sum += c.x * n;
            } else if (part == 7) {
                sum += c.y * n;
            } else if (part == 8) {
                sum += c.z * n;

            } else if (part == 9) {
                sum += n.x * n;
            } else if (part == 10) {
                sum += n.y * n;
            } else if (part == 11) {
                sum += n.z * n;

            } else if (part == 12) {
                sum += d * c;
            } else if (part == 13) {
                sum += d * n;

            } else if (part == 14) {
                sum.x += e;
            }
        }
    }
    outSum = vec4(sum, 0.0);
}
`;
