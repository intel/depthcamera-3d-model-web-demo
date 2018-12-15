// Copyright 2018 Intel Corporation.
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

let width = 200;
let height = 200;
let frame0Transform = getViewMatrix(0, 0, 1.0);
let frame1Transform = getViewMatrix(0, 30, 1.0);
// mat4.translate(frame1Transform, frame1Transform, vec3.fromValues(0.1, 0.1, 0.1));
let knownMovement = getMovement(frame1Transform, frame0Transform);
let knownMovementInv = mat4.create();
mat4.invert(knownMovementInv, knownMovement);
let [frame0, frame0Normals] = createFakeData(width, height, frame0Transform);
let [frame1, frame1Normals] = createFakeData(width, height, frame1Transform);
let cameraParams = createFakeCameraParams(height, width);

class Test {
    constructor(testName) {
        let allTestsDiv = document.getElementById('tests');
        this.div = document.createElement('div');
        allTestsDiv.appendChild(this.div);

        let header = document.createElement('h3');
        let headerText = document.createTextNode(testName);
        header.appendChild(headerText);
        this.div.appendChild(header);

        this.msgDiv = document.createElement('div');
        // show newlines
        this.msgDiv.style.whiteSpace = "pre-wrap";
        this.div.appendChild(this.msgDiv);

        this.canvas = document.createElement('canvas');
        this.canvas.width = 400;
        this.canvas.height = 400;
        this.canvas.style.display = "none";
        this.div.appendChild(this.canvas);
    }
    print(message) {
        this.msgDiv.innerHTML += `${message}<br>`;
    }
    showCanvas() {
        this.canvas.style.display = "block";
    }
    bindMouseToCanvas() {
        this.canvas.onmousedown = handleMouseDown;
        this.canvas.onmouseup = handleMouseUp;
        this.canvas.onmousemove = handleMouseMove;
    }
    check(condition, errorMessage) {
        if (condition === true) {
            this.print("<font color='green'>PASS</font>");
        } else {
            let msg = "<font color='red'>FAIL</font>";
            if (errorMessage !== undefined) {
                msg += ", " + errorMessage;
            }
            this.print(msg);
        }
    }
}

function setupGraphics(canvas) {
    let gl = setupGL(canvas);
    let programs = setupPrograms(gl);
    initAttributes(gl, programs);
    let textures = setupTextures(gl, programs, width, height);
    initUniforms(gl, programs, textures, cameraParams, width, height);
    let framebuffers = initFramebuffers(gl, programs, textures);
    return [gl, programs, textures, framebuffers];
}

function testIndexCoordCoversion() {
    let test = new Test("Test coversion between indices and image coordinates");
    let epsilon = 0.00001;
    let width = 100;
    let height = 100;

    let i = 50;
    let j = 50;
    let expectedx = -0.005;
    let expectedy = 0.005;
    let coordx, coordy;
    [coordx, coordy] = getCoordFromIndex(i, j, width, height);
    test.check(Math.abs(coordx - expectedx) < epsilon
               && Math.abs(coordy - expectedy) < epsilon,
        "The image coordinates were supposed to be ["
        + expectedx + ", " + expectedy + "] but are ["
        + coordx + ", " + coordy + "]");
    let i_, j_;
    [i_, j_] = getIndexFromCoord(coordx, coordy, width, height);
    test.check(i === i_ && j === j_);

    i = 0;
    j = 0;
    expectedx = 0.495;
    expectedy = -0.495;
    coordx, coordy;
    [coordx, coordy] = getCoordFromIndex(i, j, width, height);
    test.check(Math.abs(coordx - expectedx) < epsilon
               && Math.abs(coordy - expectedy) < epsilon,
        "The image coordinates were supposed to be ["
        + expectedx + ", " + expectedy + "] but are ["
        + coordx + ", " + coordy + "]");
    [i_, j_] = getIndexFromCoord(coordx, coordy, width, height);
    test.check(i === i_ && j === j_);

    i = 99;
    j = 99;
    expectedx = -0.495;
    expectedy = 0.495;
    coordx, coordy;
    [coordx, coordy] = getCoordFromIndex(i, j, width, height);
    test.check(Math.abs(coordx - expectedx) < epsilon
               && Math.abs(coordy - expectedy) < epsilon,
        "The image coordinates were supposed to be ["
        + expectedx + ", " + expectedy + "] but are ["
        + coordx + ", " + coordy + "]");
    [i_, j_] = getIndexFromCoord(coordx, coordy, width, height);
    test.check(i === i_ && j === j_);

    i = 20;
    j = 40;
    width = 160;
    height = 180;
    expectedx = 0.371875;
    expectedy = -0.275;
    coordx, coordy;
    [coordx, coordy] = getCoordFromIndex(i, j, width, height);
    test.check(Math.abs(coordx - expectedx) < epsilon
               && Math.abs(coordy - expectedy) < epsilon,
        "The image coordinates were supposed to be ["
        + expectedx + ", " + expectedy + "] but are ["
        + coordx + ", " + coordy + "]");
    [i_, j_] = getIndexFromCoord(coordx, coordy, width, height);
    test.check(i === i_ && j === j_);
}

