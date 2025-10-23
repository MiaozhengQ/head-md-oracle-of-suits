
//create a array to hold stars
let stars = [];

// create a class named Star
class Star {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
//draw a rectangle size 5x50 at the center of canvas
//move the rectangle up by 40 pixels so that it is centered vertically
//draw second rectangle opposite the first rectangle to create a star shape
// set these rectangles different colors
//no stroke for the rectangles
//give rectangles light random colors and become lighter after 10 draws
//after 4 basics shapes are drawn, increase the number of shapes drawn by 1


  draw() {

    rectMode(CENTER);
    noStroke();
    fill(random(200, 255), random(200, 255), random(200, 255));
    rect(this.x, this.y - 40, 5, 50);
    fill(random(200, 255), random(200, 255), random(200, 255));
    rect(this.x, this.y + 40, 5, 50);
    fill(random(200, 255), random(200, 255), random(200, 255));
    rect(this.x - 40, this.y, 50, 5);
    fill(random(200, 255), random(200, 255), random(200, 255));
    rect(this.x + 40, this.y, 50, 5);
  
  
  }

}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
function setup() {
  createCanvas(windowWidth, windowHeight);

}
//draw a star ramdomly on the canvas every second
function draw() {
  if (frameCount % 60 === 0) {
    let star = new Star(random(width), random(height));
    star.draw();
  }
}

//when mouse is pressed clear the canvas
function mousePressed() {
  clear();
}