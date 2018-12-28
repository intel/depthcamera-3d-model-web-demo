# 3D scanning and camera tracking using a depth camera

This project is a demonstration on how to use an Intel® RealSense™ camera and
create a full 3D model of an object by moving the
depth camera around it. It is able to guess the movement of the camera without
any additional motion sensor, just from the depth data. It then combines the
data into a single model.

## How it works

Parts of the code originate from the [Pointcloud
demo](https://github.com/01org/depthcamera-pointcloud-web-demo). An explanation
on how to use the depth camera is in the articles [Depth Camera Capture in
HTML5](https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5)
and [How to create a 3D view in
WebGL](https://01.org/blogs/mkollaro/2017/how-to-create-3d-view-in-webgl).

The project consists of three main parts: the motion estimation, the model
creation, and the rendering. Almost everything is performed on the GPU by using
WebGL shaders.

### The motion estimation algorithm

This stage of the demo uses the [ICP
algorithm](https://en.wikipedia.org/wiki/Iterative_closest_point) to guess the
movement of the camera without any motion sensor (also known as SLAM). It has
been inspired by the paper [KinectFusion: Real-time 3D Reconstruction and
Interaction Using a Moving Depth
Camera](https://www.microsoft.com/en-us/research/publication/kinectfusion-real-time-3d-reconstruction-and-interaction-using-a-moving-depth-camera/),
which implements a similar version of the algorithm optimized for GPUs. Thanks
to this design, it's able to process the frames in real-time even on
a relatively weak GPU.

The images below show how two frames of data (that were artificially created)
get aligned over the course of 10 steps of the ICP algorithm.

![frame 0](https://github.com/intel/depthcamera-3d-model-web-demo/raw/master/images/frame0.png)
![frame 1](https://github.com/intel/depthcamera-3d-model-web-demo/raw/master/images/frame1.png)
![ICP iterations](https://github.com/intel/depthcamera-3d-model-web-demo/raw/master/images/icp.gif)

The principle is similar to
[linear regression](https://en.wikipedia.org/wiki/Linear_regression). In linear
regression, you are trying to fit a line trough a noisy set of points,
while minimizing the error. With the ICP algorithm, we are trying to find
a *motion* that will match two pointclouds together as best as possible,
assuming 6DOF (six degrees of freedom). If we had exact information on which
point from one pointcloud corresponds to which point in the other pointcloud,
this would be relatively easy. To some degree, this could be achieved by
recognizing features of a scene (e.g. corners of a table) and deciding that they
match up, but this approach is computationally intensive and difficult to
implement. A simpler approach is to decide that whatever point is closest,
that's the corresponding point. The closest point could be found by a brute
force search or by using a k-d tree, but this project uses a heuristic that is
very well suited for the GPU and is described in the `shaders/points-fshader.js`
file. It's not as exact as using the k-d tree, but has linear time complexity
for each point and is very well suited for the GPU.

This is the most complex part of the project, consisting of three different
shaders that are run several times per frame of data. The documentation is
in the shaders and in `movement.js`.
A much simpler implementation is in the file `movement_cpu.js`, which is used for
testing.

Since WebGL 2.0 doesn't have compute shaders, the
calculations are done in fragment shaders that take a texture with floating
point data as input. Then they render the output data into another texture with
floating point data.

### Model creation

If memory and bandwidth were free, we could just store all the poinclouds and
render them together. However, this would not only be very inefficient (we would
have millions of points after just a few minutes of recording), it would also
end up looking very noisy. A better solution is to create a volumetric model.
You can imagine it as a 3D grid where we simply set a voxel (volumetric pixel)
to 1 if a point lies within it. This would still be very inefficient and noisy,
with the addition of looking too much like Minecraft. An even better way is to
create a volumetric model using a
[signed distance function](https://en.wikipedia.org/wiki/Signed_distance_function).
Instead of storing 1 or 0 in a voxel, we store the distance to the object
surface from the center of the voxel. This method is described in the paper [A
Volumetric Method for Building Complex Models from Range
Images](http://graphics.stanford.edu/papers/volrange/).

The demo uses a 3D texture to store the volumetric model. The details of the
model creation are described in the file `shaders/model-fshader.js`.

### Rendering

This stage is the simplest and is more closely described in the file
`shaders/renderer-fshader.js`. It uses the 
[raymarching](http://www.alanzucconi.com/2016/07/01/raymarching/)
algorithm (a simpler and faster version of raytracing) to render the volumetric,
model, on which it then applies Phong lighting.

## Setup

The project works on Windows, Linux and ChromeOS with Intel® RealSense™ SR300
(and related cameras like Razer Stargazer or Creative BlasterX Senz3D) and R200
3D Cameras.


1. To make sure your system supports the camera, follow the [installation
guide](https://github.com/IntelRealSense/librealsense#installation-guide)
in librealsense.

2. Connect the camera.

3. Go to
[the demo page](https://intel.github.io/depthcamera-3d-model-web-demo).


To run the code locally, give Chromium the parameter
`--use-fake-ui-for-media-stream`, so that it doesn't ask you for camera
permissions, which are remembered only for https pages.

---
Intel and Intel RealSense are trademarks of Intel Corporation in the U.S. and/or
other countries.