function testCorrespondingPointCPU() {
    let test = new Test("Test the corresponding points are the same for"
                        + " identical frames");
    let i, j, p, q, n;
    let foundDiff = false;
    let normalsDiff = false;
    for (i = 0; i < width; i++) {
        if (foundDiff) break;
        for (j = 0; j < height; j++) {
            let result = correspondingPoint(frame0,
                frame0, frame0Normals, mat4.create(), i, j);
            if (result.length != 3) continue;
            [p, q, n] = result;
            if (!arraysEqual(p, q, 0.0)) {
                foundDiff = true;
                break;
            }
            let index = (j*frame0Normals.width + i)*frame0Normals.stride;
            let n_ = vec3.fromValues(frame0Normals[index],
                frame0Normals[index+1], frame0Normals[index+2]);
            if (!arraysEqual(n, n_, 0.0)) {
                normalsDiff = true;
            }
        }
    }
    test.check(!foundDiff, "The found corresponding points between identical"
        + " frames were not themselves identical."
        + "\np: " + p
        + "\nq: " + q
        + "\ni, j: " + i + " " + j);
    test.check(!normalsDiff, "The corresponding point algorithm didn't use the"
        + " same pre-computed normal as given.");
}

function testVolumetricModel() {
    let test = new Test("Test volumetric model (visual test only)");
    test.showCanvas();
    test.bindMouseToCanvas();
    test.print("Visual test only. Should show a sphere and a box next to each"
               + " other. It should be a combination of the two input frames"
               + " shown above.");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame1, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, knownMovementInv);
    let animate = function () {
        renderModel(gl, programs, textures, frame, test.canvas);
        window.requestAnimationFrame(animate);
    };
    animate();
}

function testMovementEstimationIdentity() {
    let test = new Test("Test movement estimation with no movement");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    let movement, info;
    [movement, info] = estimateMovement(gl, programs, textures, framebuffers, frame);
    test.check(arraysEqual(movement, mat4.create()),
        "estimated movement is not identity: " + movement);
}

function testMovementEstimation() {
    let test = new Test("Test movement estimation");
    test.showCanvas();
    test.bindMouseToCanvas();
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame1, width, height, frame);
    let movement, info;
    [movement, info] = estimateMovement(gl, programs, textures, framebuffers, frame);
    createModel(gl, programs, framebuffers, textures, frame, movement);

    let animate = function () {
        renderModel(gl, programs, textures, frame, test.canvas);
        window.requestAnimationFrame(animate);
    };
    animate();
}


function testNumberOfUsedPointsSameFrame() {
    // Give identical frames to the motion estimation, first to the CPU version
    // and then the GPU version. Check that the number of corresponding points
    // they found and used is the same.
    let test = new Test("Compare number of used points, same frame");
    let infoCPU;
    [_, infoCPU] = estimateMovementCPU(frame0, frame0, 1);

    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    let infoGPU;
    [_, infoGPU] = estimateMovement(gl, programs, textures, framebuffers, frame);
    test.check(infoGPU["pointsFound"] === infoCPU["pointsFound"],
        "Number of points found in GPU version is different than in CPU"
        + " version.\nGPU version found " + infoGPU["pointsFound"]
        + " non-zero points, while the CPU version found "
        + infoCPU["pointsFound"] + " points.");
    test.check(infoGPU["pointsUsed"] === infoCPU["pointsUsed"],
        "Number of points used in GPU version is different than in CPU"
        + " version.\nGPU version used " + infoGPU["pointsUsed"]
        + " non-zero points, while the CPU version used "
        + infoCPU["pointsUsed"] + " points.");
}

