function setup() {
  createCanvas(windowWidth, windowHeight);

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);
  circle(width / 2, height / 2, frameCount * 0.2);
print(frameCount);
}
