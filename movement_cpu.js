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

// CPU implementation of the ICP algorithm, described in movement.js and
// accompanied shaders. This CPU version is used only for testing (comparing
// results between the GPU and CPU version).

function deproject(data, coordx, coordy) {
    let i = Math.round(-coordx*data.width + data.width/2.0);
    let j = Math.round(coordy*data.height + data.height/2.0);
    let debug = (i == data.width/2 && j == data.height/2);
    // let debug = (i == 150 && j==150);
    let depth = data[j*data.width + i];
    if (isNaN(depth))
        return vec3.create();
    let resultx = - coordx*depth;
    let resulty = - coordy*depth;
    if (debug) {
        // console.log("i j: ", i, j);
        // console.log("coord: ", coordx, coordy);
        // console.log("depth: ", depth);
    }
    return vec3.fromValues(resultx, resulty, depth);
}

function project(position) {
    if (position[2] === 0.0)
        throw Error("Trying to project invalid data");
    let coordx = - position[0]/position[2];
    let coordy = - position[1]/position[2];
    return [coordx, coordy];
}

function getNormal(normals, coordx, coordy, debug) {
    let i = Math.round(-coordx*normals.width + normals.width/2.0);
    let j = Math.round(coordy*normals.height + normals.height/2.0);
    let index = (j*normals.width + i)*normals.stride;
    let nx = normals[index];
    let ny = normals[index+1];
    let nz = normals[index+2];
    if (debug) {
        // console.log(i, j);
        // console.log(coordx, coordy);
        // console.log("normal in ICP", nx, ny, nz);
    }
    return vec3.fromValues(nx, ny, nz);
}

function correspondingPoint(srcDepth, destDepth, destNormals, movement, i, j) {
    // let debug = (i == srcDepth.width/2 && j == srcDepth.height/2);
    // let debug = (i == 150 && j == 150);
    let debug = (i == 150 && j == 130);
    let coordx = -(i - srcDepth.width/2.0)/srcDepth.width;
    let coordy = (j - srcDepth.height/2.0)/srcDepth.height;
    if (debug) {
        // console.log(coordx, coordy);
    }
    let sourcePosition = deproject(srcDepth, coordx, coordy);
    if (debug) {
        console.log("coord: ", coordx, coordy);
    }
    if (sourcePosition[2] === 0.0) return [];
    if (debug) {
        console.log("src position: ", sourcePosition);
    }
    vec3.transformMat4(sourcePosition, sourcePosition, movement);
    let [destCoordx, destCoordy] = project(sourcePosition);
    let destPosition = deproject(destDepth, destCoordx, destCoordy);
    if (destPosition[2] === 0.0) return [];
    let destNormal = getNormal(destNormals, destCoordx, destCoordy, debug);
    if (debug) {
        // console.log("coord: ", coordx, coordy);
        console.log("trans src position: ", sourcePosition);
        console.log("dest coord: ", destCoordx, destCoordy);
        console.log("dest position: ", destPosition);
        console.log("dest normal: ", destNormal);
    }
    if (isNaN(sourcePosition[0]) || isNaN(destPosition[0])) {
        console.log("got NaN at index ", i, j);
        console.log("source position ", sourcePosition);
        console.log("dest position ", destPosition);
        console.log("dest coord ", destCoordx, destCoordy);
        throw Error("One of the results is NaN");
    }
    return [sourcePosition, destPosition, destNormal];
}

function createLinearEqOnCPU(srcDepth, destDepth, destNormals, movement) {
    let error = 0;
    let A = Array(6);
    let b = new Float32Array(6);
    for (let i = 0; i < 6; i += 1) {
        A[i] = new Float32Array(6);
    }
    let pointsUsed = 0;
    for (let i = 0; i < srcDepth.width; i += 1) {
        for (let j = 0; j < srcDepth.height; j += 1) {
            let result = correspondingPoint(srcDepth,
                destDepth, destNormals, movement, i, j);
            if (result.length != 3) continue;
            let [p, q, n] = result;
            let c = vec3.create();
            let debug = (i == srcDepth.width/2 && j == srcDepth.height/2);
            // console.log("x", p, q, n);
            pointsUsed += 1;
            vec3.cross(c, p, n);
            let diff = vec3.create();
            vec3.sub(diff, p, q);
            let dot = vec3.dot(diff, n);
            error += Math.pow(dot, 2);
            for (let k = 0; k < 6; k += 1) {
                for (let l = 0; l < 6; l += 1) {
                    let first = l < 3 ? c : n;
                    let second = k < 3 ? c : n;
                    A[k][l] += first[k % 3]*second[l % 3];
                    if (debug) {
                        // console.log(k%3, l%3);
                    }
                }
            }
            b[0] += c[0]*dot;
            b[1] += c[1]*dot;
            b[2] += c[2]*dot;
            b[3] += n[0]*dot;
            b[4] += n[1]*dot;
            b[5] += n[2]*dot;
                    // A_ <<   c[0]*c[0], c[0]*c[1], c[0]*c[2], c[0]*n[0], c[0]*n[1], c[0]*n[2],
                    //         c[1]*c[0], c[1]*c[1], c[1]*c[2], c[1]*n[0], c[1]*n[1], c[1]*n[2],
                    //         c[2]*c[0], c[2]*c[1], c[2]*c[2], c[2]*n[0], c[2]*n[1], c[2]*n[2],
                    //         n[0]*c[0], n[0]*c[1], n[0]*c[2], n[0]*n[0], n[0]*n[1], n[0]*n[2],
                    //         n[1]*c[0], n[1]*c[1], n[1]*c[2], n[1]*n[0], n[1]*n[1], n[1]*n[2],
                    //         n[2]*c[0], n[2]*c[1], n[2]*c[2], n[2]*n[0], n[2]*n[1], n[2]*n[2];
        }
    }
    console.log("points used: ", pointsUsed);
    console.log("relative error: ", error/pointsUsed);
    const det = numeric.det(A);
    if (Number.isNaN(det) || Math.abs(1.0 - det) < 1e-15) {
        throw Error("Invalid determinant of A");
    }
    if (!matrixIsSymmetric(A, 0.001)) {
        throw Error("A is not symmetric");
    }
    // TODO the 4th argument will be pointsFound which includes points for which
    // it couldn't find the normal, but right now the normals are given so they
    // are equal
    return [A, b, error, pointsUsed, pointsUsed];
}

function estimateMovementCPU(srcData, destData, destNormals, initialMovement) {
    let info = {
        "steps": 0,
        "success": true,
        "error": 0.0,
        "pointsFound": 0,
        "pointsUsed": 0,
    };
    let movement = initialMovement ? initialMovement.slice() : mat4.create();
    let previousError = 0;
    for (let step = 0; step < 1; step += 1) {
        let [A, b, error, pointsFound, pointsUsed] = 
                createLinearEqOnCPU(srcData, destData, destNormals, movement);
        // if (Math.abs(error - previousError) < ERROR_DIFF_THRESHOLD) {
        //     break;
        // }
        let x = numeric.solve(A, b);
        if (Number.isNaN(x[0])) {
            throw Error('No corresponding points between frames found.');
        }
        mat4.mul(movement, constructMovement(x), movement);
        // mat4.mul(movement, movement, constructMovement(x));
        previousError = error;
        console.log("step ", step, ", error ", error);
        info["error"] = error;
        info["steps"] = step+1;
        info["pointsFound"] = pointsFound;
        info["pointsUsed"] = pointsUsed;

        if (!equationSolutionIsValid(A, x, b, 0.0001)) {
            throw Error("Ax = b is too imprecise")
        }
    }
    return [movement, info];
}
