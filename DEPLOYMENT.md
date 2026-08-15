# Deployment Guide

This guide explains how to deploy the Premiere Timeline Audio Player to GitHub Pages and other platforms.

## GitHub Pages Deployment

### Prerequisites

- Node.js 18+ installed
- Git configured
- GitHub repository set up

### Quick Deployment

Run the deployment script:

```bash
npm run deploy
```

This will:
1. Build the production distribution (`npm run build`)
2. Push the contents of `dist/` to the `gh-pages` branch
3. Activate GitHub Pages hosting

### Manual GitHub Pages Setup

If you haven't enabled GitHub Pages yet:

1. Go to your repository **Settings** → **Pages**
2. Set **Source** to "Deploy from a branch"
3. Select branch: `gh-pages`
4. Select folder: `/ (root)`
5. Click **Save**

Your site will be available at:
```
https://<USERNAME>.github.io/<REPO>/
```

### Verifying Deployment

1. Check that `gh-pages` branch was created in your repository
2. Visit your GitHub Pages URL
3. The application should load with audio working

## Local Testing

Before deploying, test locally:

```bash
# Install dependencies
npm install

# Development server
npm start
# Open http://localhost:8080

# Production build
npm run build
# Open dist/index.html in a browser
```

## Build Process

The build script (`scripts/build.mjs`) performs:

1. **JavaScript minification** — esbuild bundles and minifies all JS files
2. **CSS minification** — lightningcss compresses stylesheets
3. **HTML minification** — html-minifier-terser removes unnecessary markup
4. **Asset copying** — Copies `/vocals` folder and `manifest.json`
5. **GitHub Pages setup** — Creates `.nojekyll` file to serve underscore-prefixed files

### Build Output

- **dist/index.html** — Minified HTML (~2.4 KB)
- **dist/assets/app.bundle.min.js** — Bundled & minified JavaScript (~19 KB)
- **dist/assets/styles.min.css** — Minified CSS (~10 KB)
- **dist/vocals/** — Audio files (copied as-is)
- **dist/manifest.json** — Audio file manifest
- **dist/.nojekyll** — GitHub Pages marker file

**Total size:** ~5.6 MB (mostly from audio files)

## Audio Files

Audio files must be in the `vocals/` folder. Supported formats:
- `.mp3`
- `.wav`
- `.ogg`
- `.m4a`
- `.aac`
- `.flac`

After adding new audio files:

```bash
# Regenerate manifest (Node.js)
node scripts/generate-manifest.mjs

# Or Windows batch
generate-manifest.cmd
```

## Environment Variables

The application doesn't require environment variables, but you can customize:

- `PORT` — Dev server port (default: `8080`)
  ```bash
  PORT=3000 npm start
  ```

## Troubleshooting

### Audio not loading
- Ensure audio files are in `vocals/` folder
- Run `node scripts/generate-manifest.mjs` to update `manifest.json`
- Check browser console for CORS errors
- Audio must be served over HTTP(S), not `file://`

### Playhead not syncing
- Ensure only one `AudioContext` is created (see `audio.js`)
- Check browser console for Web Audio errors
- Try refreshing the page

### Waveforms not displaying
- Verify canvas is properly sized in `drawWaveform()` function
- Check device pixel ratio (browser zoom may affect rendering)
- Look for errors in browser DevTools Console

### Build fails
- Ensure Node.js 18+ is installed
- Delete `node_modules/` and run `npm install` again
- Check for disk space (especially for audio files)

## Performance

The application is optimized for production:

- **Minified assets** — JS, CSS, and HTML are minified
- **Peak envelope caching** — Waveforms use pre-computed peak data
- **Single AudioContext** — Shared across all tracks for optimal performance
- **RAF loop** — 60 FPS playhead and meter updates
- **Touch-friendly** — Optimized for mobile with large hit targets

## Security

- No file uploads (fixed `vocals/` folder only)
- No user authentication required
- Static assets only — no server-side code
- CORS headers allow cross-origin requests when served remotely

## Advanced Deployment

### Custom Domain

To use a custom domain with GitHub Pages:

1. Purchase or configure your domain
2. Add DNS records (see GitHub Pages documentation)
3. Create a `CNAME` file in `dist/` with your domain name
4. Push to `gh-pages` branch

### CI/CD Pipeline

Create `.github/workflows/deploy.yml` for automatic deployment:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main, master]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

## Support

For issues, questions, or suggestions:
- Check the main [README.md](README.md)
- Review browser console errors (F12 → Console)
- Verify your Node.js and npm versions: `node --version && npm --version`
