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

// How many characters are needed to print a number and that many decimals.
function numberOfDigits(number, decimals) {
    if (decimals === undefined) decimals = 3;
    return number.toFixed(decimals).toString().length;
}

// Convert a flat array of floating point numbers into a string with a pretty
// formated width x height matrix. By default prints 3 decimals. The padding
// argument is optional.
function arrayToStr(array, width, height, decimals, padding) {
    if (array === undefined || array.length != width*height) {
        console.warn("Incorrect usage of arrayToStr");
        return "";
    }
    if (decimals === undefined) decimals = 3;
    let maxDigits = 1;
    if (padding === undefined) {
        for (let i = 0; i < array.length; i++) {
            let digits = numberOfDigits(array[i], decimals);
            if (digits > maxDigits) {
                maxDigits = digits;
            }
        }
    } else {
        maxDigits = padding;
    }
    let str = "<pre>";
    for (let i = 0; i < height; i += 1) {
        for (let j = 0; j < width; j += 1) {
            let tmp = array[i*width + j].toFixed(decimals)
                .toString().padStart(maxDigits);
            if (tmp.length != maxDigits) throw Error("");
            str += tmp + " ";
        }
        str += "\n";
    }
    return str + "</pre>";
}

function array2DToStr(array, decimals) {
    let maxDigits = 1;
    for (let i = 0; i < array.length; i++) {
        for (let j = 0; j < array[i].length; j++) {
            let digits = numberOfDigits(array[i][j], decimals);
            if (digits > maxDigits) {
                maxDigits = digits;
            }
        }
    }
    let str = "";
    for (let i = 0; i < array.length; i++) {
        str += arrayToStr(array[i], array.length, 1, decimals, maxDigits);
    }
    return str;
}


function arraysEqual(array1, array2, epsilon) {
    if (array1 === undefined || array2 === undefined
        || array1.length !== array2.length) {
            console.warn("Incorrect usage of arraysEqual");
            return false;
    }
    if (epsilon === undefined) epsilon = 0.0;
    for (let i = 0; i < array1.length; i++) {
        if (Math.abs(array1[i] - array2[i]) > epsilon) {
            // console.log("Diff in arrays, index ", i, array1[i], array2[i]);
            return false;
        }
    }
    return true;
}

function arrays2DEqual(array1, array2, epsilon) {
    if (array1 === undefined || array2 === undefined
        || array1.length !== array2.length) {
            console.warn("Incorrect usage of arrays2DEqual");
            return false;
        }
    for (let i = 0; i < array1.length; i++) {
        if (!arraysEqual(array1[i], array2[i], epsilon)) {
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

// Given two integer indices i, j, calculate the coordinates on the projection
// plane at z=-1. This means that it will be flipped (projection flips the
// image). The indices i, j start at [0, 0] in the top left corner and point
// down and right. The resulting coordinates start at the center, and point down
// and left. Additionally, 0.5 is added to the indices i and j, so that it is
// more in line with how gl_FragCoord works in shaders. Therefore, for an image
// 100x100, the index [50, 50] will be not converted to [0.0, 0.0], but to
// [0.005, 0.005].
function getCoordFromIndex(i, j, width, height) {
    if (i < 0 || j < 0 || i >= width || j >= height) {
        throw Error("Bad usage of getCoordFromIndex");
    }
    let coordx = -((i + 0.5)/width - 0.5);
    let coordy = ((j + 0.5)/height - 0.5);
    return [coordx, coordy];
}

// Inverse to getCoordFromIndex.
function getIndexFromCoord(coordx, coordy, width, height) {
    let i = Math.round((-coordx + 0.5)*width - 0.5);
    let j = Math.round((coordy + 0.5)*height - 0.5);
    return [i, j];
}
