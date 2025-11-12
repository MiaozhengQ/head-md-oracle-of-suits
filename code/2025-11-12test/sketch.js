let capture;
let pose;
let latestLandmarks = null;
let headImage;
let bodyImage;
let assImage;
let legLeftImage;
let legRightImage;
let armLeftImage;  // 左臂图片
let armRightImage; // 新增：右臂图片
let handLeftImage;  // 新增：左手图片
let handRightImage; // 新增：右手图片

let armLengths = {
  left: null,
  right: null
};

// remove per-hand counters; add presence detection timers
// let leftHandCount = 0;
// let rightHandCount = 0;
// let prevSingleHand = 'none';

// presence detection for person
let presenceStartMillis = null;
let presenceTriggered = false;
const PRESENCE_REQUIRED_MS = 7000; // 7 seconds

// play-once state + UI for sound notification
let soundPlayedThisTrigger = false;
let soundMessageUntil = 0;
const SOUND_MSG_MS = 1800; // ms to show the "sound played" text

function preload() {
  // load the head image (place head.png in an 'assets' folder next to sketch.js)
  headImage = loadImage('assets/head.png');
  // load the body image (place body.png in same assets folder)
  bodyImage = loadImage('assets/body.png');
  // load the "ass" image (place ass.png in the assets folder)
  assImage = loadImage('assets/ass.png');
  // load leg images (place leg-left.png / leg-right.png in assets)
  legLeftImage = loadImage('assets/leg-left.png');
  legRightImage = loadImage('assets/leg-right.png');
  armLeftImage = loadImage('assets/arm-left.png');
  armRightImage = loadImage('assets/arm-right.png'); // 新增：加载右臂图片
  handLeftImage = loadImage('assets/hand-left.png');   // 新增
  handRightImage = loadImage('assets/hand-right.png'); // 新增
}
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
  // presence = detectable pose landmarks exist for a continuous period
  if (latestLandmarks) {
    if (presenceStartMillis === null) presenceStartMillis = millis();
    const elapsed = millis() - presenceStartMillis;
    if (elapsed >= PRESENCE_REQUIRED_MS) {
      presenceTriggered = true;
    }
  } else {
    // reset when person not present
    presenceStartMillis = null;
    presenceTriggered = false;
  }

  // change background when presence maintained for required time
  if (presenceTriggered) {
    background(20, 120, 180); // presence-triggered background
    if (!soundPlayedThisTrigger) {
      // play once per trigger (use assets path if needed)
      try {
        const sound = new Audio('assets/glassbroken.mp3');
        sound.play().catch(e => console.warn('sound play rejected', e));
      } catch (e) {
        console.warn('Failed to create Audio element', e);
      }
      soundPlayedThisTrigger = true;
      soundMessageUntil = millis() + SOUND_MSG_MS;
    }
  } else {
    background(30); // default background
    // reset so next presence can play sound again
    soundPlayedThisTrigger = false;
  }

  // show a short text when the sound was played
  if (millis() < soundMessageUntil) {
    push();
    textAlign(CENTER, CENTER);
    textSize(20);
    fill(255, 240, 40);
    noStroke();
    text('Glass sound played', width / 2, 50);
    pop();
  }

  // draw avatar driven by pose landmarks (no per-hand counting)
  if (latestLandmarks) {
    drawAvatar(latestLandmarks, 'present');

    fill(255);
    noStroke();
    textSize(22);
    textAlign(LEFT, TOP);
    const sec = presenceStartMillis ? Math.floor((millis() - presenceStartMillis) / 1000) : 0;
    text('Person present sec: ' + sec, 10, 10);
    text('Presence active: ' + (presenceTriggered ? 'yes' : 'no'), 10, 36);
  } else {
    fill(255);
    noStroke();
    textSize(20);
    text('No pose detected', 10, 10);
  }

  if (presenceTriggered) {
    if (!redirectDone) {
      redirectDone = true;
      console.log('Presence maintained — redirecting to finger scene:', FINGER_SCENE_URL);
      // small delay so user sees the background change
      setTimeout(() => {
        // replace current page with the finger-scene page
        // navigate using an http URL (relative path under the server)
        window.location.href = FINGER_SCENE_URL;
      }, 600);
    }
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

  // draw legs helper must be available before drawing the body/ass so legs can be drawn underneath
  function drawLegImage(img, hip, knee, ankle) {
    if (!hip) return;
    const end = ankle ? ankle : (knee ? knee : hip);
    const start = hip;
    const len = p5.Vector.dist(start, end);
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    let ang = atan2(end.y - start.y, end.x - start.x);

    // adjustments: smaller & rotation correction (tweak if needed)
    const LEG_SCALE = 0.6;
    const ROTATION_CORRECTION = -HALF_PI;
    const ORIENT_BY_WIDTH = false;

    if (img) {
      let imgW, imgH;
      const aspect = img.width / max(img.height, 1);
      if (ORIENT_BY_WIDTH) {
        imgW = max(len * LEG_SCALE, 8);
        imgH = imgW / max(aspect, 0.0001);
      } else {
        imgH = max(len * LEG_SCALE, 8);
        imgW = imgH * aspect;
      }
      push();
      translate(cx, cy);
      rotate(ang + ROTATION_CORRECTION);
      imageMode(CENTER);
      image(img, 0, 0, imgW, imgH);
      pop();
    } else {
      drawLimb(start, knee ? knee : end, ankle ? ankle : null);
    }
  }

  // draw legs first so they are behind body/ass
  if (lHip) drawLegImage(legLeftImage, lHip, lKnee, lAnkle);
  if (rHip) drawLegImage(legRightImage, rHip, rKnee, rAnkle);

  // compute body scale used for arms so proportions match body image
  let bodyScaleForArms = 1.4; // fallback
  if (lShoulder && rShoulder && lHip && rHip) {
    const shoulderDist = p5.Vector.dist(lShoulder, rShoulder);
    const midShoulder = createVector((lShoulder.x + rShoulder.x) / 2, (lShoulder.y + rShoulder.y) / 2);
    const midHip = createVector((lHip.x + rHip.x) / 2, (lHip.y + rHip.y) / 2);
    const torsoHeight = p5.Vector.dist(midShoulder, midHip);
    const scaleH = 1.4;
    const scaleFromWidth = (shoulderDist * 1.4 * 1.1) / max(torsoHeight, 1);
    bodyScaleForArms = max(scaleH, scaleFromWidth);
  }

  // 躯干中心（肩中点），用于把手臂往内收
  const torsoCenter = (lShoulder && rShoulder)
    ? createVector((lShoulder.x + rShoulder.x) / 2, (lShoulder.y + rShoulder.y) / 2)
    : null;

  // 绘制手臂（在身体之前，所以手臂在身体后面）
  if (lShoulder && lWrist && armLeftImage) {
    drawArmImage(armLeftImage, lShoulder, lWrist, {
      side: 'left', bodyScale: bodyScaleForArms, armScale: 0.3,
      torsoCenter, inwardShift: 14, pivotInset: 12
    });
  } else if (lShoulder && lElbow && lWrist) {
    drawLimb(lShoulder, lElbow, lWrist);
  } else if (lShoulder && lElbow) {
    drawLimb(lShoulder, lElbow, null);
  }

  if (rShoulder && rWrist && armRightImage) {
    drawArmImage(armRightImage, rShoulder, rWrist, {
      side: 'right', bodyScale: bodyScaleForArms, armScale: 0.3,
      torsoCenter, inwardShift: 14, pivotInset: 18
    });
  } else if (rShoulder && rElbow && rWrist) {
    drawLimb(rShoulder, rElbow, rWrist);
  } else if (rShoulder && rElbow) {
    drawLimb(rShoulder, rElbow, null);
  }

  // 手：初始化位置与旋转（贴在手腕处，沿肘→腕方向，无偏移/校正）
  if (lElbow && lWrist && handLeftImage) {
    drawHandImage(handLeftImage, lElbow, lWrist, {
      side: 'left', bodyScale: bodyScaleForArms, handScale: 1.0
    });
  }
  if (rElbow && rWrist && handRightImage) {
    drawHandImage(handRightImage, rElbow, rWrist, {
      side: 'right', bodyScale: bodyScaleForArms, handScale: 1.0
    });
  }

  // --- replace torso quad with body image when available ---
  if (lShoulder && rShoulder && lHip && rHip) {
    const centerX = (lShoulder.x + rShoulder.x + lHip.x + rHip.x) / 4;
    const baseCenterY = (lShoulder.y + rShoulder.y + lHip.y + rHip.y) / 4;
    const BODY_Y_OFFSET = p5.Vector.dist(lShoulder, rShoulder) * -0.1; // 正值=向下，小幅下移
    const centerY = baseCenterY + BODY_Y_OFFSET;

    // width ~ shoulder distance scaled, height ~ distance between shoulder-mid and hip-mid
    const shoulderDist = p5.Vector.dist(lShoulder, rShoulder);
    const midShoulder = createVector((lShoulder.x + rShoulder.x) / 2, (lShoulder.y + rShoulder.y) / 2);
    const midHip = createVector((lHip.x + rHip.x) / 2, (lHip.y + rHip.y) / 2);
    const torsoHeight = p5.Vector.dist(midShoulder, midHip);

    // make the body larger and flip it upside-down
    const imgW = shoulderDist * 1.4;       // increased width multiplier
    const imgH = max(torsoHeight * 1.4, imgW * 1.1); // increased height multiplier

    // rotation by shoulder line, add PI to rotate 180deg (upside-down)
    const angle = atan2(rShoulder.y - lShoulder.y, rShoulder.x - lShoulder.x) + PI;

    push();
    translate(centerX, centerY);
    rotate(angle);
    imageMode(CENTER);
    if (bodyImage) {
      image(bodyImage, 0, 0, imgW, imgH);
      // draw the "ass" image under the body (same transform so it follows rotation/position)
      if (assImage) {
        // scale & position ass relative to body image so it scales consistently
        const ASS_SCALE = 1.2;                // fraction of body width (tweak)
        const assW = imgW * ASS_SCALE;
        // preserve ass image aspect ratio
        const assH = assW * (assImage.height / max(assImage.width, 1));
        // vertical offset below body center (tweak to move up/down)
        const assYOffset = imgH * 0.62;
        // horizontal offset relative to body width (positive -> right, negative -> left)
        const ASS_X_MULT = -0.12;              // tweak to move left/right
        const assX = imgW * ASS_X_MULT;
        image(assImage, assX, assYOffset, assW, assH);
      }
    } else {
      // fallback: draw colored torso quad
      fill(torsoColor);
      beginShape();
      vertex(lShoulder.x - centerX, lShoulder.y - centerY);
      vertex(rShoulder.x - centerX, rShoulder.y - centerY);
      vertex(rHip.x - centerX, rHip.y - centerY);
      vertex(lHip.x - centerX, lHip.y - centerY);
      endShape(CLOSE);
    }
    pop();
  }

  // draw head using shoulder width to estimate size (kept as before)
  if (nose && lShoulder && rShoulder) {
    const shoulderDist = p5.Vector.dist(lShoulder, rShoulder);
    const headRadius = shoulderDist * 0.9;
    const headScaleMultiplier = 1.15;      // overall size (height basis)
    const headWidthMultiplier = 1.6;       // widen head (increase this)

    // image size
    const imgH = headRadius * 2 * headScaleMultiplier;
    const imgW = headRadius * 2 * headScaleMultiplier * headWidthMultiplier;

    // compute neck pivot from shoulders (midpoint) and small upward offset
    const midShoulder = createVector((lShoulder.x + rShoulder.x) / 2, (lShoulder.y + rShoulder.y) / 2);
    const NECK_UP = shoulderDist * 0.08; // tune to move pivot slightly up
    // reduce left shift to move head slightly to the right
    const offsetMult = -0.14; // smaller negative => head moves right relative to previous
    const pivotX = midShoulder.x - shoulderDist * offsetMult;
    // move head down a little by adding a positive downward offset (tweak HEAD_DOWN multiplier)
    const HEAD_DOWN = shoulderDist * 1.3;
    const pivotY = midShoulder.y - NECK_UP + HEAD_DOWN;

    // compute head rotation angle (falls back to shoulders)
    const headAngle = getHeadAngle(landmarks);

    // draw head image rotated around its bottom center (pivot at neck)
    push();
    imageMode(CENTER);
    translate(pivotX, pivotY);
    rotate(headAngle + PI); // keep +PI if image asset needs that correction
    if (headImage) {
      // draw image so its bottom edge sits at pivot (y = -imgH/2)
      image(headImage, 0, -imgH * 0.8, imgW, imgH);
    } else {
      noStroke();
      fill(240);
      circle(0, -imgH / 2, imgW);
    }
    pop();
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

  // 左臂图片绘制（肩->腕）— 初始化位置与旋转
  function drawArmImage(img, shoulder, wrist, opts = {}) {
    if (!img || !shoulder || !wrist) return;
    const ang = atan2(wrist.y - shoulder.y, wrist.x - shoulder.x);
    const len = p5.Vector.dist(shoulder, wrist);

    const side = opts.side || 'left';
    const SMOOTH_FACTOR = 0.15;
    if (armLengths[side] === null) armLengths[side] = len;
    else armLengths[side] = lerp(armLengths[side], len, SMOOTH_FACTOR);

    const ARM_LENGTH_MULT = (opts.bodyScale != null ? opts.bodyScale : 1.0);
    const ARM_WIDTH_MULT  = 1.0;
    const ARM_SIZE_MULT   = (opts.armScale != null ? opts.armScale : 1.0);

    const ROTATION_CORRECTION = 0;

    // 以肩腕中点为中心
    let cx = (shoulder.x + wrist.x) / 2;
    let cy = (shoulder.y + wrist.y) / 2;

    // 往身体中心内收（已有）
    if (opts.torsoCenter) {
      const toCenter = p5.Vector.sub(opts.torsoCenter, createVector(cx, cy));
      const d = toCenter.mag();
      if (d > 0.0001) {
        toCenter.mult((opts.inwardShift != null ? opts.inwardShift : 12) / d);
        cx += toCenter.x; cy += toCenter.y;
      }
    }

    // 沿手臂方向向肩部靠近（各自旋转中心）
    if (opts.pivotInset && opts.pivotInset !== 0) {
      const toShoulder = p5.Vector.sub(shoulder, createVector(cx, cy));
      const m = toShoulder.mag();
      if (m > 0.0001) {
        toShoulder.mult(opts.pivotInset / m);
        cx += toShoulder.x; cy += toShoulder.y;
      }
    }

    const imgH = max(armLengths[side] * ARM_LENGTH_MULT * ARM_SIZE_MULT, 8);
    const aspect = img.width / max(img.height, 1);
    const imgW = imgH * aspect * ARM_WIDTH_MULT;

    push();
    translate(cx, cy);
    rotate(ang + ROTATION_CORRECTION);
    imageMode(CENTER);
    image(img, 0, 0, imgW, imgH);
    pop();
  }

  // 手部图像绘制（肘->腕 定向，中心在腕部），无额外偏移/旋转校正
  function drawHandImage(img, elbow, wrist, opts = {}) {
    if (!img || !wrist) return;
    const side = opts.side || 'left';
    const bodyScale = opts.bodyScale != null ? opts.bodyScale : 1.0;
    const handScale = opts.handScale != null ? opts.handScale : 1.0;

    const ang = elbow ? atan2(wrist.y - elbow.y, wrist.x - elbow.x) : 0;
    const forearmLen = elbow ? p5.Vector.dist(elbow, wrist) : 60;
    const HAND_LENGTH_MULT = 0.55;
    const imgH = max(forearmLen * HAND_LENGTH_MULT * bodyScale * handScale, 12);
    const aspect = img.width / max(img.height, 1);
    const imgW = imgH * aspect;

    // 本地偏移：FWD 沿手方向（+x），OUT 垂直手方向（+y）
    const FWD = opts.handFwd != null ? opts.handFwd : 100;         // 往前/往后（沿手方向）
    const OUT = (opts.handOut != null ? opts.handOut :-12)       // 向外（垂直手方向）
              * (side === 'left' ? 1 : -1);                      // 右手外侧相反

    push();
    translate(wrist.x, wrist.y);  // 以腕为旋转中心
    rotate(ang);                  // 对齐前臂方向
    translate(FWD, OUT);         // 沿自身旋转后的坐标系外移
    imageMode(CENTER);
    image(img, 0, 0, imgW, imgH);
    pop();
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

// helper: compute head rotation angle from available face landmarks (tries ears, eyes, then falls back to shoulders)
function getHeadAngle(landmarks) {
  // candidate index pairs: [left, right]
  const pairs = [
    [7, 8],  // leftEar, rightEar (best)
    [3, 6],  // leftEyeOuter, rightEyeOuter
    [2, 5],  // leftEye, rightEye
    [1, 4],  // leftEyeInner, rightEyeInner
    [11, 12] // leftShoulder, rightShoulder (fallback)
  ];
  for (let [a, b] of pairs) {
    if (landmarks[a] && landmarks[b]) {
      const ax = landmarks[a].x * width;
      const ay = landmarks[a].y * height;
      const bx = landmarks[b].x * width;
      const by = landmarks[b].y * height;
      return atan2(by - ay, bx - ax);
            // 减小头旋转幅度（0.5 = 旋转50%，越小越稳定）
            //     const ROTATION_DAMPING = 0.2            // helper: compute head rotation angle from available face landmarks (tries ears, eyes, then falls back to shoulders)
            function getHeadAngle(landmarks) {
              // candidate index pairs: [left, right]
              const pairs = [
                [7, 8],  // leftEar, rightEar (best)
                [3, 6],  // leftEyeOuter, rightEyeOuter
                [2, 5],  // leftEye, rightEye
                [1, 4],  // leftEyeInner, rightEyeInner
                [11, 12] // leftShoulder, rightShoulder (fallback)
              ];
              for (let [a, b] of pairs) {
                if (landmarks[a] && landmarks[b]) {
                  const ax = landmarks[a].x * width;
                  const ay = landmarks[a].y * height;
                  const bx = landmarks[b].x * width;
                  const by = landmarks[b].y * height;
                  const rawAngle = atan2(by - ay, bx - ax);
                  // 减小头旋转幅度（0.2 = 旋转20%，越小越稳定）
                  const ROTATION_DAMPING = 0.1;
                  return rawAngle * ROTATION_DAMPING;
                }
              }
              return 0;
            };
     return rawAngle * ROTATION_DAMPING;
    }
  }
  return 0;
}

// redirect state — use path relative to the web server root (NOT an OS filesystem path)
let redirectDone = false;
// Example: if you serve the project root with a local server, use a relative URL:
const FINGER_SCENE_URL = 'http://127.0.0.1:5500/code/2025-11-11-replacemirror/FingerPaint/index.html'; // adjust if different