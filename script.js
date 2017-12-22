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

function getViewMatrix() {
    const view = mat4.create();
    mat4.translate(view, view, vec3.fromValues(0, 0, 1.8));
    mat4.rotateY(view, view, glMatrix.toRadian(yaw));
    mat4.rotateX(view, view, glMatrix.toRadian(pitch));
    mat4.translate(view, view, vec3.fromValues(0, 0, -1.8));
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

    let gl;
    try {
        gl = canvasElement.getContext('webgl2');
    } catch (e) {
        showErrorToUser('Your browser doesn\'t support WebGL2.');
        throw new Error(`Could not create WebGL2 context: ${e}`);
    }
    const programs = setupPrograms(gl);
    initAttributes(gl, programs);
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');


    let width;
    let height;
    let cameraParams;
    if (USE_FAKE_DATA) {
        width = 10;
        height = 10;
        [fakeData, cameraParams] = createFakeData(width, height, mat3.create());
        depthStreamReady = true;
        colorStreamReady = true;
    } else {
        cameraParams = await setupCamera();
    }


    let frame = 0;
    let textures;
    let framebuffers;
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
            try {
                let source = depthStreamElement;
                if (USE_FAKE_DATA) source = fakeData;
                gl.activeTexture(gl[`TEXTURE${textures.depth.glId()}`]);
                gl.bindTexture(gl.TEXTURE_2D, textures.depth);
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0, // mip-map level
                    0, // x-offset
                    0, // y-offset
                    width,
                    height,
                    gl.RED,
                    gl.FLOAT,
                    source,
                );
            } catch (e) {
                console.error(`Error uploading video to WebGL:
                    ${e.name}, ${e.message}`);
            }

            let l;
            let program;

            program = programs.points;
            gl.useProgram(program);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
            //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            const stride = 4;
            const data2 = new Float32Array(10 * stride);
            gl.readPixels(0, 0, 10, 1, gl.RGBA, gl.FLOAT, data2);
            if (frame === 0) {
                console.log(data2);
            }

            /*program = programs.matrices;
            gl.useProgram(program);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.matrices);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            program = programs.sum;
            gl.useProgram(program);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.sum);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            const data = new Float32Array(5 * 3 * stride);
            gl.readPixels(0, 0, 5, 3, gl.RGBA, gl.FLOAT, data);
            if (frame === 0) {
                console.log(data);
                const error = data[14*stride];
                let A = Array(6);
                let b = new Float32Array(6);
                for (let i = 0; i < 6; i += 1) {
                    A[i] = new Float32Array(6);
                }
                for (let i = 0; i < 6; i += 1) {
                    A[0][i] = data[i*stride];
                    A[1][i] = data[i*stride + 1];
                    A[2][i] = data[i*stride + 2];
                    A[3][i] = data[(i+6)*stride];
                    A[4][i] = data[(i+6)*stride + 1];
                    A[5][i] = data[(i+6)*stride + 2];
                }
                for (let i = 0; i < 3; i += 1) {
                    b[i] = data[12*stride + i]
                    b[i + 3] = data[13*stride + i]
                }
                console.log("error: ", error);
                console.log("A: ", A);
                console.log("b: ", b);
                const result = numeric.solve(A, b);
                console.log(result);
                let movement = mat4.create();
                mat4.rotateX(movement, movement, result[0]);
                mat4.rotateY(movement, movement, result[1]);
                mat4.rotateZ(movement, movement, result[2]);
                mat4.translate(movement, movement,
                               vec3.fromValues(result[3], result[4], result[5]));
                console.log(movement);
            }

            //window.requestAnimationFrame(animate);
            //frame += 1;
            //return;
            program = programs.model;
            gl.useProgram(program);
            l = gl.getUniformLocation(program, 'cubeTexture');
            if (frame % 2 === 0) {
                gl.uniform1i(l, textures.cube0.glId());
            } else {
                gl.uniform1i(l, textures.cube1.glId());
            }
            l = gl.getUniformLocation(program, 'zslice');
            for (let zslice = 0; zslice < CUBE_SIZE; zslice += 1) {
                gl.uniform1ui(l, zslice);
                gl.bindFramebuffer(
                    gl.FRAMEBUFFER,
                    framebuffers.model[(frame + 1) % 2][zslice],
                );
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
            program = programs.render;
            gl.useProgram(program);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            l = gl.getUniformLocation(program, 'cubeTexture');
            if (frame % 2 === 0) {
                gl.uniform1i(l, textures.cube1.glId());
            } else {
                gl.uniform1i(l, textures.cube0.glId());
            }
            l = gl.getUniformLocation(program, 'viewMatrix');
            gl.uniformMatrix4fv(l, false, getViewMatrix());
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
*/
            frame += 1;
        }
        window.requestAnimationFrame(animate);
    };
    animate();
}

function main() {
    doMain().catch(handleError);
}
