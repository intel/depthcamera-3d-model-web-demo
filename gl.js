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

const CUBE_SIZE = 128;
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
    l = gl.getUniformLocation(program, 'sourceDepthTexture');
    gl.uniform1i(l, textures.depth[0].glId());
    l = gl.getUniformLocation(program, 'destDepthTexture');
    gl.uniform1i(l, textures.depth[1].glId());
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
    gl.uniform1i(l, textures.points.crossProduct.glId());
    l = gl.getUniformLocation(program, 'normalTexture');
    gl.uniform1i(l, textures.points.normal.glId());
    l = gl.getUniformLocation(program, 'dotAndErrorTexture');
    gl.uniform1i(l, textures.points.dotAndError.glId());

    program = programs.model;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube0.glId());
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[0].glId());
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
    gl.uniform1i(l, textures.cube1.glId());
    l = gl.getUniformLocation(program, 'canvasSize');
    gl.uniform2ui(l, gl.canvas.width, gl.canvas.height);
    l = gl.getUniformLocation(program, 'viewMatrix');
    gl.uniformMatrix4fv(l, false, mat4.create());
    l = gl.getUniformLocation(program, 'gridUnit');
    gl.uniform1f(l, GRID_UNIT);
}


function fillCubeTexture(gl, texture) {
    gl.activeTexture(gl[`TEXTURE${texture.glId()}`]);
    gl.bindTexture(gl.TEXTURE_3D, texture);
    const stride = 2;
    const size = CUBE_SIZE * CUBE_SIZE * CUBE_SIZE * stride;
    const data = new Float32Array(size);
    for (let i = 0; i < size; i += stride) {
        data[i] = GRID_UNIT;
        // This has to be bigger than 0, otherwise the shader will divide by 0.
        data[i + 1] = 0.1;
    }

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
        data,
    );
}

// Create textures into which the camera output will be stored.
function setupTextures(gl, programs, width, height) {
    let lastTextureId = 0;
    function createTexture3D() {
        gl.activeTexture(gl[`TEXTURE${lastTextureId}`]);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, texture);
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
        const texId = lastTextureId;
        texture.glId = function () {
            return texId;
        };
        lastTextureId += 1;
        return texture;
    }

    function createTexture2D(format, w, h) {
        gl.activeTexture(gl[`TEXTURE${lastTextureId}`]);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texStorage2D(
            gl.TEXTURE_2D,
            1, // number of mip-map levels
            format, // internal format
            w,
            h,
        );
        const texId = lastTextureId;
        texture.glId = function () {
            return texId;
        };
        lastTextureId += 1;
        return texture;
    }

    const cube0 = createTexture3D();
    const cube1 = createTexture3D();
    fillCubeTexture(gl, cube0);
    const depth0 = createTexture2D(gl.R32F, width, height);
    const depth1 = createTexture2D(gl.R32F, width, height);
    const matrices = createTexture2D(gl.RGBA32F, 5*width, 3*height);
    const crossProduct = createTexture2D(gl.RGBA32F, width, height);
    const normal = createTexture2D(gl.RGBA32F, width, height);
    const dotAndError = createTexture2D(gl.RGBA32F, width, height);

    const biggestSize = smallestPowerOfTwo(Math.max(width, height)) >> 1;
    const sum = [];
    for (let size = biggestSize; size > 0; size >>= 1) {
        sum.push(createTexture2D(gl.RGBA32F, 5*size, 3*size));
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
                texture,
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
            texture,
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


function createFakeData(width, height, transform) {
    function fakeSphere(x, y) {
        const r = 0.1;
        const tmp = (r*r) - (x*x) - (y*y);
        if (tmp < 0.0) return 0.0;
        let z = -Math.sqrt(tmp);
        z += 0.5; // center it at (0, 0, 0.5)
        return z;
    }

    const cameraParams = {
        depthScale: 1.0,
        getDepthIntrinsics(_, __) {
            return {
                offset: [width/2.0, height/2.0],
                focalLength: [width, height],
            };
        },
    };

    const data = new Float32Array(width*height);
    for (let i = 0; i < width * height; i += 1) {
        data[i] = 0.0;
    }
    for (let i = 0; i < width; i += 1) {
        for (let j = 0; j < height; j += 1) {
            // project points between (-0.1, -0.1) and (0.1, 0.1), sphere won't
            // be any bigger anyway
            const x = ((i/width) - 0.5)/5.0;
            const y = ((j/height) - 0.5)/5.0;
            const z = fakeSphere(x, y);
            if (z === 0) continue;
            const position = vec4.fromValues(x, y, z, 1.0);
            vec4.transformMat4(position, position, transform);

            const xx = position[0]/position[2];
            const yy = position[1]/position[2];
            const ii = Math.floor((xx + 0.5)*width);
            const jj = Math.floor((yy + 0.5)*height);
            if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue;
            data[ii + (width*jj)] = position[2];
        }
    }

    return [data, cameraParams];
}
