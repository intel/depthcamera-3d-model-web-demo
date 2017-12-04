# 3D scanning and camera tracking using a depth camera

Work in progress.

Uses an Intel® RealSense™ camera to get depth data and uses the [ICP
algorithm](https://en.wikipedia.org/wiki/Iterative_closest_point) to guess the
movement of the camera. Creates a volumetric model out of the data and adds them
up as the camera moves to create a 3D scan.

It's supported on Windows, Linux and ChromeOS with Intel® RealSense™ SR300 (and
related cameras like Razer Stargazer or Creative BlasterX Senz3D) and R200 3D
Cameras.

You will need Chromium release 58 or later, see the [dev
channel](https://www.chromium.org/getting-involved/dev-channel) if your version
is too old.

Parts of the code originate from the [Pointcloud
demo](https://github.com/01org/depthcamera-pointcloud-web-demo). An explanation
on how to use the depth camera is in the articles [Depth Camera Capture in
HTML5](https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5)
and [How to create a 3D view in
WebGL](https://01.org/blogs/mkollaro/2017/how-to-create-3d-view-in-webgl).


## Setup

1. To make sure your system supports the camera, follow the [installation
guide](https://github.com/IntelRealSense/librealsense#installation-guide)
in librealsense.

2. Make sure you have Chromium version of at least 58 - install it from the
[dev channel](https://www.chromium.org/getting-involved/dev-channel) if not.

3. Connect the camera.

4. Go to
[the demo page](https://intel.github.io/depthcamera-3d-model-web-demo).


To run the code locally, give Chromium the parameter
`--use-fake-ui-for-media-stream`, so that it doesn't ask you for camera
permissions, which are remembered only for https pages.

---
Intel and Intel RealSense are trademarks of Intel Corporation in the U.S. and/or
other countries.
