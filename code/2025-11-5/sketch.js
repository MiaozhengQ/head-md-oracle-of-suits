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

  // draw avatar driven by pose landmarks
  if (latestLandmarks) {
    const g = detectGesture(latestLandmarks);
    drawAvatar(latestLandmarks, g);

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

// draw a simple stylized person (torso, head, limbs) driven by landmarks
function drawAvatar(landmarks, gesture) {
  push();
  translate(width, 0);
  scale(-1, 1); // same mirroring as video

  // helper to read landmark -> p5.Vector (or null)
  const v = i => (landmarks[i] ? createVector(landmarks[i].x * width, landmarks[i].y * height) : null);

  const nose = v(0);
  const lShoulder = v(11), rShoulder = v(12);
  const lElbow = v(13), rElbow = v(14);
  const lWrist = v(15), rWrist = v(16);
  const lHip = v(23), rHip = v(24);
  const lKnee = v(25), rKnee = v(26);
  const lAnkle = v(27), rAnkle = v(28);

  // color by gesture
  let torsoColor = color(80, 200, 160);
  if (gesture === 'both hands up') torsoColor = color(80, 255, 120);
  else if (gesture === 'left hand up') torsoColor = color(200, 160, 80);
  else if (gesture === 'right hand up') torsoColor = color(160, 80, 200);

  noStroke();

  // draw torso as quad between shoulders and hips if available
  if (lShoulder && rShoulder && lHip && rHip) {
    fill(torsoColor);
    beginShape();
    vertex(lShoulder.x, lShoulder.y);
    vertex(rShoulder.x, rShoulder.y);
    vertex(rHip.x, rHip.y);
    vertex(lHip.x, lHip.y);
    endShape(CLOSE);
  }

  // draw head using shoulder width to estimate size
  if (nose && lShoulder && rShoulder) {
    const headRadius = p5.Vector.dist(lShoulder, rShoulder) * 0.6;
    fill(240);
    circle(nose.x, nose.y - headRadius * 0.6, headRadius * 2);
    // simple eyes
    fill(30);
    circle(nose.x - headRadius * 0.3, nose.y - headRadius * 0.7, headRadius * 0.18);
    circle(nose.x + headRadius * 0.3, nose.y - headRadius * 0.7, headRadius * 0.18);
  }

  // limb drawer (thick line + joint circles)
  function drawLimb(a, b, c) {
    if (!a || !b) return;
    stroke(40);
    strokeWeight(10);
    line(a.x, a.y, b.x, b.y);
    noStroke();
    fill(200);
    circle(a.x, a.y, 14);
    circle(b.x, b.y, 14);
    // optional lower segment to c (e.g., elbow->wrist)
    if (c && b) {
      stroke(40);
      strokeWeight(10);
      line(b.x, b.y, c.x, c.y);
      noStroke();
      fill(200);
      circle(c.x, c.y, 14);
    }
  }

  // arms: shoulder -> elbow -> wrist
  if (lShoulder && lElbow && lWrist) drawLimb(lShoulder, lElbow, lWrist);
  else if (lShoulder && lElbow) drawLimb(lShoulder, lElbow, null);

  if (rShoulder && rElbow && rWrist) drawLimb(rShoulder, rElbow, rWrist);
  else if (rShoulder && rElbow) drawLimb(rShoulder, rElbow, null);

  // legs: hip -> knee -> ankle
  if (lHip && lKnee && lAnkle) drawLimb(lHip, lKnee, lAnkle);
  else if (lHip && lKnee) drawLimb(lHip, lKnee, null);

  if (rHip && rKnee && rAnkle) drawLimb(rHip, rKnee, rAnkle);
  else if (rHip && rKnee) drawLimb(rHip, rKnee, null);

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
