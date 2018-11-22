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
    // x    y   z    tex.s tex.t
    -1.0, -1.0, 0.0,   0.0, 0.0,
     1.0, -1.0, 0.0,   1.0, 0.0,
     1.0,  1.0, 0.0,   1.0, 1.0,
    // left top half of screen
    -1.0, -1.0, 0.0,   0.0, 0.0,
     1.0,  1.0, 0.0,   1.0, 1.0,
    -1.0,  1.0, 0.0,   0.0, 1.0,
]);
/* eslint-enable */


// Find smallest power of two that is bigger than `number`. For example, if
// `number` is 100, the result will be 128.
function smallestPowerOfTwo(number) {
    let result = 1;
    while (result < number) result <<= 1;
    return result;
}

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
    const points = createShader(gl, gl.FRAGMENT_SHADER, pointsShader);
    const matrices = createShader(gl, gl.FRAGMENT_SHADER, matricesShader);
    const sum = createShader(gl, gl.FRAGMENT_SHADER, sumShader);
    const model = createShader(gl, gl.FRAGMENT_SHADER, modelShader);
    const render = createShader(gl, gl.FRAGMENT_SHADER, renderShader);
    return {
        points: linkProgram(gl, canvas, points),
        matrices: linkProgram(gl, canvas, matrices),
        sum: linkProgram(gl, canvas, sum),
        model: linkProgram(gl, canvas, model),
        render: linkProgram(gl, canvas, render),
    };
}

function setupGL(canvasElement) {
    let gl;
    try {
        gl = canvasElement.getContext('webgl2');
    } catch (e) {
        showErrorToUser('Your browser doesn\'t support WebGL2.');
        throw new Error(`Could not create WebGL2 context: ${e}`);
    }
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.lastCreatedTextureId = 0;
    return gl;
}

function initAttributes(gl, programs) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bytesInFloat = 4; // gl.Float
    const posOffset = 0;
    const posItems = 3;
    const texOffset = posItems * bytesInFloat;
    const texItems = 2;
    const stride = (posItems + texItems) * bytesInFloat;
    let program;

    const uploadAttribute = function (name, offset, items) {
        const attrib = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(attrib);
        gl.vertexAttribPointer(attrib, items, gl.FLOAT, false, stride, offset);
    };
    program = programs.points;
    gl.useProgram(program);
    uploadAttribute('inPosition', posOffset, posItems);
    //uploadAttribute('inTexCoord', texOffset, texItems);

    program = programs.matrices;
    gl.useProgram(program);
    uploadAttribute('inPosition', posOffset, posItems);
    //uploadAttribute('inTexCoord', texOffset, texItems);

    program = programs.sum;
    gl.useProgram(program);
    uploadAttribute('inPosition', posOffset, posItems);

    program = programs.model;
    gl.useProgram(program);
    uploadAttribute('inPosition', posOffset, posItems);

    program = programs.render;
    gl.useProgram(program);
    uploadAttribute('inPosition', posOffset, posItems);
}

// Take the parameters returned from `DepthCamera.getCameraCalibration` and
// upload them as uniforms into the shaders.
function initUniforms(gl, programs, textures, parameters, width, height) {
    const intrin = parameters.getDepthIntrinsics(width, height);
    const offsetx = (intrin.offset[0] / width) - 0.5;
    const offsety = (intrin.offset[1] / height) - 0.5;
    const focalx = intrin.focalLength[0] / width;
    const focaly = intrin.focalLength[1] / height;

    let l = 0;
    let program;
    program = programs.points;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube0.glId);
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[0].glId);
    l = gl.getUniformLocation(program, 'previousDepthTexture');
    gl.uniform1i(l, textures.depth[1].glID);
    l = gl.getUniformLocation(program, 'movement');
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, 'depthScale');
    gl.uniform1f(l, parameters.depthScale);
    l = gl.getUniformLocation(program, 'depthFocalLength');
    gl.uniform2f(l, focalx, focaly);
    l = gl.getUniformLocation(program, 'depthOffset');
    gl.uniform2f(l, offsetx, offsety);

    program = programs.matrices;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'crossProductTexture');
    gl.uniform1i(l, textures.points.crossProduct.glId);
    l = gl.getUniformLocation(program, 'normalTexture');
    gl.uniform1i(l, textures.points.normal.glId);
    l = gl.getUniformLocation(program, 'dotAndErrorTexture');
    gl.uniform1i(l, textures.points.dotAndError.glId);

    program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube0.glId);
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[0].glId);
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
    l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube1.glId);
    l = gl.getUniformLocation(program, 'canvasSize');
    gl.uniform2ui(l, gl.canvas.width, gl.canvas.height);
    l = gl.getUniformLocation(program, 'viewMatrix');
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, 'gridUnit');
    gl.uniform1f(l, GRID_UNIT);
}


function fillCubeTexture(gl, texture) {
    const stride = 2;
    const size = CUBE_SIZE * CUBE_SIZE * CUBE_SIZE * stride;
    const data = new Float32Array(size);
    for (let i = 0; i < size; i += stride) {
        data[i] = GRID_UNIT;
        // This has to be bigger than 0, otherwise the shader will divide by 0.
        data[i + 1] = 0.1;
        if (i < CUBE_SIZE*stride*2
            || i > size - CUBE_SIZE*stride*2) {
            data[i] = 0.0;
        }
    }
    texture.upload(gl, data);
}

