const matricesShader = `#version 300 es
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

layout(location = 0) out vec4 outMatrixPart;
in vec2 aTexCoord;

uniform highp sampler2D crossProductTexture;
uniform highp sampler2D normalTexture;
uniform highp sampler2D dotAndErrorTexture;

void main() {
    // todo get size of output texture via uniform
    ivec2 texSize = textureSize(crossProductTexture, 0);
    texSize.x = texSize.x * 5;
    texSize.y = texSize.y * 3;
    vec2 coord = vec2(gl_FragCoord.x/float(texSize.x),
                      gl_FragCoord.y/float(texSize.y));

    int x = int(mod(floor(gl_FragCoord.x), 5.0));
    int y = int(mod(floor(gl_FragCoord.y), 3.0));
    int part = y * 5 + x;
    vec4 c = vec4(texture(crossProductTexture, coord).rgb, 0.0);
    vec4 n = vec4(texture(normalTexture, coord).rgb, 0.0);
    vec3 dotAndError = texture(dotAndErrorTexture, coord).rgb;
    float d = dotAndError.x;
    float e = dotAndError.y;
    float b = dotAndError.z;

    if (part == 0) {
        outMatrixPart = c.x * c;
    } else if (part == 1) {
        outMatrixPart = c.y * c;
    } else if (part == 2) {
        outMatrixPart = c.z * c;

    } else if (part == 3) {
        outMatrixPart = n.x * c;
    } else if (part == 4) {
        outMatrixPart = n.y * c;
    } else if (part == 5) {
        outMatrixPart = n.z * c;

    } else if (part == 6) {
        outMatrixPart = c.x * n;
    } else if (part == 7) {
        outMatrixPart = c.y * n;
    } else if (part == 8) {
        outMatrixPart = c.z * n;

    } else if (part == 9) {
        outMatrixPart = n.x * n;
    } else if (part == 10) {
        outMatrixPart = n.y * n;
    } else if (part == 11) {
        outMatrixPart = n.z * n;

    } else if (part == 12) {
        outMatrixPart = d * c;
    } else if (part == 13) {
        outMatrixPart = d * n;

    } else if (part == 14) {
        outMatrixPart.x = e;
        outMatrixPart.y = b;
    }
}
`;
// vim: set filetype=glsl:
