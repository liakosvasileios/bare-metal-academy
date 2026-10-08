// Writes sw.js from scripts/sw.template.js with the list of files to precache and a content hash as version.
// Usage: node scripts/build-sw.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const include = ["index.html", "styles.css", "app.js", "lab.js", "manifest.webmanifest", "icons", "data", "content"];
const files = [];
const walk = (p) => statSync(p).isDirectory() ? readdirSync(p).forEach((f) => walk(join(p, f))) : files.push(p);
include.forEach((f) => walk(join(root, f)));
const hash = createHash("sha256");
const list = ["./", ...files.map((f) => "./" + relative(root, f).split("\\").join("/")).sort()];
files.sort().forEach((f) => hash.update(readFileSync(f)));
const tpl = readFileSync(join(root, "scripts/sw.template.js"), "utf8");
writeFileSync(join(root, "sw.js"), tpl.replace("__VERSION__", hash.digest("hex").slice(0, 12)).replace("__PRECACHE__", JSON.stringify(list, null, 2)));
console.log(`sw.js: ${list.length} files precached`);
