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

