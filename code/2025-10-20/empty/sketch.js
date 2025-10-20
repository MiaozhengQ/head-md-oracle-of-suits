function setup() {
  // Create a canvas that fills the window
  createCanvas(windowWidth, windowHeight);
}

// The draw function runs continuously in a loop
function draw() {
  //Set a pulsing background color like breathing white light
  let pulse = map(sin(frameCount * 0.05), -1, 1, 200, 255);
  background(pulse);
}
