const fs = require("fs");
const h = fs.readFileSync("index.html", "utf8");
const s = [...h.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
fs.writeFileSync("tests/scripts.json", JSON.stringify(s, null, 1));
console.log(s.join("\n"));