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

const MAX_STEPS = 20;
const ERROR_THRESHOLD = 0.0001;
const ERROR_DIFF_THRESHOLD = 0.0001;

function constructEquation(data) {
    const stride = 4;
    const error = data[14*stride];
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
    console.log('error: ', error);
    // console.log('A: ', A);
    // console.log('b: ', b);
    return [A, b, error];
}

function estimateMovement(gl, programs, textures, framebuffers, frame) {
    if (frame === 0) return mat4.create();
    program = programs.points;
    gl.useProgram(program);
    l = gl.getUniformLocation(program, 'sourceDepthTexture');
    gl.uniform1i(l, textures.depth[frame%2].glId());
    l = gl.getUniformLocation(program, 'destDepthTexture');
    gl.uniform1i(l, textures.depth[(frame+1)%2].glId());

    const movement = mat4.create();
    let previousError = 0;
    for (let step = 0; step < MAX_STEPS; step += 1) {
        program = programs.points;
        gl.useProgram(program);
        l = gl.getUniformLocation(program, 'movement');
        gl.uniformMatrix4fv(l, false, movement);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.points);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        const stride = 4;

        program = programs.matrices;
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.matrices);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        program = programs.sum;
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.sum);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        const data = new Float32Array(5 * 3 * stride);
        gl.readPixels(0, 0, 5, 3, gl.RGBA, gl.FLOAT, data);

        const [A, b, error] = constructEquation(data);
        if (error < ERROR_THRESHOLD
            || Math.abs(error - previousError) < ERROR_DIFF_THRESHOLD) {
                break;
        }
        const result = numeric.solve(A, b);
        // console.log("result: ", result);
        if (Number.isNaN(result[0])) {
            throw Error('No corresponding points between frames found.');
        }
        mat4.translate(
            movement, movement,
            vec3.fromValues(result[3], result[4], result[5]),
        );
        mat4.rotateX(movement, movement, result[0]);
        mat4.rotateY(movement, movement, result[1]);
        mat4.rotateZ(movement, movement, result[2]);
        previousError = error;
    }
    return movement;
}
