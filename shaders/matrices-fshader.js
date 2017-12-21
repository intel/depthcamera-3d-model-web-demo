// vim: set filetype=glsl:
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
    vec3 c = texture(crossProductTexture, coord).rgb;
    vec3 n = texture(normalTexture, coord).rgb;
    vec3 dotAndError = texture(dotAndErrorTexture, coord).rrg;
    float d = dotAndError.x;
    float e = dotAndError.y;

    vec3 vector = mix(n, c, float(part < 6));
    vector = mix(vec3(1.0, 0.0, 0.0), vector, float(part < 14));
    vec3 scalarSource = mix(n, c,
            float(part < 3 || (part > 5 && part < 9)));
    scalarSource = mix(dotAndError, scalarSource,
            float(part < 12));
    float scalar = scalarSource[part % 3];
    outMatrixPart = vec4(scalar * vector, 0.0);
}
`;
