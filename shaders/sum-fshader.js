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
            sum += scalar * vector;
        }
    }
    outSum = vec4(sum, 0.0);
}
`;
