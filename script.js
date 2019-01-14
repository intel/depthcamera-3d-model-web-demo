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


const USE_FAKE_DATA = false;


// Returns the calibration data.
async function setupCamera() {
    let depthStream = await DepthCamera.getDepthStream();
    const depthVideo = document.getElementById('depthStream');
    depthVideo.srcObject = depthStream;
    return DepthCamera.getCameraCalibration(depthStream);
}

async function doMain() {
    const canvasElement = document.getElementById('webglcanvas');
    canvasElement.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;

    const depthStreamElement = document.getElementById('depthStream');
    let depthStreamReady = false;
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
    } else {
        cameraParams = await setupCamera();
    }


    let frame = 0;
    let textures;
    let framebuffers;
    let globalMovement = mat4.create();
    // Run for each frame. Will do nothing if the camera is not ready yet.
    const animate = function () {
        if (depthStreamReady) {
            if (frame === 0) {
                if (!USE_FAKE_DATA) {
                    width = depthStreamElement.videoWidth;
                    height = depthStreamElement.videoHeight;
                }
                textures = setupTextures(gl, programs, width, height);
                initUniforms(gl, programs, textures, cameraParams, width, height);
                framebuffers = initFramebuffers(gl, programs, textures);
            }
            let source = depthStreamElement;
            if (USE_FAKE_DATA) {
                source = fakeData;
                if (frame >= 1) source = fakeData2;
            }
            uploadDepthData(gl, textures, source, width, height, frame);

            try {
                let movement, info;
                [movement, info] = estimateMovement(
                    gl,
                    programs,
                    textures,
                    framebuffers,
                    frame,
                );
                mat4.mul(globalMovement, movement, globalMovement);
                let globalMovementInv = mat4.create();
                mat4.invert(globalMovementInv, globalMovement);
                createModel(gl, programs, framebuffers, textures, frame,
                    globalMovementInv);
            } catch(e) {
                console.warn("Ignoring frame ", frame);
            }
            renderModel(gl, programs, textures, frame, canvasElement);
            frame += 1;
        }
        window.requestAnimationFrame(animate);
    };
    animate();
}

function main() {
    doMain().catch(handleError);
}
