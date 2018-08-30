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
let transform = getViewMatrix(0, 0, 1.0);
let transform2 = getViewMatrix(0, 30, 1.0);
// mat4.translate(transform2, transform2, vec3.fromValues(0.1, 0.1, 0.1));
let knownMovement = getMovement(transform2, transform);
let knownMovementInv = mat4.create();
mat4.invert(knownMovementInv, knownMovement);
let [destData, destNormals] = createFakeData(width, height, transform);
let [srcData, srcNormals] = createFakeData(width, height, transform2);
let cameraParams = createFakeCameraParams(height, width);

function setupTest(canvas) {
    let webglCanvas = document.getElementById(canvas);
    webglCanvas.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;
    let gl = setupGL(webglCanvas);
    let programs = setupPrograms(gl);
    initAttributes(gl, programs);
    let textures = setupTextures(gl, programs, width, height);
    initUniforms(gl, programs, textures, cameraParams, width, height);
    let framebuffers = initFramebuffers(gl, programs, textures);
    return [webglCanvas, gl, programs, textures, framebuffers];
}

function testVolumetricModel() {
    let [_, gl, programs, textures, framebuffers] = 
        setupTest('testVolumetricModelCanvas');
    let frame = 0;
    uploadDepthData(gl, textures, destData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, srcData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, knownMovementInv);
    let animate = function () {
        renderModel(gl, programs, textures, frame);
        window.requestAnimationFrame(animate);
    };
    animate();
}

function testMovementEstimationIdentity() {
    let [_, gl, programs, textures, framebuffers] = 
        setupTest('testMovementEstimationIdentityCanvas');
    let frame = 0;
    uploadDepthData(gl, textures, destData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, destData, width, height);
    let movement =
        estimateMovement(gl, programs, textures, framebuffers, frame);
    console.log("movement: ", movement);
}

function testMovementEstimation() {
    let [_, gl, programs, textures, framebuffers] = 
        setupTest('testMovementEstimationCanvas');
    let frame = 0;
    uploadDepthData(gl, textures, destData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, srcData, width, height);
    let movement =
        estimateMovement(gl, programs, textures, framebuffers, frame);
    console.log(movement);
    createModel(gl, programs, framebuffers, textures, frame, movement);

    let animate = function () {
        renderModel(gl, programs, textures, frame);
        window.requestAnimationFrame(animate);
    };
    animate();
}

function testCPUMovementEstimationIdentity() {
    let movement = estimateMovementCPU(destData, destData, destNormals, false);
    let identity = mat4.create();
    if (!matricesEqual(movement, identity, 0.0))
        throw Error("Same data don't produce an estimation of I");
    console.log("PASS Identity");
}

function testCPUMovementEstimationKnownMovement() {
    // let movement = 
    //     estimateMovementCPU(srcData, destData, destNormals, knownMovement);
    // console.log("estimated");
    // printMat4(movement);
    // console.log("known");
    // printMat4(knownMovement);
    // if (!matricesEqual(movement, knownMovement, 0.001))
    //     throw Error("Known movement changed by estimation");
    // console.log("PASS Known Movement");
}

function testCPUMovementEstimation() {
    let [_, gl, programs, textures, framebuffers] = 
        setupTest('testCPUMovementEstimationCanvas');
    let x = mat4.create();
    let movement = estimateMovementCPU(srcData, destData, destNormals,
        // mat4.create());
        knownMovement);
    console.log("expected");
    printMat4(knownMovement);
    console.log("estimation");
    printMat4(movement);

    let frame = 0;
    uploadDepthData(gl, textures, destData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    let movementInv = mat4.create();
    mat4.invert(movementInv, movement);
    uploadDepthData(gl, textures, srcData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, movementInv);
    let animate = function () {
        renderModel(gl, programs, textures, frame);
        window.requestAnimationFrame(animate);
    };
    animate();
}

function testPointsShaderNormals() {
    // Note: the normals won't look right in this kind of test if there is any
    // movement between the frames, because the fragment shader can't move the
    // pixel to another position. This doesn't matter for the actual purpose of
    // the shader, it just can't be visually checked.
    let [_, gl, programs, textures, framebuffers] = 
        setupTest('testPointsShaderNormalsCanvas');
    let canvas1 = document.getElementById('testPointsShaderNormalsCanvas1');
    let canvas2 = document.getElementById('testPointsShaderNormalsCanvas2');
    let frame = 0;
    uploadDepthData(gl, textures, destData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, destData, width, height);
    program = programs.points;
    gl.useProgram(program);
    let l = gl.getUniformLocation(program, 'cubeTexture');
    if (frame % 2 === 0) {
        gl.uniform1i(l, textures.cube0.glId());
    } else {
        gl.uniform1i(l, textures.cube1.glId());
    }
    let movement = mat4.create();
    l = gl.getUniformLocation(program, 'movement');
    gl.uniformMatrix4fv(l, false, movement);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const d = new Float32Array(4*width*height);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, d);
    let i = 150;
    let j = 130;
    let flat = (j*height+i)*4;
    console.log("data from points shader", i, j, ": ",
        d[flat], d[flat+1], d[flat+2]);
    d.width = width;
    d.height = height;
    showNormals(canvas1, destNormals);
    showNormals(canvas2, d);
}


function testMain() {
    let data1Canvas = document.getElementById('data1');
    let data2Canvas = document.getElementById('data2');
    let normals1Canvas = document.getElementById('normals1');
    let normals2Canvas = document.getElementById('normals2');
    showDepthData(data1Canvas, destData);
    showNormals(normals1Canvas, destNormals);
    showDepthData(data2Canvas, srcData);
    showNormals(normals2Canvas, srcNormals);
    try {
        // testCPUMovementEstimationIdentity();
        // testCPUMovementEstimationKnownMovement();
        // testCPUMovementEstimation();
        // testMovementEstimationIdentity();
        // testMovementEstimation();
        testVolumetricModel();
        testPointsShaderNormals();
    } catch (e) {
        handleError(e);
    }
}
