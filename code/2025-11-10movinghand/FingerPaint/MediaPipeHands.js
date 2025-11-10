// global results read by sketch.js
let detections = null;

let videoElement;
let hands = null;
let camera = null;

function setupHands() {
  hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  // CRITICAL: attach callback that sets global detections
  hands.onResults((results) => {
    detections = results;
  });

  console.log('✓ Hands initialized');
}

function setupVideo() {
  videoElement = document.querySelector('video');
  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);
  }

  if (typeof Camera === 'undefined') {
    console.error('Camera not loaded. Check MediaPipe script tags.');
    return;
  }

  camera = new Camera(videoElement, {
    onFrame: async () => {
      if (hands) {
        try {
          await hands.send({ image: videoElement });
        } catch (e) {
          console.error('Hand detection error:', e);
        }
      }
    },
    width: 1280,
    height: 720,
  });

  camera.start()
    .then(() => console.log('✓ Camera started'))
    .catch((e) => console.error('Camera failed:', e));
}