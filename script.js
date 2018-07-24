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

// True if the mouse is currently pressed down.
let mouseDown = false;
// Last position of the mouse when it was pressed down.
let lastMousePositionX = 0;
let lastMousePositionY = 0;
// Rotation of the model in degrees.
// https://en.wikipedia.org/wiki/Yaw_%28rotation%29
let yaw = 0;
let pitch = 0;

const USE_FAKE_DATA = true;

// Use this for displaying errors to the user. More details should be put into
// `console.error` messages.
function showErrorToUser(message) {
    const div = document.getElementById('errormessages');
    div.innerHTML += `${message} </br>`;
}

function handleError(error) {
    console.error(error);
    showErrorToUser(error.name ? `${error.name}: ${error.message}` : error);
}

function handleMouseDown(event) {
    mouseDown = true;
    lastMousePositionX = event.clientX;
    lastMousePositionY = event.clientY;
}

function handleMouseUp(event) {
    mouseDown = false;
    lastMousePositionX = event.clientX;
    lastMousePositionY = event.clientY;
}

// Limit the `value` to be between `min` and `max`.
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function handleMouseMove(event) {
    if (!mouseDown) {
        return;
    }
    yaw = clamp(yaw - (event.clientX - lastMousePositionX), -120, 120);
    pitch = clamp(pitch + (event.clientY - lastMousePositionY), -80, 80);
    lastMousePositionX = event.clientX;
    lastMousePositionY = event.clientY;
}

// zcenter is the displacement of the camera from the center, a reasonable value
// would be 1.0.
function getViewMatrix(yaw_degrees, pitch_degrees, zcenter) {
    const view = mat4.create();
    mat4.rotateY(view, view, glMatrix.toRadian(yaw_degrees));
    mat4.rotateX(view, view, glMatrix.toRadian(pitch_degrees));
    mat4.translate(view, view, vec3.fromValues(0, 0, -zcenter));
    return view;
}


// Returns the calibration data.
async function setupCamera() {
    const [depthStream, colorStream] = await DepthCamera.getStreams();
    const video = document.getElementById('colorStream');
    video.srcObject = colorStream;
    const depthVideo = document.getElementById('depthStream');
    depthVideo.srcObject = depthStream;
    return DepthCamera.getCameraCalibration(depthStream);
}

async function doMain() {
    const canvasElement = document.getElementById('webglcanvas');
    canvasElement.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;

    const colorStreamElement = document.getElementById('colorStream');
    const depthStreamElement = document.getElementById('depthStream');
    let colorStreamReady = false;
    let depthStreamReady = false;
    colorStreamElement.oncanplay = function () { colorStreamReady = true; };
    depthStreamElement.oncanplay = function () { depthStreamReady = true; };

    const gl = setupGL(canvasElement);
    const programs = setupPrograms(gl);
    initAttributes(gl, programs);

    let width;
    let height;
    let cameraParams;
    if (USE_FAKE_DATA) {
        width = 200;
        height = 200;
        let transform = getViewMatrix(0, 30, 1.0);
        let transform2 = getViewMatrix(-5, 30, 1.0);
        cameraParams = createFakeCameraParams(height, width);
        [fakeData, _] = createFakeData(width, height, transform);
        [fakeData2, __] = createFakeData(width, height, transform2);
        depthStreamReady = true;
        colorStreamReady = true;
    } else {
        cameraParams = await setupCamera();
    }


    let frame = 0;
    let textures;
    let framebuffers;
    let globalMovement = mat4.create();
    // Run for each frame. Will do nothing if the camera is not ready yet.
    const animate = function () {
        if (depthStreamReady && colorStreamReady) {
            if (frame === 0) {
                if (!USE_FAKE_DATA) {
                    width = depthStreamElement.videoWidth;
                    height = depthStreamElement.videoHeight;
                }
                textures = setupTextures(gl, programs, width, height);
                initUniforms(gl, programs, textures, cameraParams, width, height);
                framebuffers = initFramebuffers(gl, programs, textures);
            }
            // if (frame < 2) {
            if (true) {
            let source = depthStreamElement;
            if (USE_FAKE_DATA) {
                source = fakeData;
                if (frame >= 1) source = fakeData2;
            }
            uploadDepthData(gl, textures, source, width, height);

            const movement = estimateMovement(
                gl,
                programs,
                textures,
                framebuffers,
                frame,
            );
            mat4.mul(globalMovement, movement, globalMovement);
            console.log(movement);
            console.log("");

            }
            createModel(gl, programs, framebuffers, textures, frame,
                        globalMovement);
            renderModel(gl, programs, textures, frame);
            frame += 1;
        }
        window.requestAnimationFrame(animate);
    };
    animate();
}

function main() {
    doMain().catch(handleError);
}
