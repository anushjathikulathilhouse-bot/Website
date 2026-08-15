// scripts/deploy-gh-pages.mjs — Publish ./dist to gh-pages branch
import { publish } from "gh-pages";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

if (!fs.existsSync(DIST)) {
  console.error("ERROR: dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

console.log("Deploying dist/ → gh-pages branch...");
const publishP = promisify(publish);
try {
  await publishP(DIST, {
    branch: "gh-pages",
    dotfiles: true,
    message: `Deploy ${pkg.version} @ ${new Date().toISOString()}`,
    add: false
  });
  console.log("✅ Deployed to gh-pages branch!");
  console.log("");
  console.log("To enable public hosting:");
  console.log("  1. Go to your GitHub repo → Settings → Pages");
  console.log("  2. Source: Deploy from a branch");
  console.log("  3. Branch: gh-pages / (root)");
  console.log("  4. Save. Your site will be live shortly at:");
  console.log("     https://<USERNAME>.github.io/<REPO>/");
} catch (err) {
  console.error("❌ Deploy failed:", err.message || err);
  process.exit(1);
}
