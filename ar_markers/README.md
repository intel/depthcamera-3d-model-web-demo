# Fast, low latency fiducial marker detection on GPU in browser (WebGL) using standard webcam

Work in progress. Although it is going to be used for 3D scanning, code in this
folder doesn't require depth camera, but only a standard webcam. It is tested
with webcams doing 30 and 60 Hz capture.

<img src="doc/images/image4.gif" alt="Video of the demo is loading..."/>

The work is part of [3D model scanning](https://github.com/intel/depthcamera-3d-model-web-demo)
implementation using depth camera capture in Chrome web browser: there are two
parallel approaches: ICP algorithm implementation and this one. Additional
benefit that the AR markers bring is marking a cut off plane separating scanned
3D object from the environment.

The algorithm description and additional demo links are [available here](https://astojilj.github.io/depthcamera-3d-model-web-demo/ar_markers/doc/Fastlowlatencyfiducialmarkerdetectionon.html).

---
Intel and Intel RealSense are trademarks of Intel Corporation in the U.S. and/or
other countries.
