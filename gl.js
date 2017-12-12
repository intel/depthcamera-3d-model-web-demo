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

const CUBE_SIZE = 256;
const GRID_UNIT = 1.0 / CUBE_SIZE;
// a variant of SDF called TSDF limits the signed distance between
// -SDF_TRUNCATION and SDF_TRUNCATION
const SDF_TRUNCATION = 0.01;

/* eslint-disable indent, no-multi-spaces */
// canvas across the whole screen, so we can just paint with the fragment shader
const vertices = new Float32Array([
    // right bottom half of screen
    // x    y     tex.s tex.t
    -1.0, -1.0,    0.0, 0.0,
     1.0, -1.0,    1.0, 0.0,
     1.0,  1.0,    1.0, 1.0,
    // left top half of screen
    -1.0, -1.0,    0.0, 0.0,
     1.0,  1.0,    1.0, 1.0,
    -1.0,  1.0,    0.0, 1.0,
]);
/* eslint-enable */

// Compile the shader from `source` and return a reference to it.
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const msg = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(msg);
    }
    return shader;
}

function linkProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const msg = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(msg);
    }
    return program;
}

// Compile shaders, activate the shader program and return a reference to it.
// The shaders are defined in the html file.
function setupPrograms(gl) {
    const canvas = createShader(gl, gl.VERTEX_SHADER, canvasShader);
    const model = createShader(gl, gl.FRAGMENT_SHADER, modelShader);
    const render = createShader(gl, gl.FRAGMENT_SHADER, renderShader);
    return {
        model: linkProgram(gl, canvas, model),
        render: linkProgram(gl, canvas, render),
    };
}

function initAttributes(gl, programs) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const stride = 4 * 4; // 4 items per row, times 4 bytes in gl.FLOAT

    const uploadAttribute = function (name, offset) {
        const attrib = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(attrib);
        gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, stride, offset);
    }

    let program = programs.model;
    gl.useProgram(program);
    uploadAttribute('inPosition', 0);

    program = programs.render;
    gl.useProgram(program);
    uploadAttribute('inPosition', 0);
}

// Take the parameters returned from `DepthCamera.getCameraCalibration` and
// upload them as uniforms into the shaders.
function initUniforms(gl, programs, parameters, width, height) {
    const intrin = parameters.getDepthIntrinsics(width, height);
    const offsetx = (intrin.offset[0] / width) - 0.5;
    const offsety = (intrin.offset[1] / height) - 0.5;
    const focalx = intrin.focalLength[0] / width;
    const focaly = intrin.focalLength[1] / height;

    let l = 0;
    let program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'cubeSize');
    gl.uniform1i(l, CUBE_SIZE);
    l = gl.getUniformLocation(program, 'sdfTruncation');
    gl.uniform1f(l, SDF_TRUNCATION);
    l = gl.getUniformLocation(program, 'movement');
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, 'depthScale');
    gl.uniform1f(l, parameters.depthScale);
    l = gl.getUniformLocation(program, 'depthFocalLength');
    gl.uniform2f(l, focalx, focaly);
    l = gl.getUniformLocation(program, 'depthOffset');
    gl.uniform2f(l, offsetx, offsety);


    program = programs.render;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'canvasSize');
    gl.uniform2ui(l, gl.canvas.width, gl.canvas.height);
    l = gl.getUniformLocation(program, 'viewMatrix');
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, 'gridUnit');
    gl.uniform1f(l, GRID_UNIT);
}


// Create textures into which the camera output will be stored.
function setupTextures(gl, programs) {
    gl.activeTexture(gl.TEXTURE0);
    const cube0Texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, cube0Texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const stride = 2;
    const size = CUBE_SIZE * CUBE_SIZE * CUBE_SIZE * stride;
    const cube = new Float32Array(size);
    for (let i = 0; i < size; i += stride) {
        cube[i] = GRID_UNIT;
        cube[i + 1] = 0.0;
    }
    gl.texStorage3D(
        gl.TEXTURE_3D,
        1, // number of mip-map levels
        gl.RG32F, // internal format
        CUBE_SIZE,
        CUBE_SIZE,
        CUBE_SIZE,
    );

    gl.texSubImage3D(
        gl.TEXTURE_3D,
        0, // mip-map level
        0, // x-offset
        0, // y-offset
        0, // z-offset
        CUBE_SIZE,
        CUBE_SIZE,
        CUBE_SIZE,
        gl.RG,
        gl.FLOAT,
        cube,
    );

    gl.activeTexture(gl.TEXTURE1);
    const cube1Texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, cube1Texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texStorage3D(
        gl.TEXTURE_3D,
        1, // number of mip-map levels
        gl.RG32F, // internal format
        CUBE_SIZE,
        CUBE_SIZE,
        CUBE_SIZE,
    );
    gl.activeTexture(gl.TEXTURE3);
    const depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    const textures = {
        cube0: cube0Texture,
        cube1: cube1Texture,
        depth: depthTexture,
    };

    let l = 0;
    let program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, 0);
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, 3);

    program = programs.render;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, 1);
    return textures;
}
