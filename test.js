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
mat4.invert(knownMovement, knownMovement);
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
    createModel(gl, programs, framebuffers, textures, frame, knownMovement);
    let animate = function () {
        renderModel(gl, programs, textures, frame);
        window.requestAnimationFrame(animate);
    };
    animate();
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
    let movement = 
        estimateMovementCPU(srcData, destData, destNormals, knownMovement);
    console.log("estimated");
    printMat4(movement);
    console.log("known");
    printMat4(knownMovement);
    if (!matricesEqual(movement, knownMovement, 0.001))
        throw Error("Known movement changed by estimation");
    console.log("PASS Known Movement");
}

function testCPUMovementEstimation() {
    let [_, gl, programs, textures, framebuffers] = 
        setupTest('testCPUMovementEstimationCanvas');
    let x = mat4.create();
    mat4.invert(x, knownMovement);
    let movement = estimateMovementCPU(srcData, destData, destNormals,
        x);
        // mat4.create());
        // knownMovement);
    mat4.invert(movement, movement);
    console.log("expected");
    printMat4(knownMovement);
    console.log("estimation");
    printMat4(movement);

    let frame = 0;
    uploadDepthData(gl, textures, destData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, mat4.create());

    frame = 1;
    uploadDepthData(gl, textures, srcData, width, height);
    createModel(gl, programs, framebuffers, textures, frame, movement);
    let animate = function () {
        renderModel(gl, programs, textures, frame);
        window.requestAnimationFrame(animate);
    };
    animate();
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
        testCPUMovementEstimation();
        // testMovementEstimation();
        testVolumetricModel();
    } catch (e) {
        handleError(e);
    }
}
