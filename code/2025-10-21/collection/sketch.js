
//create a class called Planet
class Planet {
  //create an x,y position
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.color = color(random(255), random(255), random(255));
  }
  //draw the planet as a circle
  draw() {
    //wiggle the planet's position slightly
    this.x += random(-1, 1);
    this.y += random(-1, 1);
    //no outline
    noStroke();

    //set the fill color to planet's color
    fill(this.color);
    //draw the circle
    ellipse(this.x, this.y, 50, 50);

  }
}

// create a collection of planets
let planets = [];

function setup() {
  //create a canvas that fills the window
  createCanvas(windowWidth, windowHeight);

}

function draw() {
  //set the background color to gray
  // background(128);
  // draw all the planets in the collection
  for (let p of planets) {
    p.draw();
  }

}

// when the mouse is pressed
function mousePressed() {
  //create a new planet at the mouse position
  let p = new Planet(mouseX, mouseY);
  //add the planet to the collection
  planets.push(p);
}

