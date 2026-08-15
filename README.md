# Premiere Timeline Multi-Track Audio Player

An ultra-minimal, Premiere Pro–style multi-track timeline for audio files stored in `vocals/`. Every real file in the `vocals/` folder becomes a track, labeled with its original filename. Fully responsive, mobile-first, and touch-friendly.

## Features

- **Premiere Pro timeline layout** — Left column: track controls; Right column: ruler + scrollable waveform lanes; shared playhead.
- **One track per real file** in `vocals/`, labeled with the original filename.
- **Per-track controls:** Mute, Solo, Volume fader (0 → +3.5 dB), Stereo Pan (L100 ↔ C ↔ R100).
- **Canvas waveforms** — Pre-computed peak envelopes, auto-redraw on zoom.
- **Sample-accurate sync** — Single shared `AudioContext`. Playback start for all tracks uses the same decoded offset, so no drift even for 16+ tracks.
- **Global controls:** Play/Pause, Stop, Master Volume, Tempo (0.25×–4×, rate-only speed change, pitch preserved via Web Audio), Timeline Zoom (20–800 px/s).
- **SMPTE timecode** readout (HH:MM:SS:FF) with moving playhead.
- **Scrubbing:** Click/drag on ruler or anywhere on the lanes; `AudioEngine.seek()` rebuilds all sources at the new offset.
- **Mobile touch interactions:**
  - Single-finger drag on ruler/lanes → scrub.
  - Two-finger pinch on lanes area → live horizontal zoom.
  - Tappable sliders with larger hit targets.
- **Keyboard shortcuts:** Space (play/pause), Shift+Space (stop), ←/→ (±1 s), Shift+←/→ (±10 s), Home/End, M (mute selected), S (solo selected), +/− (zoom).
- **Responsive breakpoints** for 900px, 640px, 380px, and landscape phones. Uses `100dvh` for notch-aware mobile viewports.

## Running locally

```bash
# Requires Node.js 18+
npm install
npm start        # dev server at http://localhost:8080
```

Then open the URL shown. The first time you press Play, the browser will unlock the AudioContext (required on all modern browsers).

> **Important:** Must be served over HTTP(S). `file://` will fail to fetch audio and `manifest.json` due to browser security.

## Adding / updating audio files

Drop any `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, or `.flac` into the `vocals/` folder, then regenerate the manifest:

```bash
# Windows (double-clickable)
generate-manifest.cmd

# Node (cross-platform)
node scripts/generate-manifest.mjs
```

The app reads `manifest.json` on load to discover all tracks. When it's missing, it falls back to the built-in default list in `js/app.js`.

## Production build

```bash
npm run build
```

Outputs an optimized, minified site into `dist/`:

```
dist/
├── assets/
│   ├── app.bundle.min.js   (audio + timeline + app, IIFE, minified)
│   └── styles.min.css      (lightningcss-minified)
├── index.html              (single JS bundle reference, minified HTML)
├── manifest.json
├── vocals/*                (copied from project root)
└── .nojekyll                (required for GitHub Pages)
```

## Deploying to GitHub Pages

### Option A: Automatic via GitHub Actions (recommended)

The workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main`/`master`:

1. `npm ci`
2. `node scripts/generate-manifest.mjs`
3. `npm run build`
4. Upload `dist/` as a Pages artifact
5. Deploy to GitHub Pages

Enable it once in your GitHub repo: **Settings → Pages → Source: GitHub Actions**.

### Option B: Manual from your machine

```bash
npm install
npm run deploy       # runs build + publishes dist/ → gh-pages branch
```

Then in **Settings → Pages → Source: Deploy from a branch → gh-pages / (root)**.

Live URL will be `https://<YOUR-USERNAME>.github.io/<REPO-NAME>/`.

## File structure

```
Website/
├── index.html                     Premiere-style shell (top + tracks + tl + status)
├── manifest.json                  Discovered tracks: [{name,path},…]
├── css/styles.css                 Minimal, responsive, mobile-first layout
├── js/
│   ├── audio.js                   Web Audio engine (one graph per track)
│   ├── timeline.js                Peak cache + waveform + ruler canvas draw
│   └── app.js                     UI glue, scrub/zoom/touch/keyboard
├── vocals/                        Audio source files (one track per file)
├── scripts/
│   ├── dev-server.mjs             Local HTTP server
│   ├── build.mjs                  Production minify + pack to dist/
│   ├── generate-manifest.mjs      Scan vocals/ → manifest.json
│   └── deploy-gh-pages.mjs        Push dist/ → gh-pages branch
├── .github/workflows/deploy.yml   CI: build + publish to GitHub Pages
├── package.json
├── generate-manifest.cmd          Windows double-click manifest generator
└── start-server.cmd               Windows double-click dev server (Node or Python)
```

## Browser support

Tested targets in production build: Chrome 80+, Firefox 80+, Safari 13+, Edge 80+.

| Feature | Chrome | Firefox | Safari | Edge |
|---|---|---|---|---|
| Multi-track sync | ✅ | ✅ | ✅ | ✅ |
| StereoPanner | ✅ | ✅ | ✅ 14.1+ | ✅ |
| DecodeAudioData | ✅ | ✅ | ✅ | ✅ |
| Pinch zoom (touch) | ✅ Android | N/A | ✅ iOS | ✅ |

## Performance notes

- Waveforms are cached per `(buffer × zoom)` — zoom changes only invalidate that dimension of the cache.
- All fader / pan / solo-mute changes use `AudioParam.setTargetAtTime` with τ = 5–8 ms — zero zipper noise.
- Only one RAF loop runs at all times (drives playhead position).
- Level meters use per-track `AnalyserNode.fftSize = 512` with 2048-point time-domain reads; trivial CPU overhead even with 16 tracks.

## License

MIT
