/* ============================================================
   AUDIO.JS — Minimal Web Audio Multi-Track Engine
   - 1 AudioContext shared across all tracks
   - Sample-accurate sync: all sources start() with same offset
   - Per track: Gain, StereoPan, Analyser, Solo/Mute Gain
   ============================================================ */
(function (global) {
  const TRACK_COLORS = [
    "#2d6cdf", "#00887a", "#d94f4f", "#d1a114",
    "#7b51c9", "#1e9c90", "#c96114", "#9c5686",
    "#3d7cc4", "#5d9c43", "#c94d86", "#9966cc",
    "#2f9aa0", "#cc6633", "#5577aa", "#aa5577"
  ];
  const darker = (hex) => {
    const h = hex.replace("#","");
    const c = h.length === 3 ? h.split("").map(x=>x+x).join("") : h;
    const n = parseInt(c,16);
    let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    r=Math.round(r*0.6); g=Math.round(g*0.6); b=Math.round(b*0.6);
    return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
  };

  let ctx = null;
  let masterGain = null;
  const trackMap = new Map(); // id -> graph
  let nextId = 1;

  const play = {
    playing: false,
    ctxStart: 0,     // AudioContext.currentTime at play start
    projStart: 0,    // project time in seconds at play start
    tempo: 1.0,
    lastTime: 0      // last pause/stop position
  };
  let rafId = 0;
  const tickCbs = new Set();
  const stateCbs = new Set();

  function ensure() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error("Web Audio not supported");
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function sampleRate() { ensure(); return ctx.sampleRate; }

  async function loadFile(url, onProgress) {
    ensure();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const total = Number(resp.headers.get("content-length")) || 0;
    const reader = resp.body.getReader();
    let received = 0; const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length;
      if (onProgress && total) onProgress(received / total);
    }
    const len = chunks.reduce((a,c)=>a+c.length,0);
    const buf = new Uint8Array(len);
    let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
    return ctx.decodeAudioData(buf.buffer.slice(0));
  }

  /* ---------- Track graph ----------
   * Source -> inGain -> PanNode -> faderGain -> analyser -> soloMuteGain -> masterGain
   */
  function createTrack(track) {
    ensure();
    const id = track.id;
    if (trackMap.has(id)) return trackMap.get(id);
    const inGain = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const fader = ctx.createGain();
    fader.gain.value = track.volume != null ? track.volume : 0.9;
    const ans = ctx.createAnalyser();
    ans.fftSize = 512; ans.smoothingTimeConstant = 0.5;
    const sm = ctx.createGain();
    sm.gain.value = 1;
    if (pan) { inGain.connect(pan); pan.connect(fader); }
    else { inGain.connect(fader); }
    fader.connect(ans); ans.connect(sm); sm.connect(masterGain);
    const g = {
      src: null, buffer: null, inGain, pan, fader, ans, sm,
      playbackRate: 1.0,
      level: 0, peak: 0, rms: 0
    };
    trackMap.set(id, g);
    return g;
  }

  function setBuffer(id, audioBuffer) {
    const g = trackMap.get(id); if (!g) return;
    g.buffer = audioBuffer;
  }

  function destroyTrack(id) {
    const g = trackMap.get(id); if (!g) return;
    try { if (g.src) { g.src.stop(); g.src.disconnect(); } } catch(_){}
    try { g.inGain.disconnect(); if (g.pan) g.pan.disconnect(); g.fader.disconnect(); g.ans.disconnect(); g.sm.disconnect(); } catch(_){}
    trackMap.delete(id);
  }

  function setVolume(id, v) { const g = trackMap.get(id); if (g) g.fader.gain.setTargetAtTime(v, ctx.currentTime, 0.008); }
  function setPan(id, v) { const g = trackMap.get(id); if (g && g.pan) g.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,v)), ctx.currentTime, 0.008); }
  function setAudible(id, isOn) { const g = trackMap.get(id); if (g) g.sm.gain.setTargetAtTime(isOn?1:0, ctx.currentTime, 0.008); }
  function setMasterVolume(v) { ensure(); masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.008); }

  function setTempo(t) {
    play.tempo = Math.max(0.1, Math.min(8, t));
    for (const g of trackMap.values()) {
      g.playbackRate = play.tempo;
      if (g.src) g.src.playbackRate.setTargetAtTime(play.tempo, ctx.currentTime, 0.008);
    }
  }
  function getTempo() { return play.tempo; }

  function _stopSources() {
    for (const g of trackMap.values()) {
      if (g.src) { try { g.src.stop(); } catch(_){} try { g.src.disconnect(); } catch(_){} g.src = null; }
    }
  }

  function _rebuildSourcesAt(projectOffset) {
    _stopSources();
    for (const [id, g] of trackMap.entries()) {
      if (!g.buffer) continue;
      const dur = g.buffer.duration;
      const start = Math.max(0, projectOffset);
      if (start >= dur) continue;
      const src = ctx.createBufferSource();
      src.buffer = g.buffer;
      src.playbackRate.value = play.tempo;
      g.playbackRate = play.tempo;
      src.connect(g.inGain);
      try { src.start(0, start); } catch (_) {}
      g.src = src;
    }
  }

  function startPlay(projectTime) {
    ensure();
    if (ctx.state === "suspended") ctx.resume();
    const t = Math.max(0, projectTime || 0);
    _rebuildSourcesAt(t);
    play.playing = true;
    play.ctxStart = ctx.currentTime;
    play.projStart = t;
    play.lastTime = t;
    _startTick();
    _emitState();
  }

  function pausePlay() {
    if (!play.playing) return play.lastTime;
    const now = getTime();
    play.lastTime = now;
    _stopSources();
    play.playing = false;
    _cancelTick();
    _emitState();
    return now;
  }

  function stopAll() {
    _stopSources();
    play.playing = false;
    play.lastTime = 0;
    play.projStart = 0;
    play.ctxStart = 0;
    _cancelTick();
    _emitState();
  }

  function seekTo(projectTime) {
    const t = Math.max(0, projectTime);
    play.lastTime = t;
    if (play.playing) {
      _rebuildSourcesAt(t);
      play.ctxStart = ctx.currentTime;
      play.projStart = t;
    }
    _emitTick();
  }

  function getTime() {
    if (!play.playing) return play.lastTime;
    ensure();
    return play.projStart + (ctx.currentTime - play.ctxStart) * play.tempo;
  }
  function isPlaying() { return play.playing; }

  /* ---------- Level / metering ---------- */
  function readLevel(analyser) {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let s = 0, p = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      s += v*v; if (v > p) p = v;
    }
    return { rms: Math.sqrt(s/buf.length), peak: p };
  }
  function trackLevel(id) {
    const g = trackMap.get(id); if (!g) return { level: 0, peak: 0, rms: 0 };
    const { rms, peak } = readLevel(g.ans);
    g.level = Math.max(g.level * 0.7, rms);
    g.peak  = Math.max(g.peak * 0.92, peak);
    g.rms   = Math.max(g.rms * 0.8, rms);
    return { level: g.level, peak: g.peak, rms: g.rms };
  }
  function masterLevel() {
    ensure();
    // route a tap: we create a per-frame measuring with simple script
    // Instead just return average of all track levels weighted by fader. Approximation.
    let lvl = 0, pk = 0, n = 0;
    for (const g of trackMap.values()) {
      const v = trackLevel(g.__id || 0);
      lvl += g.level; pk = Math.max(pk, g.peak); n++;
    }
    return { level: n? lvl/n : 0, peak: pk };
  }

  /* ---------- RAF tick loop ---------- */
  function _startTick() {
    if (rafId) return;
    const loop = () => {
      for (const [id, g] of trackMap.entries()) { g.__id = id; trackLevel(id); }
      _emitTick();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  function _cancelTick() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function onTick(cb) { tickCbs.add(cb); return () => tickCbs.delete(cb); }
  function onState(cb) { stateCbs.add(cb); return () => stateCbs.delete(cb); }
  function _emitTick() {
    const t = getTime();
    for (const cb of tickCbs) { try { cb(t); } catch(e){} }
  }
  function _emitState() {
    for (const cb of stateCbs) { try { cb({ playing: play.playing, time: play.lastTime }); } catch(e){} }
  }

  global.AudioEngine = {
    TRACK_COLORS, darker,
    ensure, sampleRate, loadFile,
    createTrack, setBuffer, destroyTrack,
    setVolume, setPan, setAudible, setMasterVolume,
    setTempo, getTempo,
    startPlay, pausePlay, stopAll, seekTo,
    getTime, isPlaying,
    trackLevel, masterLevel,
    onTick, onState
  };
})(window);
