import fs from "fs";
import fetch from "node-fetch";
await fetch("https://api.trace.moe/search", {
  method: "POST",
  body: fs.readFileSync("demo.jpg"),
  headers: { "Content-type": "image/jpeg" },
}).then((e) => e.json().then(e => console.log(e)));