// Create textures into which the camera output will be stored.
function setupTextures(gl, programs, width, height) {
    // how big the side of each block in the sum shader is
    let blockSize = 4;
    const cube0 = new Texture3D(gl, CUBE_SIZE, gl.RG32F);
    const cube1 = new Texture3D(gl, CUBE_SIZE, gl.RG32F);
    fillCubeTexture(gl, cube0);
    const depth0 = new Texture2D(gl, width, height, gl.R32F);
    const depth1 = new Texture2D(gl, width, height, gl.R32F);
    const matrices = new Texture2D(gl, blockSize*width, blockSize*height, gl.RGBA32F);
    const crossProduct = new Texture2D(gl, width, height, gl.RGBA32F);
    const normal = new Texture2D(gl, width, height, gl.RGBA32F);
    const dotAndError = new Texture2D(gl, width, height, gl.RGBA32F);

    const biggestSize = smallestPowerOfTwo(Math.max(width, height)) >> 1;
    const sum = [];
    for (let size = biggestSize; size > 0; size >>= 1) {
        sum.push(new Texture2D(gl, blockSize*size, blockSize*size, gl.RGBA32F));
    }

    return {
        cube0,
        cube1,
        depth: [depth0, depth1],
        sum,
        matrices,
        points: {
            crossProduct,
            normal,
            dotAndError,
        },
    };
}

function initFramebuffers(gl, programs, textures) {
    function createFramebuffer2D(textureList) {
        const framebuffer = gl.createFramebuffer();
        const drawBuffers = [];
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        for (let i = 0; i < textureList.length; i += 1) {
            const texture = textureList[i];
            drawBuffers.push(gl[`COLOR_ATTACHMENT${i}`]);
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl[`COLOR_ATTACHMENT${i}`],
                gl.TEXTURE_2D,
                texture.texture,
                0, // mip-map level
            );
        }
        gl.drawBuffers(drawBuffers);
        return framebuffer;
    }

    function createFramebuffer3D(texture, zslice) {
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTextureLayer(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            texture.texture,
            0,
            zslice,
        );
        return framebuffer;
    }

    gl.useProgram(programs.points);
    const points = createFramebuffer2D([
        textures.points.crossProduct,
        textures.points.normal,
        textures.points.dotAndError,
    ]);

    gl.useProgram(programs.matrices);
    const matrices = createFramebuffer2D([textures.matrices]);

    gl.useProgram(programs.sum);
    const sum = [];
    for (let i = 0; i < textures.sum.length; i += 1) {
        sum.push(createFramebuffer2D([textures.sum[i]]));
    }

    gl.useProgram(programs.model);
    const cube0 = Array.from(
        Array(CUBE_SIZE).keys(),
        i => createFramebuffer3D(textures.cube0, i),
    );
    const cube1 = Array.from(
        Array(CUBE_SIZE).keys(),
        i => createFramebuffer3D(textures.cube1, i),
    );
    return {
        points,
        matrices,
        sum,
        model: [cube0, cube1],
    };
}

function uploadDepthData(gl, textures, data, width, height, frame) {
    let texture = textures.depth[frame % 2];
    texture.upload(gl, data);
}


function createModel(gl, programs, framebuffers, textures, frame, movement) {
    let transform = movement.slice();
    // mat4.invert(transform, transform);
    // let translate = vec3.fromValues(0, 0, 0.5);
    // vec3.transformMat4(translate, translate, transform);
    // mat4.translate(transform, transform, translate);

    // mat4.invert(transform, transform);
    // let t1 = mat4.create();
    // let t2 = mat4.create();
    // mat4.translate(t1, t1, vec3.fromValues(0, 0, -1));
    // mat4.translate(t2, t2, vec3.fromValues(0, 0, 1));
    // mat4.mul(transform, transform, t1);
    // mat4.mul(transform, t2, transform);

    let l;
    let program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'movement');
    gl.uniformMatrix4fv(l, false, transform);
    l = gl.getUniformLocation(program, 'cubeTexture');
    if (frame % 2 === 0) {
        gl.uniform1i(l, textures.cube0.glId);
    } else {
        gl.uniform1i(l, textures.cube1.glId);
    }
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[frame % 2].glId);
    l = gl.getUniformLocation(program, 'zslice');
    gl.viewport(0, 0, textures.cube0.size, textures.cube0.size);
    for (let zslice = 0; zslice < CUBE_SIZE; zslice += 1) {
        gl.uniform1ui(l, zslice);
        gl.bindFramebuffer(
            gl.FRAMEBUFFER,
            framebuffers.model[(frame + 1) % 2][zslice],
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

function renderModel(gl, programs, textures, frame, canvas) {
    let l;
    let program = programs.render;
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    l = gl.getUniformLocation(program, 'cubeTexture');
    if (frame % 2 === 0) {
        gl.uniform1i(l, textures.cube1.glId);
    } else {
        gl.uniform1i(l, textures.cube0.glId);
    }
    l = gl.getUniformLocation(program, 'viewMatrix');
    gl.uniformMatrix4fv(l, false, getViewMatrix(yaw, pitch, 1.8));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
