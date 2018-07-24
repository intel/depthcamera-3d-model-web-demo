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

const EPSILON = 0.00001;

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
    let p = vec3.create();
    // place the objects at (0, 0, 0.5)
    vec3.add(p, position, vec3.fromValues(0.0, 0.0, -0.5));
    const sphereCenter = vec3.fromValues(0.0, 0.0, 0.0);
    const sphereRadius = 0.1;
    const boxCenter =  vec3.fromValues(-0.2, 0.1, 0.0);
    const boxSize = vec3.fromValues(0.05, 0.05, 0.05);
    // show a spere and a box
    return Math.min(signedDistanceSphere(p, sphereCenter, sphereRadius),
                    signedDistanceBox(p, boxCenter, boxSize));
}

// Cast a ray from 'position' in the direction of 'viewDirection' until we hit
// the surface of one of the objects defined in 'signedDistance'. Returns the
// final vec3 position once this happens, false if no such surface is reached
// within MAX_STEPS.
// http://www.alanzucconi.com/2016/07/01/raymarching/
function raymarch(position, viewDirection) {
    for (let i = 0; i < MAX_STEPS; i+=1) {
        let dist = signedDistance(position);
        if (dist < EPSILON) {
            return position;
        } else {
            // position += dist * viewDirection;
            vec3.scaleAndAdd(position, position, viewDirection, dist);
        }
    }
    return false;
}

function createFakeData(width, height, transform) {
    const cameraParams = {
        depthScale: 1.0,
        getDepthIntrinsics(_, __) {
            return {
                offset: [width/2.0, height/2.0],
                focalLength: [width, height],
            };
        },
    };

    const data = new Float32Array(width*height);
    // transform = getViewMatrix(20, 50, 0.5);
    transform = getViewMatrix(0, 0, 0.5);
    for (let i = 0; i < width; i += 1) {
        for (let j = 0; j < height; j += 1) {
            let coordx = -(i - width/2.0)/width;
            let coordy = (j - height/2.0)/height;
            let position = vec3.fromValues(coordx, coordy, -1.0);
            vec3.transformMat4(position, position, transform);
            let camera = vec3.fromValues(0.0, 0.0, 0.0);
            vec3.transformMat4(camera, camera, transform);
            let viewDirection = vec3.create();
            vec3.scaleAndAdd(viewDirection, camera, position, -1.0);
            vec3.normalize(viewDirection, viewDirection);

            let result = raymarch(position, viewDirection);
            if (result) {
                data[i*width + j] = vec3.distance(camera, result);
            }
        }
    }
    if (true) {
        // show the raw generated depth data on the webpage
        const canvas = document.getElementById('debugcanvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        let debugData = context.createImageData(width, height);
        for(let i=0; i < width*height*4; i += 1) {
            let depth = data[i/4];
            if (depth) {
                debugData.data[i++] = 256 - ((depth*256) % 256);
            } else {
                debugData.data[i++] = 0;
            }
            debugData.data[i++] = 0;
            debugData.data[i++] = 0;
            debugData.data[i] = 255;
        }
        context.putImageData(debugData, 0, 0);
    }
    return [data, cameraParams];
}

async function doTestMain() {
    const canvasElement = document.getElementById('webglcanvas');
    canvasElement.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;


    const gl = setupGL(canvasElement);
    const programs = setupPrograms(gl);
    initAttributes(gl, programs);

    let width = 200;
    let height = 200;
    let cameraParams;
    [fakeData, cameraParams] = createFakeData(width, height, mat4.create());

    let textures = setupTextures(gl, programs, width, height);
    initUniforms(gl, programs, textures, cameraParams, width, height);
    let framebuffers = initFramebuffers(gl, programs, textures);
    uploadDepthData(gl, textures, fakeData, width, height);

    let l;
    let program;

    createModel(gl, programs, framebuffers, textures, 0, mat4.create());

    const animate = function () {
        program = programs.render;
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        l = gl.getUniformLocation(program, 'cubeTexture');
        gl.uniform1i(l, textures.cube1.glId());
        l = gl.getUniformLocation(program, 'viewMatrix');
        gl.uniformMatrix4fv(l, false, getViewMatrix(yaw, pitch, 1.8));
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        window.requestAnimationFrame(animate);
    };
    animate();
}

function testMain() {
    doTestMain().catch(handleError);
}
