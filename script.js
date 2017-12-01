/*jshint esversion: 6 */

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
var mouseDown = false;
// Last position of the mouse when it was pressed down.
var lastMousePositionX = 0;
var lastMousePositionY = 0;
// Rotation of the model in degrees.
// https://en.wikipedia.org/wiki/Yaw_%28rotation%29
var yaw = 0;
var pitch = 0;

// Use this for displaying errors to the user. More details should be put into
// `console.error` messages.
function showErrorToUser(message) {
    var div = document.getElementById("errormessages");
    div.innerHTML += message + "</br>";
}

function handleError(error) {
    console.error(error);
    showErrorToUser(error.name ? (error.name + ": " + error.message) : error);
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

function getMvpMatrix(width, height) {
    var model = new mat4.create();
    mat4.translate(model, model, vec3.fromValues(0, 0, 0.5));
    mat4.rotateX(model, model, glMatrix.toRadian(pitch));
    mat4.rotateY(model, model, glMatrix.toRadian(yaw));
    mat4.translate(model, model, vec3.fromValues(0, 0, -0.5));

    var view = new mat4.create();
    mat4.lookAt(view,
        vec3.fromValues(0, 0, 0),   // eye
        vec3.fromValues(0, 0, 1),   // target
        vec3.fromValues(0, -1, 0));  // up

    var aspect = width / height;
    var projection = new mat4.create();
    mat4.perspective(projection, glMatrix.toRadian(60.0), aspect, 0.1, 20.0);

    var mv = mat4.create();
    mat4.multiply(mv, view, model);

    var mvp = mat4.create();
    mat4.multiply(mvp, projection, mv);
    return mvp;
}

// Compile the shader from `source` and return a reference to it.
function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    var msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw {
        name: "ShaderCompilationError",
        message: msg,
    };
}

// Compile shaders, activate the shader program and return a reference to it.
// The shaders are defined in the html file.
function setupProgram(gl) {
    var source = document.getElementById("vertexshader").text;
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, source);
    source = document.getElementById("fragmentshader").text;
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, source);

    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        console.log("GLSL program compiled.");
        gl.useProgram(program);
        return program;
    }
    var msg = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw {
        name: "ShaderLinkingError",
        message: msg,
    };
}

// Create textures into which the camera output will be stored.
function setupTextures(gl, program) {
    var shaderColorTexture = gl.getUniformLocation(program, "u_color_texture");
    gl.uniform1i(shaderColorTexture, 0);

    var colorStreamTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorStreamTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    var shaderDepthTexture = gl.getUniformLocation(program, "u_depth_texture");
    gl.uniform1i(shaderDepthTexture, 1);
    var depthStreamTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthStreamTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return {
        colorStreamTexture: colorStreamTexture,
        depthStreamTexture: depthStreamTexture,
    };
}

// Returns the calibration data.
async function setupCamera() {
    var [depth_stream, color_stream] = await DepthCamera.getStreams();
    var video = document.getElementById("colorStream");
    video.srcObject = color_stream;
    var depth_video = document.getElementById("depthStream");
    depth_video.srcObject = depth_stream;
    var parameters = DepthCamera.getCameraCalibration(depth_stream);
    return parameters;
}

// Take the parameters returned from `DepthCamera.getCameraCalibration` and
// upload them as uniforms into the shaders.
function uploadCameraParameters(gl, program, parameters, width, height) {
    var shaderVar = gl.getUniformLocation(program, "u_depth_scale");
    gl.uniform1f(shaderVar, parameters.depthScale);
    var depthIntrinsics = parameters.getDepthIntrinsics(width, height);
    shaderVar = gl.getUniformLocation(program, "u_depth_focal_length");
    gl.uniform2fv(shaderVar, depthIntrinsics.focalLength);
    shaderVar = gl.getUniformLocation(program, "u_depth_offset");
    gl.uniform2fv(shaderVar, depthIntrinsics.offset);
    shaderVar = gl.getUniformLocation(program, "u_depth_distortion_model");
    gl.uniform1i(shaderVar, parameters.depthDistortionModel);
    shaderVar = gl.getUniformLocation(program, "u_depth_distortion_coeffs");
    gl.uniform1fv(shaderVar, parameters.depthDistortioncoeffs);
    shaderVar = gl.getUniformLocation(program, "u_color_focal_length");
    gl.uniform2fv(shaderVar, parameters.colorFocalLength);
    shaderVar = gl.getUniformLocation(program, "u_color_offset");
    gl.uniform2fv(shaderVar, parameters.colorOffset);
    shaderVar = gl.getUniformLocation(program, "u_color_distortion_model");
    gl.uniform1i(shaderVar, parameters.colorDistortionModel);
    shaderVar = gl.getUniformLocation(program, "u_color_distortion_coeffs");
    gl.uniform1fv(shaderVar, parameters.colorDistortioncoeffs);
    shaderVar = gl.getUniformLocation(program, "u_depth_to_color");
    gl.uniformMatrix4fv(shaderVar, false, parameters.depthToColor);
}