function compareEquationsBetweenVersions() {
    let test = new Test("Compare CPU and GPU versions of movement estimation");
    let infoCPU;
    [_, infoCPU] = estimateMovementCPU(frame1, frame0, 1);

    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame1, width, height, frame);
    let infoGPU;
    [_, infoGPU] = estimateMovement(gl, programs, textures, framebuffers, frame, 1);
    test.check(infoGPU["pointsFound"] === infoCPU["pointsFound"],
        "Number of points found in GPU version is different than in CPU"
        + " version.\nGPU version found " + infoGPU["pointsFound"]
        + " non-zero points, while the CPU version found "
        + infoCPU["pointsFound"] + " points.");
    test.check(infoGPU["pointsUsed"] === infoCPU["pointsUsed"],
        "Number of points used in GPU version is different than in CPU"
        + " version.\nGPU version used " + infoGPU["pointsUsed"]
        + " non-zero points, while the CPU version used "
        + infoCPU["pointsUsed"] + " points.");
    test.check(Math.abs(infoGPU["error"] - infoCPU["error"]) < 0.001,
        "The error in the GPU version (" + infoGPU["error"].toFixed(5)
        + ") is too different from the error in the CPU version("
        + infoCPU["error"].toFixed(5) + ")");
    test.check(arraysEqual(infoGPU["b"], infoCPU["b"], 0.001),
        "The vector b in Ax=b created from the GPU version differs from the one"
        + " created by the CPU version.\nGPU version b = "
        + arrayToStr(infoGPU["b"], 6, 1)
        + "CPU version b = " + arrayToStr(infoCPU["b"], 6, 1));
    test.check(arrays2DEqual(infoGPU["A"], infoCPU["A"], 0.001),
        "The matrix A in Ax=b created from the GPU version differs from the one"
        + " created by the CPU version.\nGPU version A = \n"
        + array2DToStr(infoGPU["A"])
        + "\nCPU version A = \n"
        + array2DToStr(infoCPU["A"]));
    // TODO check how the CPU version looks like if I just deproject/project the
    // point and draw it on screen - it should be identical
    // TODO don't use the round function in the CPU version maybe?
}

function testCPUMovementEstimationIdentity() {
    let test = new Test("Test movement estimation on CPU with no movement");
    let movement;
    [movement, _] = estimateMovementCPU(frame0, frame0, 1, frame0Normals);
    test.check(arraysEqual(movement, mat4.create()),
        "estimated movement is not identity: " + arrayToStr(movement, 4, 4));
}

function testCPUMovementEstimation() {
    let test = new Test("Test Movement Estimation on CPU");
    test.showCanvas();
    test.bindMouseToCanvas();
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let x = mat4.create();
    let movement;
    [movement, _] = estimateMovementCPU(frame0, frame0, 1, frame0Normals,
        // mat4.create());
        knownMovement);
    test.check(arraysEqual(movement, knownMovement, 0.001),
        "Estimated movement is not close enough to actual movement.\n"
        + "Expected:\n"
        + arrayToStr(knownMovement, 4, 4)
        + "Calculated:\n"
        + arrayToStr(movement, 4, 4));

    let frame = 0;
    uploadDepthData(gl, textures, frame0, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    let movementInv = mat4.create();
    mat4.invert(movementInv, movement);
    uploadDepthData(gl, textures, frame1, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, movementInv);
    let animate = function () {
        renderModel(gl, programs, textures, frame, test.canvas);
        window.requestAnimationFrame(animate);
    };
    animate();
}

function compareNormalsVersions() {
    let test = new Test("Compare estimated normals between CPU and GPU"
        + " versions.");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame1, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame1, width, height, frame);

    program = programs.points;
    gl.useProgram(program);
    let l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube[frame%2].glId);
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[frame%2].glId);
    l = gl.getUniformLocation(program, 'previousDepthTexture');
    gl.uniform1i(l, textures.depth[(frame+1)%2].glId);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
    // TODO not sure why this breaks things
    // gl.viewport(0, 0, textures.points.width, textures.points.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    let stride = 4;
    const d = new Float32Array(width*height*stride);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, d);
    d.width = width;
    d.height = height;

    let normalsDiff = false;
    let i, j, normalGPU, normalCPU;
    for (i = 0; i < width; i++) {
        if (normalsDiff) {
            i--;
            break;
        }
        for (j = 0; j < height; j++) {
            let result = correspondingPoint(frame1,
                frame1, undefined, mat4.create(), i, j);
            if (result.length != 3) continue;
            [_, _, normalCPU] = result;
            let index = (j*d.width + i)*stride;
            normalGPU = vec3.fromValues(d[index], d[index+1], d[index+2]);
            if (!arraysEqual(normalCPU, normalGPU, 0.00001)) {
                normalsDiff = true;
                break;
            }
        }
    }
    test.check(!normalsDiff, "There is a difference between the normal"
        + " calculated by the GPU [" + normalGPU + "] and the normal"
        + " calculated by the CPU [" + normalCPU + "], at index i, j: "
        + i + " " + j);
}


