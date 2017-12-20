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

uniform highp sampler2D matricesTexture;

void main() {
    int x = int(mod(floor(gl_FragCoord.x), 5.0));
    int y = int(mod(floor(gl_FragCoord.y), 3.0));
    vec3 sum = vec3(0.0, 0.0, 0.0);
    ivec2 texSize = textureSize(matricesTexture, 0);
    for (int i = x; i < texSize.x; i += 5) {
        for (int j = y; j < texSize.y; j += 3) {
            vec2 coord = vec2((float(i)+0.5)/float(texSize.x),
                              (float(j)+0.5)/float(texSize.y));
            sum += texture(matricesTexture, coord).rgb;
        }
    }
    outSum = vec4(sum, 0.0);
}
`;
