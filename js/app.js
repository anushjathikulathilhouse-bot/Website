/* ============================================================
   APP.JS — Main glue: track UI, lanes, scrub/zoom/touch
   ============================================================ */
(function () {
  "use strict";

  // ---- Manifest of audio files in the vocals folder.
  //      Auto-discoverable: app will first try fetch(manifest.json),
  //      else fall back to probing known files in /vocals
  const DEFAULT_FILES = [
    { name: "Keyboard.mp3", path: "vocals/Keyboard.mp3" }
    // Add additional files manually here if needed, or use generate-manifest.cmd
  ];

  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Track store (simple reactive array)
  const state = {
    tracks: [],
    current: 0,            // seconds
    duration: 0,
    zoom: 100,             // px / second
    masterVol: 1,
    tempo: 1,
    bpm: 120,
    selectedId: null
  };

  const COLORS = AudioEngine.TRACK_COLORS;
  let nextId = 1;

  // DOM refs
  let el;
  const ui = {};
  const trackUIs = new Map(); // id -> { card, lane, clip, clipCv, vol, pan, mute, solo }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    el = {
      play:     $("#btnPlay"),
      stop:     $("#btnStop"),
      curr:     $("#current"),
      tot:      $("#total"),
      iPlay:    $(".i-play", $("#btnPlay")),
      iPause:   $(".i-pause", $("#btnPlay")),
      masterV:  $("#masterVol"),
      masterDb: $("#masterDb"),
      zoom:     $("#zoom"),
      zoomV:    $("#zoomVal"),
      tracks:   $("#trackList"),
      badge:    $("#countBadge"),
      lanesIn:  $("#lanesInner"),
      lanesSc:  $("#lanesScroll"),
      lanesW:   $("#lanesWrap"),
      rulerCv:  $("#rulerCv"),
      rulerHit: $("#rulerHit"),
      ph:       $("#playhead"),
      stDot:    $("#stPlay"),
      stTxt:    $("#stText"),
      sr:       $("#srInfo"),
      ti:       $("#tInfo")
    };
    Object.assign(ui, el);

    bindMasterControls();
    bindScrubbing();
    bindKeyboard();

    try { AudioEngine.ensure(); }
    catch (e) { setStatus("Audio init failed: " + e.message, true); }

    ui.sr.textContent = (AudioEngine.sampleRate()/1000).toFixed(1)+" kHz";
    ui.zoomV.textContent = String(state.zoom);

    const files = await discoverAudioFiles();
    if (files.length === 0) {
      setStatus("No audio files found in /vocals", true);
      return;
    }
    for (const f of files) addTrack(f.name, f.path);
    updateCount();
    layoutAll();
    for (const t of state.tracks) {
      loadTrackAudio(t);
    }

    // Continuous UI refresh loop (playhead, meters)
    requestAnimationFrame(loop);

    window.addEventListener("resize", () => {
      clearTimeout(window.__rl);
      window.__rl = setTimeout(layoutAll, 80);
    });

    setStatus("Tap Play");
  });

  async function discoverAudioFiles() {
    try {
      const r = await fetch("manifest.json", { cache: "no-store" });
      if (r.ok) {
        const json = await r.json();
        if (Array.isArray(json) && json.length) {
          return json.map(f => typeof f === "string" ? { name: f.split("/").pop(), path: f } : f);
        }
        if (json && Array.isArray(json.files)) {
          return json.files.map(f => typeof f === "string" ? { name: f.split("/").pop(), path: f } : f);
        }
      }
    } catch (_) {}
    return DEFAULT_FILES.slice();
  }

  /* ---------- Tracks ---------- */
  function addTrack(name, path) {
    const id = nextId++;
    const color = COLORS[(id-1) % COLORS.length];
    const track = {
      id, name, path,
      color, dark: AudioEngine.darker(color),
      buffer: null, loaded: false, loading: false,
      muted: false, soloed: false,
      volume: 0.9, pan: 0,
      start: 0
    };
    state.tracks.push(track);
    AudioEngine.createTrack(track);
    AudioEngine.setVolume(track.id, track.volume);
    AudioEngine.setPan(track.id, track.pan);
    if (state.selectedId == null) state.selectedId = id;
    buildCards();
    return track;
  }

  function buildCards() {
    ui.tracks.innerHTML = "";
    ui.lanesIn.innerHTML = "";
    trackUIs.clear();
    for (const t of state.tracks) buildCard(t);
  }
  function buildCard(t) {
    const card = document.createElement("div");
    card.className = "trk";
    card.dataset.id = t.id;
    card.style.setProperty("--tc", t.color);
    card.innerHTML = `
      <div class="trk-row1">
        <div class="trk-idx">${String(t.id).padStart(2,"0")}</div>
        <div class="trk-name" title="${escAttr(t.name)}">${esc(t.name)}</div>
        <div class="trk-ms">
          <button class="ms-btn m" aria-label="Mute">M</button>
          <button class="ms-btn s" aria-label="Solo">S</button>
        </div>
      </div>
      <div class="trk-row2">
        <span class="sl-lbl">VOL</span>
        <input type="range" class="sl-vol" min="0" max="1.5" step="0.001" value="${t.volume}" />
        <span class="sl-val vol-val">${fmtDb(lin2Db(t.volume))}</span>
      </div>
      <div class="trk-row3">
        <span class="sl-lbl">PAN</span>
        <input type="range" class="sl-pan" min="-1" max="1" step="0.01" value="${t.pan}" />
        <span class="sl-val pan-val">${fmtPan(t.pan)}</span>
      </div>
    `;
    ui.tracks.appendChild(card);

    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.id = t.id;
    const clip = document.createElement("div");
    clip.className = "clip";
    clip.dataset.id = t.id;
    clip.style.setProperty("--tc", t.color);
    clip.style.setProperty("--tc-border", t.dark);
    clip.style.left = "0px";
    const clipName = document.createElement("div");
    clipName.className = "clip-name";
    clipName.textContent = t.name;
    const clipCv = document.createElement("canvas");
    clip.appendChild(clipCv);
    clip.appendChild(clipName);
    lane.appendChild(clip);
    ui.lanesIn.appendChild(lane);

    const refs = {
      card, lane, clip, clipCv, clipName,
      mute: $(".m", card),
      solo: $(".s", card),
      vol:  $(".sl-vol", card),
      volV: $(".vol-val", card),
      pan:  $(".sl-pan", card),
      panV: $(".pan-val", card),
      name: $(".trk-name", card)
    };
    trackUIs.set(t.id, refs);

    card.addEventListener("click", (e) => {
      if (e.target.closest(".ms-btn") || e.target.closest("input")) return;
      selectTrack(t.id);
    });
    lane.addEventListener("click", (e) => {
      if (e.target.closest(".clip")) selectTrack(t.id);
    });
    refs.mute.addEventListener("click", (e) => {
      e.stopPropagation(); toggleMute(t.id);
    });
    refs.solo.addEventListener("click", (e) => {
      e.stopPropagation(); toggleSolo(t.id);
    });
    refs.vol.addEventListener("input", () => {
      const v = parseFloat(refs.vol.value);
      t.volume = v;
      AudioEngine.setVolume(t.id, v);
      refs.volV.textContent = fmtDb(lin2Db(v));
    });
    refs.pan.addEventListener("input", () => {
      const v = parseFloat(refs.pan.value);
      t.pan = v;
      AudioEngine.setPan(t.id, v);
      refs.panV.textContent = fmtPan(v);
    });

    if (t.id === state.selectedId) applySelectionVisual();
    applyMuteSoloVisual();
  }

  async function loadTrackAudio(t) {
    const r = trackUIs.get(t.id);
    if (!r) return;
    if (t.loaded || t.loading) return;
    t.loading = true;
    setStatus(`Loading ${t.name}…`);
    try {
      const buf = await AudioEngine.loadFile(t.path);
      t.buffer = buf; t.loaded = true; t.loading = false;
      AudioEngine.setBuffer(t.id, buf);
      state.duration = Math.max(state.duration, buf.duration);
      layoutLane(t);
      drawWave(t);
      updateDuration();
      setStatus(`Loaded ${t.name}`);
    } catch (e) {
      t.loading = false;
      console.error(e);
      r.name.style.color = "#ff5a5a";
      setStatus(`Failed to load ${t.name}`, true);
    }
  }

  function drawWave(t) {
    const r = trackUIs.get(t.id);
    if (!r || !t.buffer) return;
    Timeline.drawWaveform(r.clipCv, t.buffer, t.color, state.zoom);
  }
  function layoutLane(t) {
    const r = trackUIs.get(t.id);
    if (!r) return;
    const w = Math.max(1, (t.buffer ? t.buffer.duration : 0) * state.zoom);
    r.clip.style.left = (t.start * state.zoom) + "px";
    r.clip.style.width = w + "px";
  }
  function layoutAll() {
    const totalW = Math.max(ui.lanesSc.clientWidth + 40,
      (Math.max(state.duration, 5) * state.zoom) + 100);
    ui.lanesIn.style.width = totalW + "px";
    const hVar = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--h-track") || "64", 10);
    ui.lanesIn.style.height = (state.tracks.length * hVar) + "px";

    // Ruler
    Timeline.drawRuler(ui.rulerCv, state.zoom, state.duration || 0, ui.lanesSc.scrollLeft);
    for (const t of state.tracks) { layoutLane(t); drawWave(t); }
    updateDuration();
    updatePlayheadPos();
  }

  function selectTrack(id) {
    state.selectedId = id;
    applySelectionVisual();
  }
  function applySelectionVisual() {
    $$(".trk", ui.tracks).forEach(c => c.classList.toggle("selected", Number(c.dataset.id) === state.selectedId));
    $$(".lane", ui.lanesIn).forEach(c => c.classList.toggle("selected", Number(c.dataset.id) === state.selectedId));
  }

  function toggleMute(id) {
    const t = state.tracks.find(x => x.id === id); if (!t) return;
    t.muted = !t.muted;
    applyMuteSoloVisual();
  }
  function toggleSolo(id) {
    const t = state.tracks.find(x => x.id === id); if (!t) return;
    t.soloed = !t.soloed;
    applyMuteSoloVisual();
  }
  function applyMuteSoloVisual() {
    const anySolo = state.tracks.some(t => t.soloed);
    for (const t of state.tracks) {
      const r = trackUIs.get(t.id); if (!r) continue;
      r.mute.classList.toggle("on", t.muted);
      r.solo.classList.toggle("on", t.soloed);
      r.card.classList.toggle("muted", t.muted);
      r.card.classList.toggle("soloed", t.soloed);
      let on = true;
      if (t.muted) on = false;
      if (anySolo && !t.soloed) on = false;
      r.lane.classList.toggle("muted", !on);
      r.lane.classList.toggle("soloed", t.soloed);
      AudioEngine.setAudible(t.id, on ? 1 : 0);
    }
  }

  /* ---------- Master controls ---------- */
  function bindMasterControls() {
    ui.play.addEventListener("click", togglePlay);
    ui.stop.addEventListener("click", doStop);
    ui.masterV.addEventListener("input", () => {
      const v = parseFloat(ui.masterV.value);
      state.masterVol = v;
      AudioEngine.setMasterVolume(v);
      ui.masterDb.textContent = fmtDb(lin2Db(v));
    });
    ui.zoom.addEventListener("input", () => {
      const v = parseFloat(ui.zoom.value);
      state.zoom = v;
      ui.zoomV.textContent = String(v);
      layoutAll();
    });
  }

  function togglePlay() {
    AudioEngine.ensure();
    if (AudioEngine.isPlaying()) {
      const t = AudioEngine.pausePlay();
      state.current = t || 0;
    } else {
      AudioEngine.startPlay(state.current || 0);
    }
    refreshTransportVisual();
  }
  function doStop() {
    AudioEngine.stopAll();
    state.current = 0;
    refreshTransportVisual();
    updatePlayheadPos();
  }
  function seekTo(s) {
    const t = clamp(s, 0, state.duration || 0);
    AudioEngine.seekTo(t);
    state.current = t;
    updatePlayheadPos();
  }
  function refreshTransportVisual() {
    const p = AudioEngine.isPlaying();
    ui.play.classList.toggle("playing", p);
    ui.iPlay.style.display  = p ? "none" : "block";
    ui.iPause.style.display = p ? "block" : "none";
    ui.stDot.className = "dot " + (p ? "playing" : (state.current > 0.001 ? "paused" : "stopped"));
    ui.stTxt.textContent = p ? "Playing" : (state.current > 0.001 ? "Paused" : (state.tracks.some(t=>t.loaded) ? "Ready" : "Loading…"));
  }

  /* ---------- Scrubbing + touch + pinch zoom ---------- */
  let drag = null;
  function bindScrubbing() {
    function eventPos(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX || 0, y: e.clientY || 0 };
    }
    function clientToTime(e, hostEl) {
      const r = hostEl.getBoundingClientRect();
      const p = eventPos(e);
      const xRel = p.x - r.left + ui.lanesSc.scrollLeft;
      return clamp(xRel / state.zoom, 0, state.duration || 0);
    }

    function onDown(e, host) {
      // Ignore if user is interacting with clip label
      if (e.target && (e.target.closest && e.target.closest("input, button, select, a"))) return;
      // Only primary button for mouse
      if (e.type === "mousedown" && e.button !== 0) return;
      drag = { mode: "scrub" };
      AudioEngine.ensure();
      seekTo(clientToTime(e, host));
      try { e.preventDefault(); } catch(_){}
    }
    function onMove(e) {
      if (!drag || drag.mode !== "scrub") return;
      seekTo(clientToTime(e, ui.lanesW));
    }
    function onUp() {
      drag = null; pinch = null;
    }

    // Ruler + lanes: mouse & touch scrub
    ui.rulerHit.addEventListener("mousedown",  (e) => onDown(e, ui.rulerHit));
    ui.lanesW.addEventListener("mousedown",   (e) => onDown(e, ui.lanesW));
    ui.rulerHit.addEventListener("touchstart", (e) => onDown(e, ui.rulerHit), { passive: false });
    ui.lanesW.addEventListener("touchstart",  (e) => {
      if (e.touches.length === 1) onDown(e, ui.lanesW);
    }, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);

    // Scroll lanes also re-draws ruler
    let sct;
    ui.lanesSc.addEventListener("scroll", () => {
      Timeline.drawRuler(ui.rulerCv, state.zoom, state.duration || 0, ui.lanesSc.scrollLeft);
      updatePlayheadPos();
      clearTimeout(sct);
      sct = setTimeout(() => {}, 10);
    }, { passive: true });

    // Pinch zoom on the lanes area
    let pinch = null;
    function dist(p1, p2) {
      const dx = p1.x - p2.x, dy = p1.y - p2.y;
      return Math.sqrt(dx*dx + dy*dy);
    }
    function onTouchMove(e) {
      if (e.touches.length === 2) {
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        const d  = dist(p1, p2);
        if (!pinch) {
          pinch = { d0: d, z0: state.zoom };
        } else {
          const ratio = d / pinch.d0;
          const z = clamp(pinch.z0 * ratio, parseFloat(ui.zoom.min), parseFloat(ui.zoom.max));
          state.zoom = z;
          ui.zoom.value = z;
          ui.zoomV.textContent = String(Math.round(z));
          layoutAll();
        }
        try { e.preventDefault(); } catch(_){}
        return;
      }
      onMove(e);
    }
  }

  /* ---------- Keyboard ---------- */
  function bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.repeat) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (e.shiftKey) doStop(); else togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(state.current - (e.shiftKey ? 10 : 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(state.current + (e.shiftKey ? 10 : 1));
          break;
        case "PageUp":
          e.preventDefault();
          seekTo(state.current - 5);
          break;
        case "PageDown":
          e.preventDefault();
          seekTo(state.current + 5);
          break;
        case "Home":
          e.preventDefault(); seekTo(0); break;
        case "End":
          e.preventDefault(); seekTo(state.duration || 0); break;
        case "m": case "M":
          if (state.selectedId != null) toggleMute(state.selectedId);
          break;
        case "s": case "S":
          if (state.selectedId != null) toggleSolo(state.selectedId);
          break;
        case "+": case "=":
          state.zoom = clamp(state.zoom + 20, parseFloat(ui.zoom.min), parseFloat(ui.zoom.max));
          ui.zoom.value = state.zoom; ui.zoomV.textContent = String(Math.round(state.zoom));
          layoutAll(); break;
        case "-": case "_":
          state.zoom = clamp(state.zoom - 20, parseFloat(ui.zoom.min), parseFloat(ui.zoom.max));
          ui.zoom.value = state.zoom; ui.zoomV.textContent = String(Math.round(state.zoom));
          layoutAll(); break;
      }
    });
  }

  /* ---------- Continuous refresh ---------- */
  function loop() {
    if (AudioEngine.isPlaying()) {
      state.current = AudioEngine.getTime();
      // Auto-stop at end
      if (state.duration > 0 && state.current >= state.duration - 0.02) {
        doStop();
      }
      updatePlayheadPos();
    }
    requestAnimationFrame(loop);
  }

  /* ---------- Helpers ---------- */
  function updatePlayheadPos() {
    const p = state.current * state.zoom;
    const scl = ui.lanesSc.scrollLeft;
    ui.ph.style.left = (p - scl) + "px";
    ui.curr.textContent = Timeline.formatTC(state.current);

    // Auto-follow playhead at edges
    const wr = ui.lanesW.getBoundingClientRect();
    const viewportEnd = scl + wr.width;
    if (p < scl + 30) {
      ui.lanesSc.scrollLeft = Math.max(0, p - 80);
    } else if (p > viewportEnd - 80) {
      ui.lanesSc.scrollLeft = p - wr.width + 80;
    }
  }
  function updateDuration() {
    ui.tot.textContent = Timeline.formatTC(state.duration || 0);
  }
  function updateCount() {
    ui.badge.textContent = String(state.tracks.length);
    ui.ti.textContent = state.tracks.length + " track" + (state.tracks.length === 1 ? "" : "s");
  }
  function setStatus(msg, err) {
    ui.stTxt.textContent = msg;
    if (err) {
      ui.stDot.className = "dot stopped";
    } else {
      refreshTransportVisual();
    }
  }

  const lin2Db = (l) => l > 0 ? 20 * Math.log10(l) : -Infinity;
  function fmtDb(db) {
    if (!isFinite(db)) return "-∞";
    return (db >= 0 ? "+" : "") + db.toFixed(1);
  }
  function fmtPan(p) {
    if (Math.abs(p) < 0.02) return "C";
    return (p < 0 ? "L" : "R") + Math.round(Math.abs(p) * 100);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
    })[c]);
  }
  function escAttr(s) { return esc(s); }
})();
