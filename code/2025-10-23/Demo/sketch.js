// rectangle system
let rects = [];
const MAX_RECTS = 60;
const SPAWN_RATE = 0.18; // chance to spawn each frame when eye is open
const BLINK_THRESHOLD = 0.5;
let prevLeftOpen = false;
let leftEyeBlink = 0;
colorMode(HSB)


// the blendshapes we are going to track
function setup() {
  // full window canvas
  createCanvas(windowWidth, windowHeight);
  // initialize MediaPipe
  setupFace();
  setupVideo();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {

  // get detected faces
  let faces = getFaceLandmarks();

  // see blendshapes.txt for full list of possible blendshapes
  leftEyeBlink = getBlendshapeScore('eyeBlinkLeft');

  // determine open/closed
  let leftOpen = leftEyeBlink > BLINK_THRESHOLD;

  // background color by eye state
  if (leftOpen) {
    background(20, 70, 1200);
  } else {
   background(20 ,70, 1200);
  }
 

  if (isVideoReady()) {
    // show video frame
    image(videoElement, 0, 0);
  }
// When eye is open: spawn rectangles randomly over time.
  if (leftOpen) {
    if (random() < SPAWN_RATE) spawnRect();
  }

  // When eye just closed: teleport rectangles once on the transition
  if (!leftOpen && prevLeftOpen) {
    teleportRects();
  }

  // update and draw rectangles
  updateRects();
  noStroke();
  rectMode(CENTER);
  for (let r of rects) {
    fill(r.c);
    rect(r.x, r.y, r.w, r.h, 8);
  }

  // draw the leftEyeBlink value in the text under the video
  fill(255);
  noStroke();
  textSize(16);
  text("leftEyeBlink: " + leftEyeBlink.toFixed(2), 10, height - 60);

  // store previous state for edge detection
  prevLeftOpen = leftOpen;
}

function spawnRect() {
    rects.push({
        x: random(width),
        y: random(height),
        w: random(24, 120),
        h: random(24, 120),
        c: color(random(60, 255), random(60, 255), random(60, 255)),
        vx: random(-1.5, 1.5),
        vy: random(-1.5, 1.5)
    });
    if (rects.length > MAX_RECTS) rects.splice(0, rects.length - MAX_RECTS);
}

// teleport all rects to new positions (called on eye-close transition)
function teleportRects() {
    for (let r of rects) {
        r.x = random(width);
        r.y = random(height);
        r.vx = random(-2, 2);
        r.vy = random(-2, 2);
        r.c = color(random(89, 300), random(180, 400), random(100, 200));
    }
}

// simple motion + wrap-around
function updateRects() {
    for (let r of rects) {
        
        if (r.x < -r.w) r.x = width + r.w;
        if (r.x > width + r.w) r.x = -r.w;
        if (r.y < -r.h) r.y = height + r.h;
        if (r.y > height + r.h) r.y = -r.h;
    }
}

// draw a rectangle
