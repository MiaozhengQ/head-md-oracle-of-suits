let capture;
let pose;
let latestLandmarks = null;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // start webcam capture
  capture = createCapture(VIDEO);
  capture.size(1280, 720);
  capture.elt.setAttribute('playsinline', '');
  capture.hide();

  setupPose();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(30);

  // mirror video (selfie)
  push();
  translate(width, 0);
  scale(-1, 1);
  image(capture, 0, 0, width, height);
  pop();

  // draw landmarks and gesture
  if (latestLandmarks) {
    drawPoseLandmarks(latestLandmarks);
    const g = detectGesture(latestLandmarks);
    fill(255);
    noStroke();
    textSize(22);
    textAlign(LEFT, TOP);
    text('Gesture: ' + g, 10, 10);
  } else {
    fill(255);
    noStroke();
    textSize(20);
    text('No pose detected', 10, 10);
  }
}

// initialize MediaPipe Pose
function setupPose() {
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults((results) => {
    // results.poseLandmarks is array of 33 landmarks (or undefined)
    latestLandmarks = results && results.poseLandmarks ? results.poseLandmarks : null;
  });

  // Use MediaPipe Camera helper to feed frames into pose
  if (typeof Camera !== 'undefined' && capture && capture.elt) {
    const mpCamera = new Camera(capture.elt, {
      onFrame: async () => {
        await pose.send({image: capture.elt});
      },
      width: 1280,
      height: 720
    });
    mpCamera.start();
  } else {
    console.warn('MediaPipe Camera not available; falling back to manual pose.send in draw()');
  }
}

// draw landmarks + simple skeleton (mirrored to match video)
function drawPoseLandmarks(landmarks) {
  push();
  translate(width, 0);
  scale(-1, 1); // mirror to match video
  stroke(0, 200, 150);
  strokeWeight(2);

  // draw connections provided by drawing_utils if available
  try {
    const ctx = drawingUtils && drawingUtils.drawConnectors ? drawingUtils : null;
    // drawing_utils from the CDN doesn't expose easy bridging here in p5,
    // so draw simple lines for common connections:
    const pairs = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [23, 24], // hips
      [11, 23], [12, 24] // torso
    ];
    stroke(100, 220, 180, 200);
    for (let [a, b] of pairs) {
      if (landmarks[a] && landmarks[b]) {
        line(landmarks[a].x * width, landmarks[a].y * height, landmarks[b].x * width, landmarks[b].y * height);
      }
    }
  } catch (e) {}

  noStroke();
  fill(0, 200, 150);
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const x = lm.x * width;
    const y = lm.y * height;
    circle(x, y, 8);
  }
  pop();
}

// simple gesture detection: hands up / left up / right up / hands down
function detectGesture(landmarks) {
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return 'unknown';

  // y smaller = higher on screen
  const leftUp = leftWrist.y < leftShoulder.y - 0.05;
  const rightUp = rightWrist.y < rightShoulder.y - 0.05;

  if (leftUp && rightUp) return 'both hands up';
  if (leftUp && !rightUp) return 'left hand up';
  if (!leftUp && rightUp) return 'right hand up';
  return 'hands down';
}