async function main() {
    "use strict";

    var gl, program, textures;
    try {
        var canvasElement = document.getElementById("webglcanvas");
        canvasElement.onmousedown = handleMouseDown;
        document.onmouseup = handleMouseUp;
        document.onmousemove = handleMouseMove;
        gl = canvasElement.getContext("webgl2");
    } catch (e) {
        console.error("Could not create WebGL2 context: " + e);
        showErrorToUser("Your browser doesn't support WebGL2.");
        return false;
    }
    try {
        program = setupProgram(gl);
        textures = setupTextures(gl, program);
        gl.getExtension("EXT_color_buffer_float");

    } catch (e) {
        console.error(e.name + ": " + e.message);
        showErrorToUser("Errors while executing WebGL: " + e.name);
        return false;
    }


    var cameraParameters = await setupCamera().catch(handleError);

    var colorStreamElement = document.getElementById("colorStream");
    var depthStreamElement = document.getElementById("depthStream");
    var colorStreamReady = false;
    var depthStreamReady = false;
    colorStreamElement.oncanplay = function() { colorStreamReady = true; };
    depthStreamElement.oncanplay = function() { depthStreamReady = true; };

    var ranOnce = false;
    // Run for each frame. Will do nothing if the camera is not ready yet.
    var animate=function() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (colorStreamReady && depthStreamReady) {
            var width = depthStreamElement.videoWidth;
            var height = depthStreamElement.videoHeight;
            if ( ! ranOnce ) {
                uploadCameraParameters(gl, program, cameraParameters, width,
                                       height);
                var shaderDepthTextureSize =
                    gl.getUniformLocation(program, "u_depth_texture_size");
                gl.uniform2f(shaderDepthTextureSize, width, height);

                var shaderColorTextureSize =
                    gl.getUniformLocation(program, "u_color_texture_size");
                gl.uniform2f(shaderColorTextureSize,
                    colorStreamElement.videoWidth,
                    colorStreamElement.videoHeight);

                gl.canvas.width = width;
                gl.canvas.height = height;
                gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

                var indices = [];
                for (var i = 0; i < width; i++) {
                    for (var j = 0; j < height; j++) {
                        indices.push(i);
                        indices.push(j);
                    }
                }
                var shaderDepthTextureIndex =
                    gl.getAttribLocation(program, "a_depth_texture_index");
                gl.enableVertexAttribArray(shaderDepthTextureIndex);
                var buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER,
                    new Float32Array(indices),
                    gl.STATIC_DRAW);
                gl.vertexAttribPointer(shaderDepthTextureIndex,
                    2, gl.FLOAT, false, 0, 0);
                ranOnce = true;
            }
            var shaderMvp = gl.getUniformLocation(program, "u_mvp");
            gl.uniformMatrix4fv(shaderMvp, false, getMvpMatrix(width, height));

            try {
                // Upload the camera frame for both the RGB camera and depth.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, textures.colorStreamTexture);
                gl.texImage2D(gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    colorStreamElement);

                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, textures.depthStreamTexture);
                gl.texImage2D(gl.TEXTURE_2D,
                    0,
                    gl.R32F,
                    gl.RED,
                    gl.FLOAT,
                    depthStreamElement);
            }
            catch(e) {
                console.error("Error uploading video to WebGL: " +
                    e.name + ", " + e.message);
            }
            // create a vertex for each pixel in the depth stream
            gl.drawArrays(gl.POINTS, 0, width * height);

        }
        window.requestAnimationFrame(animate);
    };
    animate();
}
