// create an empty array named things
let things = [];

function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(220);
  // draw all things 
  for (let i = 0; i < things.length; i++) {
    things[i].draw();
  }
}

function mousePressed() {
  // create a new Thing at mouse position and add it to the things array
  let newThing = new Thing(mouseX, mouseY);
  things.push(newThing);
  // add a new Thing to the things array
  newThing.draw();
}