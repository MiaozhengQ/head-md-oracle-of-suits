let x,y;
let x1,y1;


function setup() {
  createCanvas(windowWidth, windowHeight);
  x = width / 2;
  y = height / 2;
  x1 = width / 2;
  y1 = height / 2;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(220);
  //add a little wiggle to the circle position
  x += random(-1, 1);
  y += random(-1, 1);
  circle(x, y, 50);
print(x);
// create a second circle with a 10,10 offset
x1 += random(-1,1);
y1 += random(-1,1);
  circle(x1, y1, 50);

}

function mousePressed() {
  x = mouseX;
  y = mouseY;
  x1 = mouseX + random(-10,10);
  y1 = mouseY + random(-10,10);
}