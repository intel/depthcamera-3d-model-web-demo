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


class Texture2D {
    constructor(gl, width, height, format) {
        this.width = width;
        this.height = height;
        this.glId = gl.lastCreatedTextureId;
        gl.activeTexture(gl[`TEXTURE${this.glId}`]);
        gl.lastCreatedTextureId += 1;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texStorage2D(
            gl.TEXTURE_2D,
            1, // number of mip-map levels
            format, // internal format
            width,
            height,
        );
        let tmp = parseFormat(gl, format);
        this.format = tmp[0];
        this.type = tmp[1];

    }
    upload(gl, data) {
        // TODO check data size
        try {
            gl.activeTexture(gl[`TEXTURE${this.glId}`]);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texSubImage2D(
                gl.TEXTURE_2D,
                0, // mip-map level
                0, // x-offset
                0, // y-offset
                this.width,
                this.height,
                this.format,
                this.type,
                data,
            );
        } catch (e) {
            console.error(`Error uploading texture data:
                    ${e.name}, ${e.message}`);
            throw e;
        }
    }
}


class Texture3D {
    constructor(gl, size, format) {
        this.size = size;
        this.glId = gl.lastCreatedTextureId;
        gl.activeTexture(gl[`TEXTURE${this.glId}`]);
        gl.lastCreatedTextureId += 1;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, this.texture);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texStorage3D(
            gl.TEXTURE_3D,
            1, // number of mip-map levels
            format, // internal format
            size,
            size,
            size,
        );
        let tmp = parseFormat(gl, format);
        this.format = tmp[0];
        this.type = tmp[1];

    }
    upload(gl, data) {
        // TODO check data size
        try {
            gl.activeTexture(gl[`TEXTURE${this.glId}`]);
            gl.bindTexture(gl.TEXTURE_3D, this.texture);
            gl.texSubImage3D(
                gl.TEXTURE_3D,
                0, // mip-map level
                0, // x-offset
                0, // y-offset
                0, // z-offset
                this.size,
                this.size,
                this.size,
                this.format,
                this.type,
                data,
            );
        } catch (e) {
            console.error(`Error uploading texture data:
                    ${e.name}, ${e.message}`);
            throw e;
        }
    }
}

function parseFormat(gl, format) {
    switch (format) {
        case gl.R32F:
            format = gl.RED;
            type = gl.FLOAT;
            break;
        case gl.RG16F:
            format = gl.RG;
            type = gl.FLOAT;
            break;
        case gl.RG32F:
            format = gl.RG;
            type = gl.FLOAT;
            break;
        case gl.RGBA32F:
            format = gl.RGBA;
            type = gl.FLOAT;
            break;
        default:
            throw Error("Unknown texture format " + format);
    }
    return [format, type];
}
