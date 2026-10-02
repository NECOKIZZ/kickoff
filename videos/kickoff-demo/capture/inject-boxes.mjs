// Inline assets/shots/boxes.json into index.html (between /*BOXES*/ and /*END*/), so the
// composition has no async loading. Run after every capture: node capture/inject-boxes.mjs
import fs from "node:fs";
const dir = new URL("..", import.meta.url).pathname;
const boxes = fs.readFileSync(dir + "assets/shots/boxes.json", "utf8").replace(/\s+/g, "");
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/\/\*BOXES\*\/[\s\S]*?\/\*END\*\//, `/*BOXES*/${boxes}/*END*/`);
fs.writeFileSync(dir + "index.html", html);
console.log("inlined", Object.keys(JSON.parse(boxes)).length, "boxes");
