const fs = require("fs");
const h = fs.readFileSync("crm/index.html", "utf8");
const s = [...h.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => "crm/" + m[1]);
fs.writeFileSync("tests/scripts.json", JSON.stringify(s, null, 1));
console.log(s.join("\n"));
