/* ============================================================
   TIMELINE.JS — Peak cache, waveform draw, ruler draw
   Ultra-minimal, DPR-aware canvas
   ============================================================ */
(function (global) {
  const peakCache = new Map();

  function computePeaks(audioBuffer, pxPerSecond, viewDuration) {
    if (!audioBuffer) return null;
    const dur = viewDuration || audioBuffer.duration;
    const sr = audioBuffer.sampleRate;
    const key = audioBuffer.length + ":" + audioBuffer.numberOfChannels + ":"
              + pxPerSecond.toFixed(2) + ":" + dur.toFixed(3);
    if (peakCache.has(key)) return peakCache.get(key);

    const nCh = audioBuffer.numberOfChannels;
    const ch = [];
    for (let i = 0; i < nCh; i++) ch.push(audioBuffer.getChannelData(i));
    const total = Math.floor(dur * sr);
    const spp = Math.max(1, Math.floor(sr / pxPerSecond));
    const npx = Math.max(1, Math.ceil(total / spp));
    const maxA = new Float32Array(npx);
    const rmsA = new Float32Array(npx);
    for (let p = 0; p < npx; p++) {
      const s0 = p * spp;
      const s1 = Math.min(s0 + spp, total);
      let mx = 0, s2 = 0, cnt = 0;
      for (let s = s0; s < s1; s++) {
        let v = 0;
        for (let c = 0; c < nCh; c++) v += Math.abs(ch[c][s] || 0);
        v = v / nCh;
        if (v > mx) mx = v;
        s2 += v * v; cnt++;
      }
      maxA[p] = mx;
      rmsA[p] = cnt > 0 ? Math.sqrt(s2 / cnt) : 0;
    }
    const out = { peaks: maxA, rms: rmsA, npx, spp, pps: pxPerSecond, dur };
    peakCache.set(key, out);
    return out;
  }

  function clearPeaks(audioBuffer) {
    const prefix = audioBuffer.length + ":" + audioBuffer.numberOfChannels + ":";
    for (const k of Array.from(peakCache.keys())) if (k.startsWith(prefix)) peakCache.delete(k);
  }

  function rgba(hex, a) {
    const h = (hex||"#888").replace("#","");
    const c = h.length === 3 ? h.split("").map(x=>x+x).join("") : h;
    const n = parseInt(c,16);
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
  }

  function drawWaveform(canvas, audioBuffer, color, pxPerSecond) {
    if (!canvas || !audioBuffer) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.floor(r.width * dpr));
    const H = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);

    const pk = computePeaks(audioBuffer, pxPerSecond * dpr, audioBuffer.duration);
    if (!pk) return;
    const mid = H / 2;
    const maxH = H * 0.44;
    const drawW = Math.min(W, pk.npx);

    // Fill (rms-like)
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let x = 0; x < drawW; x++) {
      const h = pk.rms[x] * maxH * 1.4;
      ctx.lineTo(x, mid - h);
    }
    for (let x = drawW - 1; x >= 0; x--) {
      const h = pk.rms[x] * maxH * 1.4;
      ctx.lineTo(x, mid + h);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(color, 0.55);
    ctx.fill();

    // Outline (peak)
    ctx.strokeStyle = rgba("#ffffff", 0.75);
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    for (let x = 0; x < drawW; x++) {
      const h = pk.peaks[x] * maxH;
      ctx.moveTo(x + 0.5, mid - h);
      ctx.lineTo(x + 0.5, mid);
      ctx.lineTo(x + 0.5, mid + h);
    }
    ctx.stroke();

    // Center line
    ctx.strokeStyle = rgba("#ffffff", 0.08);
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, mid + 0.5);
    ctx.lineTo(drawW, mid + 0.5);
    ctx.stroke();
  }

  function formatTC(sec, fps = 25) {
    sec = Math.max(0, sec || 0);
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = Math.floor(sec%60);
    const f = Math.floor((sec - Math.floor(sec)) * fps);
    const z = (n, w=2) => String(n).padStart(w, "0");
    return z(h)+":"+z(m)+":"+z(s)+":"+z(f);
  }
  function formatHMSms(sec) {
    sec = Math.max(0, sec || 0);
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = Math.floor(sec%60);
    const ms = Math.floor((sec - Math.floor(sec)) * 1000);
    const z = (n, w=2) => String(n).padStart(w, "0");
    return z(h)+":"+z(m)+":"+z(s)+"."+z(ms,3);
  }

  function drawRuler(canvas, pxPerSecond, totalDuration, scrollLeftPx) {
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.floor(r.width * dpr));
    const H = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const pps = pxPerSecond * dpr;
    const scrollS = (scrollLeftPx || 0) / pxPerSecond;
    const endS = scrollS + (r.width / pxPerSecond);
    const minPx = 60 * dpr;
    const steps = [3600, 600, 60, 30, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01];
    let step = 1;
    for (const s of steps) if (s * pps >= minPx) { step = s; break; }
    const minor = step / 5;

    ctx.fillStyle = "#262626";
    ctx.fillRect(0, 0, W, H);

    ctx.font = (10*dpr)+'px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = "top";
    ctx.fillStyle = "#d0d0d0";

    const firstMajor = Math.floor(scrollS / step) * step;
    ctx.strokeStyle = "rgba(0,145,255,0.55)";
    ctx.lineWidth = 1 * dpr;
    for (let t = firstMajor; t <= endS + step; t += step) {
      const x = Math.floor((t - scrollS) * pps);
      if (x < -50 || x > W + 50) continue;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, H * 0.45);
      ctx.lineTo(x + 0.5, H - 1*dpr);
      ctx.stroke();
      ctx.fillStyle = "#cfcfcf";
      ctx.fillText(formatTC(t), x + 4*dpr, 3*dpr);
    }

    const firstMinor = Math.floor(scrollS / minor) * minor;
    for (let t = firstMinor; t <= endS + minor; t += minor) {
      if (Math.abs((t % step)) < 1e-6) continue;
      const x = Math.floor((t - scrollS) * pps);
      const fifth = Math.abs((Math.round(t/minor) % 5)) < 1e-6;
      ctx.strokeStyle = fifth ? "rgba(120,120,140,0.5)" : "rgba(80,80,100,0.3)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, H - 6*dpr);
      ctx.lineTo(x + 0.5, H - 1*dpr);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(80,80,100,0.35)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.stroke();
  }

  global.Timeline = {
    computePeaks, clearPeaks,
    drawWaveform, drawRuler, formatTC, formatHMSms
  };
})(window);
