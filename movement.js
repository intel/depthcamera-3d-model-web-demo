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

// Maximum number of ICP iterations for estimating the movement. Chosen to be 20
// because higher numbers tend to be slow. A high number does not necessarily
// mean it will be able to estimate it better.
const MAX_STEPS = 20;
// Stop the motion estimation when the difference between the previous and
// current error is smaller than this (the algorithm has converged).
const ERROR_DIFF_THRESHOLD = 0.0001;

// Re-construct the 6x6 matrix A, 6x1 vector b and the scalar error from the raw
// data that we got from the GPU.
function constructEquation(data) {
    const stride = 4;
    const error = data[14*stride];
    const pointsUsed = data[14*stride + 1]
    const A = Array(6);
    const b = new Float32Array(6);
    for (let i = 0; i < 6; i += 1) {
        A[i] = new Float32Array(6);
    }
    for (let i = 0; i < 6; i += 1) {
        A[0][i] = data[i*stride];
        A[1][i] = data[(i*stride) + 1];
        A[2][i] = data[(i*stride) + 2];
        A[3][i] = data[(i+6)*stride];
        A[4][i] = data[((i+6)*stride) + 1];
        A[5][i] = data[((i+6)*stride) + 2];
    }
    for (let i = 0; i < 3; i += 1) {
        b[i] = -data[(12*stride) + i];
        b[i + 3] = -data[(13*stride) + i];
    }
    // console.log('error: ', error);
    // console.log('A: ', A);
    // console.log('b: ', b);
    // console.log("points used: ", pointsUsed);
    console.log("relative error: ", error/pointsUsed);
    const AA = numeric.transpose(A);
    for (let i = 0; i < A.length; i += 1) {
        for (let j = 0; j < A[i].length; j += 1) {
            if (A[i][j] !== AA[i][j]) {
                console.error("A not symmetric, diff is ", A[i][j] - AA[i][j]);
            }
        }
    }
    return [A, b, error, pointsUsed];
}

// The parameter 'x' should contain a vector with 6 items, which holds the
// 3 rotations around the 3 axes and the translation vector.
// Return a 4x4 matrix that represents this movement.
function constructMovement(x) {
    const movement = mat4.create();
    mat4.rotateX(movement, movement, x[0]);
    mat4.rotateY(movement, movement, x[1]);
    mat4.rotateZ(movement, movement, x[2]);
    mat4.translate(
        movement, movement,
        vec3.fromValues(x[3], x[4], x[5]),
    );
    return movement;
}

