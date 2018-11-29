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

// True if the mouse is currently pressed down.
let mouseDown = false;
// Last position of the mouse when it was pressed down.
let lastMousePositionX = 0;
let lastMousePositionY = 0;
// Rotation of the model in degrees.
// https://en.wikipedia.org/wiki/Yaw_%28rotation%29
let yaw = 0;
let pitch = 0;

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

function mat4ToStr(mat) {
    let str = "";
    for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 4; j += 1) {
            let tmp = mat[j*4 + i].toFixed(3);
            if (tmp >= 0) str += " ";
            str += tmp + " ";
        }
        str += "\n";
    }
    return str;
}


function arraysEqual(array1, array2, epsilon) {
    if (array1.length !== array2.length)
        return false;
    if (epsilon === undefined) epsilon = 0.0;
    for (let i = 0; i < array1.length; i++) {
        if (Math.abs(array1[i] - array2[i]) > epsilon) {
            console.log("Diff in arrays, index ", i, array1[i], array2[i]);
            return false;
        }
    }
    return true;
}

function matrixIsSymmetric(A, epsilon) {
    if (epsilon === undefined) epsilon = 0.001;
    const AA = numeric.transpose(A);
    return arraysEqual(A, AA, epsilon);
}

// Verify that Ax = b, at least approximately.
function equationSolutionIsValid(A, x, b, epsilon) {
    // This seems to freeze the browser, so let's multiply manually
    // const Ax = numeric.mul(A, x);
    const Ax = new Float32Array(6);
    for (i = 0; i < b.length; i += 1) {
        Ax[i] = 0.0;
        for (j = 0; j < b.length; j += 1) {
            Ax[i] += A[i][j]*x[j];
        }
    }
    return arraysEqual(Ax, b, epsilon);
}