function compareCrossProductsVersions() {
    let test = new Test("Compare cross products of corresponding points"
        + "between CPU and GPU versions.");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let frame = 0;
    uploadDepthData(gl, textures, frame1, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame1, width, height, frame);

    program = programs.points;
    gl.useProgram(program);
    let l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube[frame%2].glId);
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[frame%2].glId);
    l = gl.getUniformLocation(program, 'previousDepthTexture');
    gl.uniform1i(l, textures.depth[(frame+1)%2].glId);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
    // TODO not sure why this breaks things
    // gl.viewport(0, 0, textures.points.width, textures.points.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    let stride = 4;
    const d = new Float32Array(width*height*stride);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, d);
    d.width = width;
    d.height = height;

    let crossDiff = false;
    let i, j, p, n, crossGPU, crossCPU;
    for (i = 0; i < width; i++) {
        if (crossDiff) {
            i--;
            break;
        }
        for (j = 0; j < height; j++) {
            let result = correspondingPoint(frame1,
                frame1, undefined, mat4.create(), i, j);
            if (result.length != 3) continue;
            [p, _, n] = result;
            crossCPU = vec3.create();
            vec3.cross(crossCPU, p, n);
            let index = (j*d.width + i)*stride;
            crossGPU = vec3.fromValues(d[index], d[index+1], d[index+2]);
            if (!arraysEqual(crossCPU, crossGPU, 0.00001)) {
                crossDiff = true;
                break;
            }
        }
    }
    test.check(!crossDiff, "There is a difference between the cross product"
        + " calculated by the GPU [" + crossGPU + "] and the cross product"
        + " calculated by the CPU [" + crossCPU + "], at index i, j: "
        + i + " " + j);
}


function testPointsShaderNormals() {
    // Note: the normals won't look right in this kind of test if there is any
    // movement between the frames, because the fragment shader can't move the
    // pixel to another position. This doesn't matter for the actual purpose of
    // the shader, it just can't be visually checked.
    let test = new Test("Test normals in points shader (visual test only)");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);
    let canvas1 = document.createElement('canvas');
    let canvas2 = document.createElement('canvas');
    test.div.appendChild(canvas1);
    test.div.appendChild(canvas2);
    test.print("Visual test only. Should show 2 similar images. The left one is"
               + " precisely generated while the right one is estimated in the"
               + " points shader - it will be a lot more grainy.");

    let frame = 0;
    uploadDepthData(gl, textures, frame1, width, height, frame);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, frame1, width, height, frame);

    program = programs.points;
    gl.useProgram(program);
    let l = gl.getUniformLocation(program, 'cubeTexture');
    gl.uniform1i(l, textures.cube[frame%2].glId);
    l = gl.getUniformLocation(program, 'depthTexture');
    gl.uniform1i(l, textures.depth[frame%2].glId);
    l = gl.getUniformLocation(program, 'previousDepthTexture');
    gl.uniform1i(l, textures.depth[(frame+1)%2].glId);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
    // TODO not sure why this breaks things
    // gl.viewport(0, 0, textures.points.width, textures.points.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    let stride = 4;
    const d = new Float32Array(width*height*stride);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, d);
    d.width = width;
    d.height = height;
    showNormals(canvas1, frame1Normals);
    showNormals(canvas2, d);
}

