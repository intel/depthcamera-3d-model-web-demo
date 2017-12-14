// vim: set filetype=glsl:
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
//
//
precision highp float;

layout(location = 0) out vec3 out_texel;

// Two depth images from the camera.
uniform highp sampler2D source_depth_texture;
uniform highp sampler2D destination_depth_texture;

// Information from the depth camera on how to convert the values from the
// 'depth_texture' into meters.
uniform float depth_scale;
// Offset of the princilal point of the camera.
uniform vec2 depth_offset;
// Focal lenght of the depth camera.
uniform vec2 depth_focal_length;

// Project the point at position onto the plane at approximately z=-1 with the
// camera at origin.
vec2 project(vec3 position) {
    vec2 position2d = position.xy / position.z;
    return position2d*depth_focal_length + depth_offset;
}

// Use depth data to "reverse" projection.
// The 'coord' argument should be between (-0.5, -0.5) and (0.5, 0.5), i.e.
// a point on the projection plane.
vec3 deproject(vec2 coord) {
    // convert into texture coordinate
    vec2 tex_coord = coord + 0.5;
    float depth = float(texture(source_depth_texture, tex_coord).r) * depth_scale;
    vec2 position2d = (coord - depth_offset)/depth_focal_length;
    return vec3(position2d*depth, depth);
}

void main() {
    out_texel = vec3(1.0, 1.0, 1.0);
}
`;
