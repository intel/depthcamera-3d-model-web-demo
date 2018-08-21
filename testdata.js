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

const EPSILON = 0.001;

function signedDistanceSphere(position, center, radius) {
    return vec3.distance(position, center) - radius;
}

function signedDistanceBox(position, center, size) {
    let d = vec3.create();
    let p = vec3.create();
    vec3.sub(p, position, center);
    d[0] = Math.abs(p[0]) - size[0];
    d[1] = Math.abs(p[1]) - size[1];
    d[2] = Math.abs(p[2]) - size[2];
    let l = vec3.create();
    l[0] = Math.max(d[0], 0.0);
    l[1] = Math.max(d[1], 0.0);
    l[2] = Math.max(d[2], 0.0);
    return Math.min(Math.max(d[0], Math.max(d[1], d[2])), 0.0) + vec3.length(l);

}

// Returns a float number that tells the distance from the nearest object in any
// direction. Will be close to 0 if the position is right at the surface of the
// object, negative if it's inside an object.
function signedDistance(position) {
    const sphereCenter = vec3.fromValues(0.0, 0.0, 0.0);
    const sphereRadius = 0.2;
    const boxCenter =  vec3.fromValues(0.2, -0.1, -0.1);
    const boxSize = vec3.fromValues(0.08, 0.08, 0.08);
    // show a spere and a box
    return Math.min(signedDistanceSphere(position, sphereCenter, sphereRadius),
        signedDistanceBox(position, boxCenter, boxSize));
}

// Cast a ray from 'position' in the direction of 'viewDirection' until we hit
// the surface of one of the objects defined in 'signedDistance'. Returns the
// final vec3 position once this happens, false if no such surface is reached
// within MAX_STEPS.
// http://www.alanzucconi.com/2016/07/01/raymarching/
function raymarch(position, viewDirection) {
    let p = position.slice();
    for (let i = 0; i < MAX_STEPS; i+=1) {
        let dist = signedDistance(p);
        if (dist < EPSILON) {
            return p;
        } else {
            // p += dist * viewDirection;
            vec3.scaleAndAdd(p, p, viewDirection, dist);
        }
    }
    return false;
}

function estimateNormal(position) {
    let p = position.slice();
    let normal = vec3.create();
    let a = vec3.create();
    let b = vec3.create();
    vec3.add(a, p, vec3.fromValues(EPSILON, 0, 0));
    vec3.add(b, p, vec3.fromValues(-EPSILON, 0, 0));
    normal[0] = signedDistance(a) - signedDistance(b);

    vec3.add(a, p, vec3.fromValues(0, EPSILON, 0));
    vec3.add(b, p, vec3.fromValues(0, -EPSILON, 0));
    normal[1] = signedDistance(a) - signedDistance(b);

    vec3.add(a, p, vec3.fromValues(0, 0, EPSILON));
    vec3.add(b, p, vec3.fromValues(0, 0, -EPSILON));
    normal[2] = signedDistance(a) - signedDistance(b);
    return vec3.normalize(normal, normal);
}

function createFakeCameraParams(width, height) {
    return {
        depthScale: 1.0,
        getDepthIntrinsics(_, __) {
            return {
                offset: [width/2.0, height/2.0],
                focalLength: [width, height],
            };
        },
    };
}

function createFakeData(width, height, transform) {
    const data = new Float32Array(width*height);
    const normals = new Float32Array(width*height*4);
    let inv_transform = mat4.create();
    mat4.invert(inv_transform, transform);
    data.width = width;
    data.height = height;
    normals.width = width;
    normals.height = height;
    normals.stride = 4;
    for (let i = 0; i < width; i += 1) {
        for (let j = 0; j < height; j += 1) {
            // let debug = (i == width/2 && j == height/2);
            // let debug = (i == 139 && j == 158);
            let debug = (i == 130 && j == 130);
            // let debug = false;

            // Flip both coordinates because this is a position in the
            // projection plane at -1 and the image will get mirrored around
            // both the x and y axis when projected onto it. Flip the
            // y coordinate again because the i=0 j=0 is at the top left corner
            // and we want it at the bottom left.
            let coordx = -(i - width/2.0)/width;
            let coordy = (j - height/2.0)/height;
            let position = vec3.fromValues(coordx, coordy, -1.0);
            if (debug) {
                console.log("position on proj.plane", position);
            }
            vec3.transformMat4(position, position, transform);
            let camera = vec3.fromValues(0.0, 0.0, 0.0);
            vec3.transformMat4(camera, camera, transform);
            let viewDirection = vec3.create();
            vec3.scaleAndAdd(viewDirection, camera, position, -1.0);
            vec3.normalize(viewDirection, viewDirection);

            let result = raymarch(position, viewDirection);
            if (debug) {
                console.log("camera", camera);
                console.log("transformed position", position);
                console.log("surface position", result);
            }
            if (result) {
                // Put the surface position into the camera space (where the
                // camera is at the origin).
                let result_camera = vec3.create();
                vec3.transformMat4(result_camera, result, inv_transform);
                data[j*width + i] = result_camera[2];
                let normal = estimateNormal(result);
                if (Math.abs(result[0]) < 0.001 && Math.abs(result[1]) < 0.001) {
                    console.log("hello");
                    console.log("center", result);
                    console.log("camera space center", result_camera);
                }
                if (debug) {
                    data[j*width + i] = result_camera[2];
                    console.log("camera space surface", result_camera);
                    // console.log("normal", normal);
                    let inv = mat4.create();
                    let x = vec3.create();
                    mat4.invert(inv, knownMovement);
                    vec3.transformMat4(x, result_camera, knownMovement);
                    console.log("x", x);
                    
                }
                let rotation = mat3.create();
                mat3.fromMat4(rotation, inv_transform);
                vec3.transformMat3(normal, normal, rotation);
                vec3.normalize(normal, normal);
                normals[(j*width + i)*4] = normal[0];
                normals[(j*width + i)*4 + 1] = normal[1];
                normals[(j*width + i)*4 + 2] = normal[2];
                if (debug) {
                    // console.log("normal in camera space", normal);

                }
            }
        }
    }
    console.log("");
    return [data, normals];
}


