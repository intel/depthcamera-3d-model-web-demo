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

// If you change this, update it in shaders/points-fshader.js too.
const MAX_DISTANCE = 0.1;

function deproject(data, coordx, coordy, debug) {
    let i, j;
    [i, j] = getIndexFromCoord(coordx, coordy, data.width, data.height);
    let depth = data[j*data.width + i];
    if (isNaN(depth))
        return vec3.create();
    let resultx = - coordx*depth;
    let resulty = - coordy*depth;
    if (debug) {
        // console.log("in deproject");
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

function estimateNormalPointCloud(data, coordx, coordy, debug) {
    let zero = vec3.fromValues(0,0,0);
    let position = deproject(data, coordx, coordy);
    let texStepx = 1.0/data.width;
    let texStepy = 1.0/data.height;
    if (coordx + texStepx >= 0.5 || coordy + texStepy >= 0.5) {
        return zero;
    }
    let positionRight = deproject(data, coordx + texStepx, coordy);
    let positionTop = deproject(data, coordx, coordy + texStepy);
    if (arraysEqual(positionRight, zero) || arraysEqual(positionTop, zero)) {
        return zero;
    }
    let normal = vec3.create();
    let tmp1 = vec3.create();
    let tmp2 = vec3.create();
    vec3.sub(tmp1, positionTop, position);
    vec3.sub(tmp2, positionRight, position);
    vec3.cross(normal, tmp1, tmp2);
    vec3.normalize(normal, normal);
    return normal;
}

function getPrecomputedNormal(normals, coordx, coordy, debug) {
    let i, j;
    [i, j] = getIndexFromCoord(coordx, coordy, normals.width, normals.height);
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

function correspondingPointBruteForce(srcDepth, destDepth, destNormals, movement, i, j) {
    // let debug = (i == srcDepth.width/2 && j == srcDepth.height/2);
    // let debug = (i == 150 && j == 130);
    let debug = (i == 60 && j == 92);

    let coordx, coordy;
    [coordx, coordy] = getCoordFromIndex(i, j, width, height);
    let sourcePosition = deproject(srcDepth, coordx, coordy, debug);
    if (sourcePosition[2] === 0.0) return [];
    vec3.transformMat4(sourcePosition, sourcePosition, movement);
    let closestDestPosition = vec3.fromValues(10000, 10000, 10000);
    // for (let k = Math.max(0, i-20); k < Math.min(srcDepth.width, i+20); k++) {
    //     for (let l = Math.max(0, j-40); l < Math.min(srcDepth.height, j+40); l++) {
    for (let k = Math.max(0, i-20); k < Math.min(srcDepth.width, i+20); k++) {
        for (let l = 0; l < srcDepth.height; l++) {
            let [destCoordx, destCoordy] = getCoordFromIndex(k, l, width, height);
            let destPosition = deproject(destDepth, destCoordx, destCoordy, debug);
            if (destPosition[2] === 0.0) continue;
            if (vec3.distance(sourcePosition, destPosition) <
                vec3.distance(sourcePosition, closestDestPosition)) {
                    closestDestPosition = destPosition.slice();
            }
        }
    }
    let [destCoordx, destCoordy] = project(closestDestPosition);
    let destNormal;
    if (destNormals === undefined) {
        destNormal = estimateNormalPointCloud(destDepth, destCoordx, destCoordy, debug);
    } else {
        destNormal = getPrecomputedNormal(
            destNormals, destCoordx, destCoordy, debug);
    }
    if (debug) {
        // console.log("in correspondingPoint");
        // console.log("coord: ", coordx, coordy);
        // console.log("trans src position: ", sourcePosition);
        // console.log("dest coord: ", destCoordx, destCoordy);
        // console.log("dest position: ", closestDestPosition);
        // console.log("dest normal: ", destNormal);
    }
    if (isNaN(sourcePosition[0]) || isNaN(closestDestPosition[0])) {
        console.log("got NaN at index ", i, j);
        console.log("source position ", sourcePosition);
        console.log("dest position ", closestDestPosition);
        console.log("dest coord ", destCoordx, destCoordy);
        throw Error("One of the results is NaN");
    }
    return [sourcePosition, closestDestPosition, destNormal];
}

// Return [srcPoint, destPoint, normal], where the points will be reasonably
// close to each other. The normal will be zero if it couldn't be calculated for
// these points of is some other condition didn't pass.
function correspondingPoint(srcDepth, destDepth, destNormals, movement, i, j) {
    // let debug = (i == srcDepth.width/2 && j == srcDepth.height/2);
    // let debug = (i == 150 && j == 130);
    let debug = (i == 60 && j == 92);

    let coordx, coordy;
    [coordx, coordy] = getCoordFromIndex(i, j, width, height);
    let sourcePosition = deproject(srcDepth, coordx, coordy, debug);
    if (sourcePosition[2] === 0.0) return [];
    vec3.transformMat4(sourcePosition, sourcePosition, movement);
    let [destCoordx, destCoordy] = project(sourcePosition);
    let destPosition = deproject(destDepth, destCoordx, destCoordy, debug);
    if (destPosition[2] === 0.0) return [];
    let destNormal;
    if (destNormals === undefined) {
        destNormal = estimateNormalPointCloud(destDepth, destCoordx, destCoordy, debug);
    } else {
        destNormal = getPrecomputedNormal(
            destNormals, destCoordx, destCoordy, debug);
    }
    if (debug) {
        // console.log("in correspondingPoint");
        // console.log("coord: ", coordx, coordy);
        // console.log("trans src position: ", sourcePosition);
        // console.log("dest coord: ", destCoordx, destCoordy);
        // console.log("dest position: ", destPosition);
        // console.log("dest normal: ", destNormal);
    }
    if (isNaN(sourcePosition[0]) || isNaN(destPosition[0])) {
        console.log("got NaN at index ", i, j);
        console.log("source position ", sourcePosition);
        console.log("dest position ", destPosition);
        console.log("dest coord ", destCoordx, destCoordy);
        throw Error("One of the results is NaN");
    }
    // if (!arraysEqual(sourcePosition,destPosition, 0.01)) {
    //     console.log("src ", sourcePosition);
    //     console.log("dst ", destPosition);
    //     console.log("i j ", i, j);
    //     console.log("coord ", coordx, coordy);
    //     throw Error("");
    // }
    if (vec3.distance(sourcePosition, destPosition) >= MAX_DISTANCE)
        return [vec3.create(), vec3.create(), vec3.create()];
    return [sourcePosition, destPosition, destNormal];
}

function createLinearEqOnCPU(srcDepth, destDepth, destNormals, movement) {
    let error = 0;
    let A = Array(6);
    let b = new Float32Array(6);
    for (let i = 0; i < 6; i += 1) {
        A[i] = new Float32Array(6);
    }
    let pointsFound = 0;
    let pointsUsed = 0;
    for (let i = 0; i < srcDepth.width; i += 1) {
        for (let j = 0; j < srcDepth.height; j += 1) {
            let result = correspondingPoint(srcDepth,
                destDepth, destNormals, movement, i, j);
            if (result.length != 3) continue;
            pointsFound += 1;
            // found corresponding points, but they were thrown out (undefined
            // normal or some other condition didn't pass)
            if (arraysEqual(result[2], vec3.create())) continue;
            pointsUsed += 1;
            let [p, q, n] = result;
            let c = vec3.create();
            let debug = (i == srcDepth.width/2 && j == srcDepth.height/2);
            // console.log("x", p, q, n);
            vec3.cross(c, p, n);
            let diff = vec3.create();
            vec3.sub(diff, p, q);
            let dot = vec3.dot(diff, n);
            error += Math.pow(dot, 2);
            A[0][0] += c[0]*c[0];
            A[1][0] += c[1]*c[0];
            A[2][0] += c[2]*c[0];
            A[3][0] += n[0]*c[0];
            A[4][0] += n[1]*c[0];
            A[5][0] += n[2]*c[0];

            A[0][1] += c[0]*c[1];
            A[1][1] += c[1]*c[1];
            A[2][1] += c[2]*c[1];
            A[3][1] += n[0]*c[1];
            A[4][1] += n[1]*c[1];
            A[5][1] += n[2]*c[1];

            A[0][2] += c[0]*c[2];
            A[1][2] += c[1]*c[2];
            A[2][2] += c[2]*c[2];
            A[3][2] += n[0]*c[2];
            A[4][2] += n[1]*c[2];
            A[5][2] += n[2]*c[2];

            A[0][3] += c[0]*n[0];
            A[1][3] += c[1]*n[0];
            A[2][3] += c[2]*n[0];
            A[3][3] += n[0]*n[0];
            A[4][3] += n[1]*n[0];
            A[5][3] += n[2]*n[0];

            A[0][4] += c[0]*n[1];
            A[1][4] += c[1]*n[1];
            A[2][4] += c[2]*n[1];
            A[3][4] += n[0]*n[1];
            A[4][4] += n[1]*n[1];
            A[5][4] += n[2]*n[1];

            A[0][5] += c[0]*n[2];
            A[1][5] += c[1]*n[2];
            A[2][5] += c[2]*n[2];
            A[3][5] += n[0]*n[2];
            A[4][5] += n[1]*n[2];
            A[5][5] += n[2]*n[2];

            b[0] += c[0]*dot;
            b[1] += c[1]*dot;
            b[2] += c[2]*dot;
            b[3] += n[0]*dot;
            b[4] += n[1]*dot;
            b[5] += n[2]*dot;
        }
    }
    for (let i = 0; i < b.length; i++) {
        b[i] = -b[i];
    }
    // console.log("points used: ", pointsUsed);
    // console.log("relative error: ", error/pointsUsed);
    const det = numeric.det(A);
    if (Number.isNaN(det) || Math.abs(1.0 - det) < 1e-15) {
        throw Error("Invalid determinant of A");
    }
    if (!matrixIsSymmetric(A, 0.001)) {
        throw Error("A is not symmetric");
    }
    return [A, b, error, pointsFound, pointsUsed];
}

function estimateMovementCPU(srcData, destData, max_steps, destNormals, initialMovement) {
    let info = {
        "steps": 0,
        "success": true,
        "error": 0.0,
        "pointsFound": 0,
        "pointsUsed": 0,
    };
    if (max_steps === undefined) max_steps = MAX_STEPS;
    let movement = initialMovement ? initialMovement.slice() : mat4.create();
    let previousError = 0;
    for (let step = 0; step < max_steps; step += 1) {
        let [A, b, error, pointsFound, pointsUsed] = 
                createLinearEqOnCPU(srcData, destData, destNormals, movement);
        info["error"] = error;
        info["steps"] = step+1;
        info["pointsFound"] = pointsFound;
        info["pointsUsed"] = pointsUsed;
        info["A"] = A;
        info["b"] = b;
        // console.log("step ", step, ", error ", error);
        if (Math.abs(error - previousError) < ERROR_DIFF_THRESHOLD) {
            break;
        }
        let x = numeric.solve(A, b);
        if (Number.isNaN(x[0])) {
            throw Error('No corresponding points between frames found.');
        }
        mat4.mul(movement, constructMovement(x), movement);
        previousError = error;

        if (!equationSolutionIsValid(A, x, b, 0.0001)) {
            throw Error("Ax = b is too imprecise")
        }
    }
    return [movement, info];
}