function testSumShaderSinglePass() {
    // Sum 2x2 blocks of data, where each block is a 5x3 array of vectors. Get
    // a single block of data as a result.
    let test = new Test("Test sum shader single pass");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);

    let width = 2;
    let height = 2;
    // size of each block
    let blockWidth = 5;
    let blockHeight = 3;
    // length of each vector
    let stride = 4;
    // The sum shader starts with some power of two number of blocks and then
    // reduces is to 1/4 of that original size, until only a single block is
    // left. This tests the last stage where 4 blocks are reduced to a single
    // block.
    let sumTextureLevel = framebuffers.sum.length - 2;
    let size = (blockWidth*width)*(blockHeight*height)*stride;
    let fakeData = new Float32Array(size);
    for (let i = 0; i < size; i+=stride) {
        fakeData[i+0] = 1.0;
        fakeData[i+1] = 2.0;
        fakeData[i+2] = 3.0;
    }
    let expectedData = new Float32Array(blockWidth*blockHeight*stride);
    for (let i = 0; i < blockWidth*blockHeight*stride; i+=stride) {
        expectedData[i+0] = 1.0*width*height;
        expectedData[i+1] = 2.0*width*height;
        expectedData[i+2] = 3.0*width*height;
    }
    // upload input data
    let texture = textures.sum[sumTextureLevel];
    texture.upload(gl, fakeData);

    // run sum shader
    sumTextureLevel = framebuffers.sum.length - 1;
    let program = programs.sum;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'inputTexture');
    gl.uniform1i(l, texture.glId);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.sum[sumTextureLevel]);
    gl.viewport(0, 0, textures.sum[sumTextureLevel].width, textures.sum[sumTextureLevel].height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.finish();
    // read back data from shader
    const data = new Float32Array(blockWidth * blockHeight * stride);
    gl.readPixels(0, 0, blockWidth, blockHeight, gl.RGBA, gl.FLOAT, data);
    test.check(arraysEqual(data, expectedData),
        "Summed data from shader don't match expected sum\n"
        + "\nExpected:\n"
        + expectedData
        + "\nActual:\n"
        + data);
}
function testSumShader() {
    // Sum width x height blocks of data, where each block is a 5x3 array of
    // vectors. Get a single block of data as a result.
    let test = new Test("Test sum shader");
    let [gl, programs, textures, framebuffers] = setupGraphics(test.canvas);

    // size of each block
    let blockWidth = 5;
    let blockHeight = 3;
    // length of each vector
    let stride = 4;
    let size = (blockWidth*width)*(blockHeight*height)*stride;
    let fakeData = new Float32Array(size);
    for (let i = 0; i < size; i+=stride) {
        fakeData[i+0] = 1.0;
        fakeData[i+1] = 2.0;
        fakeData[i+2] = 3.0;
    }
    let expectedData = new Float32Array(blockWidth*blockHeight*stride);
    for (let i = 0; i < blockWidth*blockHeight*stride; i+=stride) {
        expectedData[i+0] = 1.0*width*height;
        expectedData[i+1] = 2.0*width*height;
        expectedData[i+2] = 3.0*width*height;
    }
    // upload input data
    let texture = textures.matrices;
    texture.upload(gl, fakeData);

    // run sum shader
    let program = programs.sum;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'inputTexture');
    gl.uniform1i(l, textures.matrices.glId);
    for (let i = 0; i < framebuffers.sum.length; i += 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.sum[i]);
        gl.viewport(0, 0, textures.sum[i].width, textures.sum[i].height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.finish();
        l = gl.getUniformLocation(program, 'inputTexture');
        gl.uniform1i(l, textures.sum[i].glId);
    }
    // read back data from shader
    const data = new Float32Array(blockWidth * blockHeight * stride);
    gl.readPixels(0, 0, blockWidth, blockHeight, gl.RGBA, gl.FLOAT, data);
    test.check(arraysEqual(data, expectedData),
        "Summed data from shader don't match expected sum\n"
        + "\nExpected:\n"
        + expectedData
        + "\nActual:\n"
        + data);
}

function testMain() {
    let data1Canvas = document.getElementById('data1');
    let data2Canvas = document.getElementById('data2');
    let normals1Canvas = document.getElementById('normals1');
    let normals2Canvas = document.getElementById('normals2');
    showDepthData(data1Canvas, frame0);
    showNormals(normals1Canvas, frame0Normals);
    showDepthData(data2Canvas, frame1);
    showNormals(normals2Canvas, frame1Normals);
    try {
        console.log("TESTS\n");
        testIndexCoordCoversion();
        testCorrespondingPointCPU();
        testCPUMovementEstimationIdentity();
        // testCPUMovementEstimation();
        testMovementEstimationIdentity();
        testNumberOfUsedPointsSameFrame();
        compareEquationsBetweenVersions();
        // testMovementEstimation();
        testSumShaderSinglePass();
        testSumShader();
        compareNormalsVersions();
        compareCrossProductsVersions();
        testPointsShaderNormals();
        // This test needs to be last, otherwise there might not be enough GPU
        // memory to create all the resources for all tests (the other tests
        // have their GL context deallocated once they are done, but this one
        // keeps running).
        // testVolumetricModel();
    } catch (e) {
        handleError(e);
    }
}