// 'data' should be Float32Array of size width*height
function showDepthData(canvas, data) {
    // Show the raw generated depth data on the webpage (don't use this for raw
    // camera data, those need to be scaled too).
    canvas.width = data.width;
    canvas.height = data.height;
    const context = canvas.getContext('2d');
    let imageData = context.createImageData(data.width, data.height);
    for(let i=0; i < data.width * data.height * 4; i += 1) {
        let depth = data[i/4];
        if (depth) {
            // Make the data more visible - it assumes that the camera is 1.0
            // away from the center of the object and the object is about 0.1 to
            // 0.3 in diameter, so the range will be about 0.7-1.3. This should
            // put it approximately in the 0.0-1.0 range so it can be displayed
            // in red.
            depth = (depth - 0.7)*2.0;
            depth = Math.max(depth, 0.0);
            depth = Math.min(depth, 1.0);
            imageData.data[i++] = 255 - ((depth*256) % 256);
        } else {
            imageData.data[i++] = 0;
        }
        imageData.data[i++] = 0;
        imageData.data[i++] = 0;
        imageData.data[i] = 255;
    }
    context.putImageData(imageData, 0, 0);
}

// 'data' should be Float32Array of size width*height*4
function showNormals(canvas, data) {
    // Show the raw generated depth data on the webpage (don't use this for raw
    // camera data, those need to be scaled too).
    canvas.width = data.width;
    canvas.height = data.height;
    const context = canvas.getContext('2d');
    let imageData = context.createImageData(data.width, data.height);
    for(let i=0; i < data.width * data.height * 4; i += 4) {
        let normalx = data[i];
        let normaly = data[i + 1];
        let normalz = data[i + 2];
        imageData.data[i+0] = Math.abs(normalx)*255;
        imageData.data[i+1] = Math.abs(normaly)*255;
        imageData.data[i+2] = Math.abs(normalz)*255;
        imageData.data[i+3] = 255;
    }
    context.putImageData(imageData, 0, 0);
}

function deproject(data, coordx, coordy) {
    let i = Math.round(-coordx*data.width + data.width/2.0);
    let j = Math.round(coordy*data.height + data.height/2.0);
    // let debug = (i == data.width/2 && j == data.height/2);
    let debug = (i == 150 && j==150);
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
        console.log(i, j);
        console.log("normal in ICP", nx, ny, nz);
    }
    return vec3.fromValues(nx, ny, nz);
}

function correspondingPoint(srcDepth, destDepth, destNormals, movement, i, j) {
    // let debug = (i == srcDepth.width/2 && j == srcDepth.height/2);
    let debug = (i == 150 && j == 150);
    let coordx = -(i - srcDepth.width/2.0)/srcDepth.width;
    let coordy = (j - srcDepth.height/2.0)/srcDepth.height;
    if (debug) {
        // console.log(coordx, coordy);
    }
    let sourcePosition = deproject(srcDepth, coordx, coordy);
    if (debug) {
        // console.log("coord: ", coordx, coordy);
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
    const det = numeric.det(A);
    if (Number.isNaN(det) || Math.abs(1.0 - det) < 1e-15) {
        throw Error("Invalid determinant of A");
    }
    const AA = numeric.transpose(A);
    for (let i = 0; i < A.length; i += 1) {
        for (let j = 0; j < A[i].length; j += 1) {
            if (A[i][j] !== AA[i][j]) {
                console.warn("A not symmetric, diff is ", A[i][j] - AA[i][j]);
            }
        }
    }
    return [A, b, error];
}

function estimateMovementCPU(srcData, destData, destNormals, initialMovement) {
    let movement = initialMovement ? initialMovement.slice() : mat4.create();
    let previousError = 0;
    for (let step = 0; step < 2; step += 1) {
        [A, b, error] = createLinearEqOnCPU(srcData, destData, destNormals,
                        movement);
        // if (Math.abs(error - previousError) < ERROR_DIFF_THRESHOLD) {
        //     break;
        // }
        let x = numeric.solve(A, b);
        if (Number.isNaN(x[0])) {
            throw Error('No corresponding points between frames found.');
        }
        // mat4.mul(movement, constructMovement(x), movement);
        mat4.mul(movement, movement, constructMovement(x));
        previousError = error;
        console.log("step ", step, ", error ", error);
    }
    return movement;
}

function printMat4(mat) {
    for (let i = 0; i < 4; i += 1) {
        let str = "";
        for (let j = 0; j < 4; j += 1) {
            let tmp = mat[j*4 + i].toFixed(3);
            if (tmp >= 0) str += " ";
            str += tmp + " ";
        }
        console.log(str);
    }
}


function matricesEqual(mat1, mat2, epsilon) {
    if (mat1.length !== mat2.length)
        return false;
    for (let i = 0; i < mat1.length; i++) {
        if (Math.abs(mat1[i] - mat2[i]) > epsilon) {
            console.log("Diff in matrices, index ", i, mat1[i], mat2[i]);
            return false;
        }
    }
    return true;
}

// Assuming src and dest are the movement of the camera, the result will be the
// movement of an object in the camera space (where the camera is at the
// origin).
function getMovement(src, dest) {
    let movement = mat4.create();
    let dest_inv = mat4.create();
    let x = mat4.create();
    mat4.invert(dest_inv, dest);
    mat4.mul(movement, dest_inv, src);
    return movement;
}
