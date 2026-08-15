// scripts/build.mjs — Production build
// Minify JS (esbuild), CSS (lightningcss), HTML (html-minifier-terser)
// Copies vocals/*, manifest.json → dist/

import { build } from "esbuild";
import { bundleAsync } from "lightningcss";
import { minify } from "html-minifier-terser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });

console.log("=== Build production ===");

/* ---- JS bundle ---- */
const jsEntry = path.join(ROOT, "js", "_bundle-entry.js");
fs.writeFileSync(
  jsEntry,
  [
    "../js/audio.js",
    "../js/timeline.js",
    "../js/app.js"
  ]
  .map(f => `import "./${f}";`)
  .join("\n")
);

const jsResult = await build({
  entryPoints: [path.join(ROOT, "js", "audio.js"), path.join(ROOT, "js", "timeline.js"), path.join(ROOT, "js", "app.js")],
  bundle: false,
  minify: true,
  sourcemap: false,
  target: ["es2019", "chrome80", "firefox80", "safari13", "edge80"],
  legalComments: "none",
  outdir: path.join(DIST, "js"),
  format: "iife",
  treeShaking: true,
  logLevel: "info"
});
fs.rmSync(jsEntry, { force: true });

// Concatenate in correct order for single bundle
const jsFiles = ["audio.js", "timeline.js", "app.js"];
let bundle = "";
for (const f of jsFiles) {
  const p = path.join(DIST, "js", f);
  if (fs.existsSync(p)) {
    bundle += "\n" + fs.readFileSync(p, "utf8");
    fs.rmSync(p);
  }
}
const bundleName = "app.bundle.min.js";
const bundlePath = path.join(DIST, "assets", bundleName);
fs.writeFileSync(bundlePath, bundle, "utf8");
console.log("JS bundle:", (fs.statSync(bundlePath).size/1024).toFixed(1), "KB");

/* ---- CSS minify ---- */
const cssEntry = path.join(ROOT, "css", "styles.css");
const { code: cssMin } = await bundleAsync({
  filename: cssEntry,
  minify: true,
  targets: { chrome: 80 << 16, firefox: 80 << 16, safari: 13 << 16 }
});
const cssName = "styles.min.css";
const cssPath = path.join(DIST, "assets", cssName);
fs.writeFileSync(cssPath, cssMin, "utf8");
console.log("CSS bundle:", (fs.statSync(cssPath).size/1024).toFixed(1), "KB");

/* ---- HTML minify + asset rewrite ---- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
let htmlOut = htmlSrc
  .replace(/<link rel="stylesheet" href="css\/styles\.css"\s*\/?>/i, `<link rel="stylesheet" href="assets/${cssName}"/>`)
  .replace(/<script src="js\/audio\.js"><\/script>/i, "")
  .replace(/<script src="js\/timeline\.js"><\/script>/i, "")
  .replace(/<script src="js\/app\.js"><\/script>/i, `<script src="assets/${bundleName}" defer></script>`);

const htmlMin = await minify(htmlOut, {
  collapseWhitespace: true,
  removeComments: true,
  minifyJS: false,
  minifyCSS: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true
});
fs.writeFileSync(path.join(DIST, "index.html"), htmlMin, "utf8");
console.log("HTML:", (Buffer.byteLength(htmlMin)/1024).toFixed(1), "KB");

/* ---- Copy static assets: vocals folder + manifest.json ---- */
const vocalsSrc = path.join(ROOT, "vocals");
if (fs.existsSync(vocalsSrc)) {
  const vocalsDst = path.join(DIST, "vocals");
  fs.mkdirSync(vocalsDst, { recursive: true });
  for (const file of fs.readdirSync(vocalsSrc)) {
    const s = path.join(vocalsSrc, file);
    const d = path.join(vocalsDst, file);
    if (fs.statSync(s).isFile()) {
      fs.copyFileSync(s, d);
      console.log("COPY vocals/" + file, (fs.statSync(d).size/1024/1024).toFixed(2), "MB");
    }
  }
}
const mf = path.join(ROOT, "manifest.json");
if (fs.existsSync(mf)) {
  fs.copyFileSync(mf, path.join(DIST, "manifest.json"));
  console.log("COPY manifest.json");
}

/* ---- Empty .nojekyll for GitHub Pages (serve _ files correctly) ---- */
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

console.log("=== Build complete ===");
console.log("Output:", DIST);
const total = [...fs.readdirSync(DIST, { withFileTypes: true })].reduce((sum, e) => {
  if (e.isFile()) return sum + fs.statSync(path.join(DIST, e.name)).size;
  if (e.isDirectory()) return sum + fs.readdirSync(path.join(DIST, e.name)).reduce((s, f) => s + fs.statSync(path.join(DIST, e.name, f)).size, 0);
  return sum;
}, 0);
console.log("Total size:", (total/1024/1024).toFixed(2), "MB");
