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

uniform highp sampler2D pointsTexture;
uniform ivec2 pointsTextureSize;

void main() {
    float sum = 0.0;
    for (int i = 0; i < pointsTextureSize.x; i++) {
        for (int j = 0; j < pointsTextureSize.y; j++) {
            vec2 coord = vec2(float(i)/float(pointsTextureSize.x),
                              float(j)/float(pointsTextureSize.y));
            vec4 data = texture(pointsTexture, coord);
            sum += data.x;
        }
    }
    outSum = vec4(sum, 1.0, 2.0, 0.0);
}
`;
