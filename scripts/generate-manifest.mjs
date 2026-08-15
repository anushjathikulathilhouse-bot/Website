// scripts/generate-manifest.mjs — Node.js manifest generator (cross-platform)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FOLDER = "vocals";
const OUT = path.join(ROOT, "manifest.json");
const EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);

const src = path.join(ROOT, FOLDER);
if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
  console.error(`ERROR: ${FOLDER}/ folder not found at ${src}`);
  process.exit(1);
}
const files = fs.readdirSync(src).filter(f => {
  const p = path.join(src, f);
  return fs.statSync(p).isFile() && EXTS.has(path.extname(f).toLowerCase());
}).sort();
if (files.length === 0) {
  console.error(`ERROR: No audio files found in ${FOLDER}/`);
  process.exit(1);
}
const entries = files.map(f => ({ name: f, path: `${FOLDER}/${f}` }));
fs.writeFileSync(OUT, JSON.stringify(entries, null, 2) + "\n", "utf8");
console.log(`manifest.json written with ${entries.length} file(s):`);
for (const e of entries) console.log(" -", e.path);
