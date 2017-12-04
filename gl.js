/*jshint esversion: 6 */

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
const GRID_UNIT = 1.0/CUBE_SIZE;
// a variant of SDF called TSDF limits the signed distance between
// -SDF_TRUNCATION and SDF_TRUNCATION
const SDF_TRUNCATION = 0.01;

// canvas across the whole screen, so we can just paint with the fragment shader
const vertices = new Float32Array([
    // right bottom half of screen
    -1.0, -1.0,
     1.0, -1.0,
     1.0,  1.0,
    // left top half of screen
    -1.0, -1.0,
     1.0,  1.0,
    -1.0,  1.0,
]);

// Compile shaders, activate the shader program and return a reference to it.
// The shaders are defined in the html file.
function setupPrograms(gl) {
    let canvas = createShader(gl, gl.VERTEX_SHADER, canvasShader);
    let model = createShader(gl, gl.FRAGMENT_SHADER, modelShader);
    let render = createShader(gl, gl.FRAGMENT_SHADER, renderShader);
    let programs = {
        model: linkProgram(gl, canvas, model),
        render: linkProgram(gl, canvas, render),
    }
    return programs;
}

function linkProgram(gl, vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        let msg = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw {
            name: "ShaderLinkingError",
            message: msg,
        };
    }
    return program;
}

// Compile the shader from `source` and return a reference to it.
function createShader(gl, type, source) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    let msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw {
        name: "ShaderCompilationError",
        message: msg,
    };
}

function initVertexBuffer(gl, programs) {
    let vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // all programs simply use a canvas vertex shader, the main things are in
    // the fragment shaders
    for (let key in programs) {
        let program = programs[key];
        gl.useProgram(program);
        let attrib = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(attrib);
        gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);
    }
}

// Take the parameters returned from `DepthCamera.getCameraCalibration` and
// upload them as uniforms into the shaders.
function initUniforms(gl, programs, parameters, width, height) {
    let intrin = parameters.getDepthIntrinsics(width, height);
    let depthScale = parameters.depthScale;
    let offsetx = intrin.offset[0]/width - 0.5;
    let offsety = intrin.offset[1]/height - 0.5;
    let focalx = intrin.focalLength[0]/width;
    let focaly = intrin.focalLength[1]/height;

    let l = 0;
    let program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, "cubeSize");
    gl.uniform1i(l, CUBE_SIZE);
    l = gl.getUniformLocation(program, "sdfTruncation");
    gl.uniform1f(l, SDF_TRUNCATION);
    l = gl.getUniformLocation(program, "movement");
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, "depthScale");
    gl.uniform1f(l, depthScale);
    l = gl.getUniformLocation(program, "depthFocalLength");
    gl.uniform2f(l, focalx, focaly);
    l = gl.getUniformLocation(program, "depthOffset");
    gl.uniform2f(l, offsetx, offsety);


    program = programs.render;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, "canvasSize");
    gl.uniform2ui(l, gl.canvas.width, gl.canvas.height);
    l = gl.getUniformLocation(program, "viewMatrix");
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, "gridUnit");
    gl.uniform1f(l, GRID_UNIT);
}


// Create textures into which the camera output will be stored.
function setupTextures(gl, programs) {
    gl.activeTexture(gl.TEXTURE0);
    let cube0Texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, cube0Texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    let stride = 2;
    let cube = new Float32Array(CUBE_SIZE*CUBE_SIZE*CUBE_SIZE*stride);
    for (let i=0; i<CUBE_SIZE*CUBE_SIZE*CUBE_SIZE*stride; i += stride) {
        cube[i] = GRID_UNIT;
        cube[i+1] = 0.0;
    }
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG32F, CUBE_SIZE, CUBE_SIZE, CUBE_SIZE,
                 0, gl.RG, gl.FLOAT, cube);

    gl.activeTexture(gl.TEXTURE1);
    let cube1Texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, cube1Texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG32F, CUBE_SIZE, CUBE_SIZE, CUBE_SIZE,
                 0, gl.RG, gl.FLOAT, null);

    gl.activeTexture(gl.TEXTURE3);
    let depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    let textures = {
        cube0: cube0Texture,
        cube1: cube1Texture,
        depth: depthTexture,
    };

    let l = 0;
    let program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, "cubeTexture");
    gl.uniform1i(l, 0);
    l = gl.getUniformLocation(program, "depthTexture");
    gl.uniform1i(l, 3);

    program = programs.render;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, "cubeTexture");
    gl.uniform1i(l, 1);
    return textures;
}
