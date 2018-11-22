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
// Tree reduction with a sum operation.
// http://www.mathematik.uni-dortmund.de/~goeddeke/gpgpu/tutorial2.html
//
// This shader alone will take an input texture, sum 4 neighboring values and
// write them into an output texture where each side is half the size of
// the input texture. One difference from a standard sum shader is that the
// textures contains blocks of 5x3 values (using color attachments would be
// better, but 15 color attachments are usually not supported). Therefore,
// a neighboring value means that it is in the next block of data at the same
// offset. E.g. this would sum the values at [0, 0], [5, 0], [0, 3], [5, 3] and
// output them at [0, 0].

precision highp float;

// A framebuffer texture should be bound here, of size (5*x, 3*x), where x is
// a power of two. Should be half the size of the input texture.
layout(location = 0) out vec4 outSum;

// Normally should be of size(5*x, 3*x), where x is a power of two integer. If
// it is smaller, the border values will be considered to be 0.
uniform highp sampler2D inputTexture;

/*Return true if the coordinate is lower than (0, 0) or higher than (1, 1).*/
bool coordIsOutOfRange(vec2 texCoord) {
    bvec2 high = greaterThan(texCoord, vec2(1.0, 1.0));
    bvec2 low = lessThan(texCoord, vec2(0.0, 0.0));
    return high.x || high.y || low.x || low.y;
}

/*Set output to 0 if texCoord is outside of the texture. Works only if
texture has filtering GL_NEAREST. See
https://wiki.linaro.org/WorkingGroups/Middleware/Graphics/GLES2PortingTips*/
vec3 getTexture(vec2 texCoord) {
    vec3 result = texture(inputTexture, texCoord).rgb;
    return mix(result, vec3(0.0, 0.0, 0.0), float(coordIsOutOfRange(texCoord)));
}

void main() {
    // outSum = vec4(1.0, 0.0, 0.0, 0.0);
    // The built-in gl_FragCoord goes from [0.5, 0.5] to [width - 0.5, height
    // -0.5] where width and height are the size of the output texture. Make it
    // into an integer by removing the 0.5.
    vec2 inputIndex = floor(gl_FragCoord.xy);
    // Offset from the top-left corner of the 5x3 block inside the texture.
    vec2 offsetIndex = vec2(mod(inputIndex.x, 4.0), mod(inputIndex.y, 4.0));
    // Each block in the texture is 5x3. Get the index of the top-left texel in
    // each block, i.e. [0, 0], [5, 0], [10, 0], ..., [0, 3], [5, 3], [10, 3]...
    vec2 blockIndex = inputIndex - offsetIndex;
    // The gl_FragCoord contains indices for the output texture, but the input
    // texture is double the size. Therefore, this will contain the index of the
    // top-left texel in 4 blocks of data.
    blockIndex *= 2.0;
    vec2 size = vec2(textureSize(inputTexture, 0));
    vec3 sum = getTexture((blockIndex + offsetIndex + vec2(0.5, 0.5))/size)
             + getTexture((blockIndex + offsetIndex + vec2(4.5, 0.5))/size)
             + getTexture((blockIndex + offsetIndex + vec2(0.5, 4.5))/size)
             + getTexture((blockIndex + offsetIndex + vec2(4.5, 4.5))/size);
    outSum = vec4(sum, 0.0);
}
`;
// vim: set filetype=glsl:
