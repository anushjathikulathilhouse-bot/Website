// scripts/dev-server.mjs — Local dev HTTP server
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json"
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
  try { filePath = fs.realpathSync(filePath); } catch { res.writeHead(404); return res.end("Not Found"); }
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (stat && stat.isDirectory()) {
        const idx = path.join(filePath, "index.html");
        return fs.stat(idx, (ie, ist) => {
          if (ie || !ist.isFile()) { res.writeHead(404); return res.end("Not Found"); }
          send(idx);
        });
      }
      res.writeHead(404); return res.end("Not Found");
    }
    send(filePath);
    function send(p) {
      const ext = path.extname(p).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": stat.size,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      });
      fs.createReadStream(p).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   Dev server running                         ║");
  console.log(`║   Local:    http://localhost:${PORT}${" ".repeat(Math.max(0, 19 - String(PORT).length))}║`);
  console.log("╚══════════════════════════════════════════════╝\n");
});