// Given the depth data in the two textures 'textures.depth', estimate the
// movement between them and return the resulting 4x4 matrix that describes this
// motion. When this motion matrix is applied to the source point cloud, it will
// move it to roughly match the destination point cloud.
//
// The 'frame' parameter is the number of the current frame, used to determine
// which depth texture is the older one. Returns the identity matrix if this is
// the first frame, because we need two frames worth of data.
//
// The following pseudocode gives a very rough idea of what is going on.
//
//      # inputs are the two point clouds 'sourcePoints' and 'destPoints'
//      movement = 4x4 identity matrix
//      e = 0
//      while true:
//          A = empty 6x6 matrix
//          b = empty 6x1 vector
//          for p in sourcePoints:
//              # done by the points shader
//              p = movement * p
//              q = findCorrespondingPoint(destPoints, p)
//              # done by the matrix and sum shaders
//              A += constructMatrix(p, q)
//              b += constructVector(p, q)
//              e += error(p, q)
//          if e didn't change much from last loop:
//              return movement
//          solve Ax = b
//          partialMovement = constructMovement(x)
//          movement = partialMovement * movement;
//
//
// Uses the ICP (Iterative Closest/Corresponding Point) algorithm with
// a point-to-plane metric. The WebGL shaders do most of the computation
// (finding corresponding points and summing up the results to form a set of
// linear equations). The only part using the CPU is when the final set of
// equations gets solved, using numeric.js. Look into the individual shaders for
// more documentation. The following papers might also help:
//
// * Object Modeling by Registration of Multiple Range Images by Chen and
//   Medioni:
//      http://www.cs.hunter.cuny.edu/~ioannis/chen_medioni_point_plane_1991.pdf
// * Generalized ICP by Segal, Haehnel and Thrun:
//      http://www.robots.ox.ac.uk/~avsegal/resources/papers/Generalized_ICP.pdf
// * Derivation of the Point-to-Plane Minimization:
//      https://www.cs.princeton.edu/%7Esmr/papers/icpstability.pdf
// * Efficient Variants of the ICP Algorithm by Rusinkiewicz and Levoy:
//      http://graphics.stanford.edu/papers/fasticp/fasticp_paper.pdf
function estimateMovement(gl, programs, textures, framebuffers, frame) {
    if (frame === 0) return mat4.create();
    program = programs.points;
    gl.useProgram(program);
    // Swap between depth textures, so that the older one is referenced as
    // destDepthTexture.
    l = gl.getUniformLocation(program, 'sourceDepthTexture');
    gl.uniform1i(l, textures.depth[frame%2].glId());
    l = gl.getUniformLocation(program, 'destDepthTexture');
    gl.uniform1i(l, textures.depth[(frame+1)%2].glId());
    // Number of items in each texel, 4 means RGBA, 3 means RGB.
    const stride = 4;

    const movement = mat4.create();
    let previousError = 0;
    // Run the ICP algorithm until the
    // error stops changing (which usually means it converged).
    for (let step = 0; step < MAX_STEPS; step += 1) {
        // Find corresponding points and output information about them into
        // textures (i.e. the cross product, dot product, normal, error).
        program = programs.points;
        gl.useProgram(program);
        l = gl.getUniformLocation(program, 'movement');
        gl.uniformMatrix4fv(l, false, movement);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Use the textures created by the points shader to construct a 6x6
        // matrix A and 6x1 vector b for each point and store it into a texture.
        program = programs.matrices;
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.matrices);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Sum up the matrices and vectors from the 'matrices' shader to create
        // a single 6x6 matrix A and 6x1 vector b. Uses a tree reduction, so
        // that each loop will use a (usually) square texture with data as the
        // input and a square texture of 1/4 the size as the output. Each
        // instance of the shader sums together 4 neighboring items.
        program = programs.sum;
        gl.useProgram(program);
        l = gl.getUniformLocation(program, 'inputTexture');
        gl.uniform1i(l, textures.matrices.glId());
        for (let i = 0; i < framebuffers.sum.length; i += 1) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.sum[i]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.finish();
            l = gl.getUniformLocation(program, 'inputTexture');
            gl.uniform1i(l, textures.sum[i].glId());
        }
        // The last result of the summing will be a single block of data
        // containing the matrix A, the vector b and the error
        const data = new Float32Array(5 * 3 * stride);
        gl.readPixels(0, 0, 5, 3, gl.RGBA, gl.FLOAT, data);
        const [A, b, error, pointsUsed] = constructEquation(data);

        // The algorithm has converged, because the error didn't change much
        // from the last loop. Note that the error might actually get higher
        // (and this is not a bad thing), because a better movement estimate may
        // match more points to each other. A very small error could simply mean
        // that there isn't much overlap between the point clouds.
        if (Math.abs(error - previousError) < ERROR_DIFF_THRESHOLD) {
            break;
        }
        // Solve Ax = b. The x vector will contain the 3 rotation angles (around
        // the x axis, y axis and z axis) and the translation (tx, ty, tz).
        const x = numeric.solve(A, b);
        if (Number.isNaN(x[0])) {
            throw Error('No corresponding points between frames found.');
        }
        // Verify that Ax = b, at least approximately.
        // This seems to freeze the browser, so let's multiply manually
        // const Ax = numeric.mul(A, x);
        const Ax = new Float32Array(6);
        for (i = 0; i < b.length; i += 1) {
            Ax[i] = 0.0;
            for (j = 0; j < b.length; j += 1) {
                Ax[i] += A[i][j]*x[j];
            }
        }
        for (i = 0; i < Ax.length; i += 1) {
            if (Math.abs(b[i] - Ax[i]) > 0.00001) {
                const diff = b[i] - Ax[i];
                console.error("b and Ax are not the same, diff ", diff);
            }
        }
        mat4.mul(movement, constructMovement(x), movement);
        previousError = error;
    }
    return movement;
}
