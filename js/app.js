(() => {
  'use strict';

  // ================== Base ==================
  const FIRST = 21;   // A0
  const LAST  = 108;  // C8
  const NAMES_ES = ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];
  const isBlack = m => [1,3,6,8,10].includes(m % 12);
  const octaveOf = m => Math.floor(m / 12) - 1;
  const $ = id => document.getElementById(id);

  // Colores por nota (arcoíris)
  const COLORS = {
    normal:   ['#ff5d73','#ff8a5b','#ffb84d','#ffd84d','#b6e35a','#5fd38d','#3cc9b0','#46b3ff','#5b8cff','#8a6bff','#c065ff','#ff5dc8'],
    princess: ['#ff8fc7','#ffa6c1','#ffc971','#ffe066','#b9f18c','#8ee6b0','#7bdff2','#90c8ff','#b4a6ff','#d29bff','#f0a6ff','#ff9ad5'],
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('piano.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('piano.' + k, JSON.stringify(v)); } catch {} }
  };

  const state = {
    whiteW: store.get('whiteW', 0),
    scroll: 0,
    sustain: store.get('sustain', false),
    labels: store.get('labels', 1),
    volume: store.get('volume', 0.8),
    theme: store.get('theme', 'princess'),
    rotateDismissed: false,
  };
  const noteColor = m => COLORS[state.theme === 'princess' ? 'princess' : 'normal'][m % 12];
  const noteName = m => NAMES_ES[m % 12];

  // ================== Audio ==================
  let ctx = null, master = null;
  const buffers = new Map();
  let samplesReady = false;

  const SAMPLE_NAMES = ['A0'];
  for (let o = 1; o <= 7; o++) SAMPLE_NAMES.push('C'+o, 'Ds'+o, 'Fs'+o, 'A'+o);
  SAMPLE_NAMES.push('C8');
  const nameToMidi = n => {
    const m = n.match(/^([A-G])(s|#)?(-?\d)$/);
    if (!m) return null;
    const base = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[m[1]] + (m[2] ? 1 : 0);
    return base + (parseInt(m[3]) + 1) * 12;
  };

  function initAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = state.volume;
    master.connect(comp).connect(ctx.destination);
    loadSamples();
  }

  async function loadSamples() {
    let done = 0;
    const setStatus = () => status(`Cargando sonido… ${Math.round(done / SAMPLE_NAMES.length * 100)}%`);
    setStatus();
    await Promise.all(SAMPLE_NAMES.map(async n => {
      try {
        const res = await fetch('samples/' + n + '.mp3');
        const arr = await res.arrayBuffer();
        const buf = await new Promise((ok, ko) => ctx.decodeAudioData(arr, ok, ko));
        buffers.set(nameToMidi(n), buf);
      } catch (e) { console.warn('No se pudo cargar', n, e); }
      done++; setStatus();
    }));
    samplesReady = buffers.size > 0;
    status(samplesReady ? 'Piano de cola listo' : 'Sonido sintetizado');
  }

  const voices = new Map();
  const held = new Set();
  const sustained = new Set();

  function nearestSample(midi) {
    let best = null, bd = 1e9;
    for (const m of buffers.keys()) { const d = Math.abs(m - midi); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  function startVoice(midi, velocity = 0.85) {
    if (!ctx) return;
    stopVoice(midi, 0.04);
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(master);
    let src;
    if (samplesReady) {
      const s = nearestSample(midi);
      src = ctx.createBufferSource();
      src.buffer = buffers.get(s);
      src.playbackRate.value = Math.pow(2, (midi - s) / 12);
      gain.gain.setValueAtTime(velocity, t);
      src.connect(gain);
      src.start(t);
    } else {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      src = ctx.createOscillator(); src.type = 'triangle'; src.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o2.connect(g2).connect(gain); src.connect(gain);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(velocity * 0.5, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(velocity * 0.12, t + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      src.start(t); o2.start(t); src.stop(t + 4); o2.stop(t + 4);
      src._o2 = o2;
    }
    voices.set(midi, { src, gain });
  }

  function stopVoice(midi, rel) {
    const v = voices.get(midi);
    if (!v) return;
    voices.delete(midi);
    const t = ctx.currentTime;
    const r = rel ?? (midi > 88 ? 0.25 : 0.45);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.setTargetAtTime(0, t, r / 4);
    try { v.src.stop(t + r + 0.1); if (v.src._o2) v.src._o2.stop(t + r + 0.1); } catch {}
    setTimeout(() => v.gain.disconnect(), (r + 0.3) * 1000);
  }

  // Efectos de sonido cortos (campanita)
  function chime(freqs, step = 0.07, vol = 0.12) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const t = t0 + i * step;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.55);
    });
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function noteOn(midi) {
    initAudio();
    if (held.has(midi)) return;
    held.add(midi);
    sustained.delete(midi);
    startVoice(midi);
    const el = keyEls[midi];
    if (el) { el.style.setProperty('--hit', noteColor(midi)); el.classList.add('down'); }
    drawMini();
    if (game.active) gamePress(midi);
    else if (state.theme === 'princess') { const k = keyScreen(midi); sparkle(k.x, k.top + 14, noteColor(midi), 5, 0.6); }
  }
  function noteOff(midi) {
    if (!held.has(midi)) return;
    held.delete(midi);
    keyEls[midi]?.classList.remove('down');
    if (state.sustain && !game.active) sustained.add(midi); else stopVoice(midi);
    drawMini();
    if (game.active) gameRelease(midi);
  }
  function releaseSustain() {
    for (const m of sustained) if (!held.has(m)) stopVoice(m, 0.6);
    sustained.clear();
  }

  // ================== Teclado ==================
  const stage = $('stage');
  const kb = $('kb');
  const keysEl = $('keys');
  const keyEls = {};
  const whiteList = [];
  for (let m = FIRST; m <= LAST; m++) if (!isBlack(m)) whiteList.push(m);
  const WHITE_COUNT = whiteList.length;
  const whiteIndex = {};
  whiteList.forEach((m, i) => whiteIndex[m] = i);

  const BLACK_OFFSET = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
  const BLACK_W = 0.6;

  const geom = { whiteW: 60, blackW: 36, totalW: 0, viewW: 0, viewH: 0, kbTop: 0 };

  function defaultWhiteW() {
    const w = stage.clientWidth || window.innerWidth;
    const target = w < 700 ? 14 : w < 1100 ? 21 : 28;
    return Math.max(28, Math.min(110, w / target));
  }

  function labelsMode() { return game.active ? 2 : state.labels; }
  function noteLabel(m) {
    const lm = labelsMode();
    if (lm === 0) return '';
    const pc = m % 12;
    if (lm === 1) return pc === 0 ? 'Do' + octaveOf(m) : '';
    if (game.active) return NAMES_ES[pc];
    return NAMES_ES[pc] + (pc === 0 ? octaveOf(m) : '');
  }

  function buildKeys() {
    keysEl.innerHTML = '';
    for (let m = FIRST; m <= LAST; m++) {
      const el = document.createElement('div');
      el.className = isBlack(m) ? 'black' : 'white' + (m % 12 === 0 ? ' c-key' : '');
      const lbl = document.createElement('span'); lbl.className = 'lbl';
      el.appendChild(lbl);
      keyEls[m] = el;
      keysEl.appendChild(el);
    }
  }

  function blackLeft(m) {
    const wi = whiteIndex[m - 1] + 1;
    return (wi + BLACK_OFFSET[m % 12] - BLACK_W / 2) * geom.whiteW;
  }
  function keyLeft(m) { return isBlack(m) ? blackLeft(m) : whiteIndex[m] * geom.whiteW; }
  function keyWidth(m) { return isBlack(m) ? geom.blackW : geom.whiteW; }
  function viewOffset() { return geom.totalW < geom.viewW ? -(geom.viewW - geom.totalW) / 2 : state.scroll; }

  // Posición de una tecla en pantalla
  function keyScreen(m) {
    const r = kb.getBoundingClientRect();
    const left = r.left + keyLeft(m) - viewOffset();
    return { x: left + keyWidth(m) / 2, left, w: keyWidth(m), top: r.top, bottom: r.bottom };
  }

  function layout(keepCenter = true) {
    const oldCenterRatio = geom.totalW ? (state.scroll + geom.viewW / 2) / geom.totalW : null;
    geom.viewW = stage.clientWidth;
    geom.viewH = stage.clientHeight;
    // En juego: arriba caen las notas, abajo el teclado
    geom.kbTop = game.active ? Math.round(Math.min(geom.viewH * 0.58, geom.viewH - 120)) : 0;
    kb.style.top = geom.kbTop + 'px';

    if (game.active) {
      geom.whiteW = game.fitWhiteW();
    } else {
      if (!state.whiteW) state.whiteW = defaultWhiteW();
      geom.whiteW = state.whiteW;
    }
    geom.blackW = geom.whiteW * BLACK_W;
    geom.totalW = geom.whiteW * WHITE_COUNT;
    keysEl.style.width = geom.totalW + 'px';
    const small = geom.whiteW < 40;
    for (let m = FIRST; m <= LAST; m++) {
      const el = keyEls[m];
      el.style.left = keyLeft(m) + 'px';
      el.style.width = keyWidth(m) + 'px';
      el.firstChild.textContent = noteLabel(m);
      el.style.fontSize = isBlack(m) ? (small ? '8px' : '10px') : (small ? '10px' : '12px');
    }
    if (game.active) {
      setScroll(game.fitScroll());
    } else if (keepCenter && oldCenterRatio !== null) {
      setScroll(oldCenterRatio * geom.totalW - geom.viewW / 2);
    } else if (!keepCenter) {
      const r = store.get('scrollRatio', null);
      setScroll(r !== null ? r * geom.totalW : whiteIndex[60] * geom.whiteW + geom.whiteW * 3.5 - geom.viewW / 2);
    } else setScroll(state.scroll);
    sizeMini();
  }

  function maxScroll() { return Math.max(0, geom.totalW - geom.viewW); }
  function setScroll(x) {
    state.scroll = Math.max(0, Math.min(maxScroll(), x));
    keysEl.style.transform = `translate3d(${-viewOffset()}px,0,0)`;
    positionMiniWin();
  }
  function saveScroll() { if (geom.totalW && !game.active) store.set('scrollRatio', state.scroll / geom.totalW); }

  function noteAt(clientX, clientY) {
    const r = kb.getBoundingClientRect();
    const x = clientX - r.left + viewOffset();
    const y = clientY - r.top;
    if (y < 0 || y > r.height) return null;
    if (x < 0 || x >= geom.totalW) return null;
    if (y < r.height * 0.62) {
      const wi = Math.floor(x / geom.whiteW);
      for (const m of [whiteList[wi] - 1, whiteList[wi] + 1]) {
        if (m >= FIRST && m <= LAST && isBlack(m)) {
          const l = blackLeft(m);
          if (x >= l && x <= l + geom.blackW) return m;
        }
      }
    }
    return whiteList[Math.min(WHITE_COUNT - 1, Math.floor(x / geom.whiteW))];
  }

  // Multitáctil + glissando
  const pointers = new Map();
  kb.addEventListener('pointerdown', e => {
    e.preventDefault();
    kb.setPointerCapture?.(e.pointerId);
    const m = noteAt(e.clientX, e.clientY);
    pointers.set(e.pointerId, m);
    if (m != null) noteOn(m);
  });
  kb.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const m = noteAt(e.clientX, e.clientY);
    if (m === prev) return;
    pointers.set(e.pointerId, m);
    if (prev != null && ![...pointers.values()].includes(prev)) noteOff(prev);
    if (m != null) noteOn(m);
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (prev != null && ![...pointers.values()].includes(prev)) noteOff(prev);
  };
  kb.addEventListener('pointerup', endPointer);
  kb.addEventListener('pointercancel', endPointer);
  kb.addEventListener('lostpointercapture', endPointer);

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    if (game.active) return;
    setScroll(state.scroll + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    saveScroll();
  }, { passive: false });

  // ================== Minimapa ==================
  const mini = $('miniInner');
  const canvas = $('miniCanvas');
  const win = $('miniWin');
  const c2d = canvas.getContext('2d');
  let miniW = 0, miniH = 0;

  function sizeMini() {
    const dpr = window.devicePixelRatio || 1;
    miniW = mini.clientWidth; miniH = mini.clientHeight;
    if (!miniW) return;
    canvas.width = Math.round(miniW * dpr); canvas.height = Math.round(miniH * dpr);
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMini();
    positionMiniWin();
  }

  function drawMini() {
    if (!miniW) return;
    const ww = miniW / WHITE_COUNT;
    const princess = state.theme === 'princess';
    c2d.clearRect(0, 0, miniW, miniH);
    c2d.fillStyle = princess ? '#fff7fb' : '#fafafa';
    c2d.fillRect(0, 0, miniW, miniH);
    for (let i = 0; i < WHITE_COUNT; i++) {
      const m = whiteList[i];
      if (held.has(m)) { c2d.fillStyle = noteColor(m); c2d.fillRect(i * ww, 0, ww, miniH); }
      c2d.fillStyle = m % 12 === 0 ? (princess ? '#e07ab0' : '#888') : (princess ? '#f5c6de' : '#bbb');
      c2d.fillRect(Math.round(i * ww), 0, 1, miniH);
    }
    for (let m = FIRST; m <= LAST; m++) {
      if (!isBlack(m)) continue;
      const wi = whiteIndex[m - 1] + 1;
      const x = (wi + BLACK_OFFSET[m % 12] - BLACK_W / 2) * ww;
      c2d.fillStyle = held.has(m) ? noteColor(m) : (princess ? '#7b2cbf' : '#222');
      c2d.fillRect(x, 0, ww * BLACK_W, miniH * 0.6);
    }
  }

  function positionMiniWin() {
    if (!geom.totalW || !miniW) return;
    const ratio = miniW / geom.totalW;
    const w = Math.min(miniW, geom.viewW * ratio);
    win.style.width = w + 'px';
    win.style.left = Math.min(miniW - w, state.scroll * ratio) + 'px';
  }

  let miniDrag = null;
  mini.addEventListener('pointerdown', e => {
    e.preventDefault();
    mini.setPointerCapture?.(e.pointerId);
    const r = mini.getBoundingClientRect();
    const ratio = geom.totalW / miniW;
    const winLeft = state.scroll / ratio;
    const winW = geom.viewW / ratio;
    const x = e.clientX - r.left;
    miniDrag = { id: e.pointerId, grab: (x >= winLeft && x <= winLeft + winW) ? x - winLeft : winW / 2 };
    setScroll((x - miniDrag.grab) * ratio);
  });
  mini.addEventListener('pointermove', e => {
    if (!miniDrag || miniDrag.id !== e.pointerId) return;
    const r = mini.getBoundingClientRect();
    setScroll((e.clientX - r.left - miniDrag.grab) * (geom.totalW / miniW));
  });
  const endMini = () => { if (miniDrag) { miniDrag = null; saveScroll(); } };
  mini.addEventListener('pointerup', endMini);
  mini.addEventListener('pointercancel', endMini);

  // ================== Capa de efectos (partículas + notas que caen) ==================
  const fx = $('fx');
  const fctx = fx.getContext('2d');
  let fxW = 0, fxH = 0, fxDpr = 1;
  const particles = [];
  const texts = [];
  let rafOn = false;

  function sizeFx() {
    fxDpr = Math.min(2, window.devicePixelRatio || 1);
    fxW = window.innerWidth; fxH = window.innerHeight;
    fx.width = Math.round(fxW * fxDpr); fx.height = Math.round(fxH * fxDpr);
    fctx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
  }

  function sparkle(x, y, color, n = 10, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const sp = (1.5 + Math.random() * 3.5) * power;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.08,
        life: 0, max: 40 + Math.random() * 25, size: 5 + Math.random() * 6 * Math.max(.6, power),
        color: Math.random() < 0.3 ? '#fff' : color, shape: state.theme === 'princess' || Math.random() < .5 ? 'star' : 'dot',
        rot: Math.random() * 6, vr: (Math.random() - .5) * 0.3,
      });
    }
    ensureLoop();
  }
  function confetti(n = 120) {
    const pal = state.theme === 'princess' ? ['#ff6fb5','#ffd166','#7bdff2','#c77dff','#fff','#b9f18c'] : COLORS.normal;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * fxW, y: -20 - Math.random() * fxH * 0.5,
        vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, g: 0.03,
        life: 0, max: 200 + Math.random() * 80, size: 6 + Math.random() * 8,
        color: pal[i % pal.length], shape: Math.random() < 0.5 ? 'star' : 'rect',
        rot: Math.random() * 6, vr: (Math.random() - .5) * 0.2,
      });
    }
    ensureLoop();
  }
  function floatText(text, x, y, color, size = 22, life = 50) {
    texts.push({ text, x, y, color, size, life: 0, max: life });
    ensureLoop();
  }

  function drawStar(c, x, y, r, rot) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = rot + i * Math.PI / 5 - Math.PI / 2;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function ensureLoop() { if (!rafOn) { rafOn = true; requestAnimationFrame(loop); } }

  function loop() {
    fctx.clearRect(0, 0, fxW, fxH);
    if (game.active && !game.ended) { gameTick(); drawLane(); }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr;
      if (p.life > p.max || p.y > fxH + 40) { particles.splice(i, 1); continue; }
      const a = 1 - p.life / p.max;
      fctx.globalAlpha = Math.max(0, Math.min(1, a * 1.4));
      fctx.fillStyle = p.color;
      if (p.shape === 'star') drawStar(fctx, p.x, p.y, p.size, p.rot);
      else if (p.shape === 'rect') { fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); fctx.restore(); }
      else { fctx.beginPath(); fctx.arc(p.x, p.y, p.size / 2, 0, 7); fctx.fill(); }
    }
    fctx.globalAlpha = 1;

    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life++;
      if (t.life > t.max) { texts.splice(i, 1); continue; }
      const k = t.life / t.max;
      const scale = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      fctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      fctx.font = `800 ${Math.round(t.size * scale)}px ${getComputedStyle(document.body).fontFamily}`;
      fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
      fctx.lineWidth = 5; fctx.strokeStyle = 'rgba(0,0,0,.35)';
      fctx.strokeText(t.text, t.x, t.y - k * 30);
      fctx.fillStyle = t.color;
      fctx.fillText(t.text, t.x, t.y - k * 30);
    }
    fctx.globalAlpha = 1;

    if ((game.active && !game.ended) || particles.length || texts.length) requestAnimationFrame(loop);
    else { rafOn = false; fctx.clearRect(0, 0, fxW, fxH); }
  }

  // ================== Juego ==================
  function parseVoice(str, voice) {
    let t = 0; const notes = [], rests = [];
    for (const tok of (str || '').trim().split(/\s+/)) {
      if (!tok) continue;
      const [nm, d] = tok.split(':');
      const dur = d ? parseFloat(d) : 1;
      if (nm === 'R') rests.push({ beat: t, beats: dur, voice });
      else for (const part of nm.split('+')) notes.push({ midi: nameToMidi(part), beat: t, beats: dur, voice });
      t += dur;
    }
    return { notes, rests, length: t };
  }
  const SONGS = (window.SONGS || []).map(s => {
    const mel = parseVoice(s.notes, 0);
    const bass = s.bass ? parseVoice(s.bass, 1) : { notes: [] };
    return { ...s, parsed: mel.notes, rests: mel.rests, bassParsed: bass.notes, length: mel.length };
  });

  // ---- Figuras musicales ----
  const FIG = [
    [4, 'Redonda', '4 tiempos'], [3, 'Blanca con puntillo', '3 tiempos'], [2, 'Blanca', '2 tiempos'],
    [1.5, 'Negra con puntillo', '1 tiempo y medio'], [1, 'Negra', '1 tiempo'],
    [0.75, 'Corchea con puntillo', '¾ de tiempo'], [0.5, 'Corchea', '½ tiempo'], [0.25, 'Semicorchea', '¼ de tiempo'],
  ];
  function figureOf(beats) {
    const f = FIG.find(f => Math.abs(f[0] - beats) < 1e-6);
    return f ? { name: f[1], time: f[2] } : { name: beats + ' tiempos', time: beats + ' tiempos' };
  }
  function figBase(beats) {
    const dotted = [0.75, 1.5, 3].some(v => Math.abs(v - beats) < 1e-6);
    return { base: dotted ? beats / 1.5 : beats, dotted };
  }
  // Dibujito de la figura (SVG) para el cartel
  function figureSVG(beats, color) {
    const { base, dotted } = figBase(beats);
    const hollow = base >= 2;
    let s = `<svg viewBox="0 0 24 30" width="20" height="25"><ellipse cx="9" cy="23" rx="5.6" ry="4" transform="rotate(-22 9 23)" fill="${hollow ? 'none' : color}" stroke="${color}" stroke-width="${hollow ? 2 : 1}"/>`;
    if (base < 4) s += `<line x1="14" y1="22" x2="14" y2="3" stroke="${color}" stroke-width="1.8"/>`;
    if (base <= 0.5) s += `<path d="M14 3 q7 5 4 12" fill="none" stroke="${color}" stroke-width="2"/>`;
    if (base <= 0.25) s += `<path d="M14 8 q7 5 4 12" fill="none" stroke="${color}" stroke-width="2"/>`;
    if (dotted) s += `<circle cx="20" cy="23" r="1.9" fill="${color}"/>`;
    return s + '</svg>';
  }

  const WIN = { perfect: 75, great: 150, good: 240 };
  const LEAD = 2600;
  const tempoVal = () => parseFloat($('tempo').value) || 1;

  const game = {
    active: false, mode: 'learn', song: null, notes: [], mine: [], groups: [], gidx: 0, tempo: 1, msBeat: 600,
    start: 0, hold: null, paused: false, waiting: false, idx: 0, ended: false, holding: new Set(),
    score: 0, combo: 0, maxCombo: 0, counts: null, mistakes: 0, look: 2400, duo: false, grand: false,
    lo: 60, hi: 72, targetKey: '', targets: [], endAt: 0, figI: -1, rests: [],
    fitWhiteW() {
      const wl = whiteIndex[this.lo - (isBlack(this.lo) ? 1 : 0)];
      const wh = whiteIndex[this.hi + (isBlack(this.hi) ? 1 : 0)];
      const n = wh - wl + 1 + 2;
      return Math.max(28, Math.min(120, geom.viewW / n));
    },
    fitScroll() {
      const wl = whiteIndex[this.lo - (isBlack(this.lo) ? 1 : 0)];
      const wh = whiteIndex[this.hi + (isBlack(this.hi) ? 1 : 0)];
      return (wl + wh + 1) / 2 * geom.whiteW - geom.viewW / 2;
    },
  };
  const now = () => performance.now();
  function gameTime() { return game.hold !== null ? game.hold : now() - game.start; }

  // Corcheas y semicorcheas seguidas dentro del mismo tiempo se unen con barra
  function computeBeams(notes, cfg) {
    const unit = cfg?.unit || 1, off = cfg?.offset || 0;
    const cell = b => Math.floor((b - off) / unit + 1e-6);
    for (const v of [0, 1]) {
      const list = notes.filter(n => n.voice === v);
      const chordBeat = new Set();
      list.forEach((n, i) => { if (list.some((o, j) => j !== i && Math.abs(o.beat - n.beat) < 1e-6)) chordBeat.add(n); });
      let grp = [];
      const close = () => { if (grp.length >= 2) { const g = grp.slice(); g.forEach(n => n.beam = g); } grp = []; };
      for (const n of list) {
        const flagged = figBase(n.beats).base <= 0.5 && !chordBeat.has(n);
        const prev = grp[grp.length - 1];
        if (flagged && prev && Math.abs(prev.beat + prev.beats - n.beat) < 1e-6 && cell(prev.beat) === cell(n.beat)) grp.push(n);
        else { close(); if (flagged) grp.push(n); }
      }
      close();
    }
  }

  function startGame(song, mode, opts = {}) {
    stopPreview();
    initAudio();
    const duoOn = mode !== 'guess' && duo.connected;
    if (duoOn && !opts.remote) {
      duoSend({ t: 'start', song: song.id, mode, tempo: tempoVal() });
      hideAll();
      setTimeout(() => beginGame(song, mode, { duo: true }), Math.min(250, duo.rtt / 2));
      return;
    }
    beginGame(song, mode, { duo: duoOn, tempo: opts.tempo });
  }

  function beginGame(song, mode, o) {
    game.active = false;
    for (const m of [...held]) noteOff(m);
    releaseSustain();
    hideAll();
    setTargets([]);
    game.active = true; game.ended = false; game.paused = false; game.waiting = false;
    game.song = song; game.mode = mode; game.duo = !!o.duo;
    game.tempo = o.tempo ?? tempoVal();
    game.view = mode === 'guess' ? 'staff' : mode === 'learn' ? store.get('view', 'blocks') : 'blocks';
    game.holding = new Set(); game.endAt = 0; game.figI = -1; game.rests = []; game.clusters = [];
    game.score = 0; game.combo = 0; game.maxCombo = 0; game.mistakes = 0; game.idx = 0; game.gidx = 0;
    game.counts = { perfect: 0, great: 0, good: 0, miss: 0, short: 0, long: 0 };
    game.partnerResult = null; game.myResult = null;
    if (mode === 'guess') {
      game.tempo = 1; game.grand = false;
      const pool = GUESS_POOLS[song.level];
      game.notes = [];
      for (let i = 0; i < GUESS_LEN; i++) {
        let m;
        do { m = pool[Math.floor(Math.random() * pool.length)]; } while (i && m === game.notes[i - 1].midi);
        game.notes.push({ i, voice: 0, midi: m, ms: 0, dur: 0, beats: 1, state: 'pending', mist: 0, mine: true });
      }
      game.mine = game.notes; game.groups = [];
      game.qStart = 0; game.lockUntil = 0; game.answerTimes = [];
    } else {
      const useBass = game.duo || song.level === 3;
      const myVoices = game.duo ? [duo.hand === 'right' ? 0 : 1] : useBass ? [0, 1] : [0];
      game.grand = useBass;
      game.msBeat = 60000 / (song.bpm * game.tempo);
      const src = song.parsed.concat(useBass ? song.bassParsed : []).sort((a, b) => a.beat - b.beat || a.voice - b.voice);
      game.notes = src.map((n, i) => ({
        i, voice: n.voice, midi: n.midi, beat: n.beat, beats: n.beats,
        ms: LEAD + n.beat * game.msBeat, dur: n.beats * game.msBeat,
        state: 'pending', mist: false, pressed: false, mine: myVoices.includes(n.voice),
      }));
      game.mine = game.notes.filter(n => n.mine);
      game.rests = song.rests.map(r => ({ ...r, ms: LEAD + r.beat * game.msBeat }));
      game.groups = [];
      for (const n of game.notes) {
        const g = game.groups[game.groups.length - 1];
        if (g && Math.abs(g.ms - n.ms) < 1) g.notes.push(n);
        else game.groups.push({ ms: n.ms, notes: [n] });
      }
      computeBeams(game.notes, song.beam);
      // Notas simultáneas de la misma mano = un acorde en el pentagrama
      game.clusters = [];
      const cmap = new Map();
      for (const n of game.notes) {
        const key = n.voice + '|' + Math.round(n.ms);
        let cl = cmap.get(key);
        if (!cl) { cl = { voice: n.voice, ms: n.ms, beats: n.beats, notes: [] }; cmap.set(key, cl); game.clusters.push(cl); }
        cl.notes.push(n);
      }
    }
    const mids = mode === 'guess' ? GUESS_POOLS[song.level] : game.mine.map(n => n.midi);
    game.lo = Math.min(...mids); game.hi = Math.max(...mids);
    game.look = mode === 'learn' ? 2600 : Math.max(1500, Math.min(2600, 2200 / Math.sqrt(game.tempo)));
    game.start = now(); game.hold = null;
    document.body.classList.add('ingame');
    $('bar').hidden = true; $('mini').hidden = true; $('hud').hidden = false;
    $('hudEmoji').textContent = song.emoji;
    $('hudName').textContent = song.name + (game.duo ? (duo.hand === 'right' ? ' · 👉' : ' · 👈') : '');
    $('hudFig').innerHTML = '';
    updateHud();
    requestAnimationFrame(() => { layout(false); ensureLoop(); });
  }

  function endGameUI() {
    game.active = false;
    setTargets([]);
    document.body.classList.remove('ingame');
    $('bar').hidden = false; $('mini').hidden = false; $('hud').hidden = true;
    for (const m of [...held]) noteOff(m);
    requestAnimationFrame(() => layout(false));
  }

  function setTargets(list, wrong = false) {
    const key = list.join(',');
    if (key === game.targetKey && !wrong) return;
    for (const m of game.targets) if (!list.includes(m)) keyEls[m]?.classList.remove('target', 'wrong');
    for (const m of list) {
      const el = keyEls[m];
      el.style.setProperty('--tgt', noteColor(m));
      el.classList.add('target');
      if (wrong) { el.classList.remove('wrong'); void el.offsetWidth; el.classList.add('wrong'); }
    }
    game.targets = list.slice(); game.targetKey = key;
  }

  function mult() { return 1 + Math.min(3, Math.floor(game.combo / 10)); }

  function updateHud(bumpScore) {
    $('hudScore').textContent = '⭐ ' + game.score.toLocaleString('es-AR');
    const c = game.combo;
    $('hudCombo').textContent = c >= 2 ? `🔥 ${c}${mult() > 1 ? ' ×' + mult() : ''}` : '';
    const done = game.mode === 'guess' ? game.idx
      : game.mode === 'learn' ? game.mine.filter(n => n.pressed).length
      : game.mine.filter(n => n.state !== 'pending').length;
    $('hudProg').style.width = (done / Math.max(1, game.mode === 'guess' ? game.notes.length : game.mine.length) * 100) + '%';
    if (bumpScore) { const s = $('hudScore'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
  }

  // Cartel con la figura de la nota que se está tocando
  function updateFig(n) {
    const el = $('hudFig');
    if (!n) { if (game.figI !== -1) { el.innerHTML = ''; game.figI = -1; } return; }
    if (game.figI === n.i) return;
    game.figI = n.i;
    const f = figureOf(n.beats);
    const ink = state.theme === 'princess' ? '#7b2cbf' : '#eee';
    el.innerHTML = `${figureSVG(n.beats, ink)}<span><b>${f.name}</b><small>${f.time}</small></span>`;
  }

  const JUDGE_TXT = {
    perfect: { normal: '¡Perfecto!', princess: '¡Perfecto! ✨' },
    great:   { normal: '¡Genial!',   princess: '¡Genial! 💖' },
    good:    { normal: '¡Bien!',     princess: '¡Bien! 🌸' },
  };

  function onHit(n, kind, pts) {
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    game.score += pts * mult();
    const k = keyScreen(n.midi);
    const hitY = k.top;
    const power = kind === 'perfect' ? 1.3 : kind === 'great' ? 1 : 0.7;
    sparkle(k.x, hitY, noteColor(n.midi), kind === 'perfect' ? 16 : 10, power);
    const theme = state.theme === 'princess' ? 'princess' : 'normal';
    floatText(JUDGE_TXT[kind][theme], k.x, hitY - 40, kind === 'perfect' ? '#ffe066' : kind === 'great' ? '#9cf6ff' : '#ffffff', 22);
    if (game.combo > 0 && game.combo % 10 === 0) {
      floatText(`¡Combo ×${game.combo}! ${state.theme === 'princess' ? '🦄' : '🔥'}`, fxW / 2, k.top / 2 + 30, '#ff9ad5', 34, 70);
      chime([hz(84), hz(88), hz(91), hz(96)], 0.06, 0.08);
    }
    updateHud(true);
  }
  function onMiss(n, wrong) {
    game.combo = 0;
    const k = keyScreen(n.midi);
    floatText(wrong ? '¡Ups! Probá otra 💫' : 'Ups', k.x, k.top - 30, '#ffb3c6', wrong ? 20 : 18);
    updateHud();
  }

  // ---- Aprender: duración de cada nota ----
  const holdTol = dur => ({ perfect: Math.max(dur * 0.2, 110), good: Math.max(dur * 0.38, 180) });

  function judgeHold(n, heldMs) {
    game.holding.delete(n);
    const tol = holdTol(n.dur);
    const err = heldMs - n.dur;
    const k = keyScreen(n.midi);
    if (Math.abs(err) <= tol.good) {
      const kind = Math.abs(err) <= tol.perfect ? 'perfect' : 'good';
      game.counts[kind]++;
      onHit(n, kind, kind === 'perfect' ? 100 : 60);
      if (n.mist) { game.combo = 0; updateHud(); }
    } else {
      n.durBad = true;
      const short = err < 0;
      game.counts[short ? 'short' : 'long']++;
      game.combo = 0;
      floatText(short ? '⚡ ¡Más largo!' : '⏳ ¡Más corto!', k.x, k.top - 40, '#ffd6a5', 22);
      updateHud();
    }
  }

  function gameRelease(m) {
    if (game.mode !== 'learn') return;
    for (const n of game.holding) if (n.midi === m) { judgeHold(n, now() - n.pressReal); break; }
  }

  // Avanza cuando todas las notas del grupo (acorde) están tocadas, propias o del compañero
  function checkGroup() {
    let advanced = false;
    let g;
    while ((g = game.groups[game.gidx]) && g.notes.every(n => n.pressed)) {
      g.notes.forEach(n => { if (n.state === 'pending') n.state = 'hit'; });
      game.gidx++; advanced = true;
      game.start = now() - g.ms; game.hold = null; game.waiting = false;
    }
    if (advanced) setTargets([]);
  }

  function gamePress(m) {
    if (!game.active || game.paused || game.ended) return;
    if (game.mode === 'guess') return guessPress(m);
    const t = gameTime();
    if (game.mode === 'learn') {
      const g = game.groups[game.gidx];
      if (!g) return;
      const early = g.ms - t;
      if (!(game.waiting || early < 700)) return;
      const n = g.notes.find(x => x.mine && !x.pressed && x.midi === m);
      if (n) {
        n.pressed = true;
        n.pressReal = now();
        game.holding.add(n);
        game.score += n.mist ? 20 : 50;
        const k = keyScreen(n.midi);
        sparkle(k.x, k.top, noteColor(n.midi), 8, 0.8);
        if (game.duo) duoSend({ t: 'press', i: n.i });
        checkGroup();
        updateHud(true);
      } else if (!g.notes.some(x => x.mine && x.midi === m)) {
        const pend = g.notes.filter(x => x.mine && !x.pressed);
        if (!pend.length) return;
        if (!g.mistCounted) { g.mistCounted = true; game.mistakes++; }
        pend.forEach(x => x.mist = true);
        onMiss(pend[0], true);
        setTargets(pend.map(x => x.midi), true);
      }
      return;
    }
    // Desafío: la nota propia pendiente más cercana de esa tecla
    let best = null, bd = 1e9;
    for (const n of game.mine) {
      if (n.state !== 'pending' || n.midi !== m) continue;
      const d = Math.abs(t - n.ms);
      if (d < bd) { bd = d; best = n; }
      if (n.ms - t > WIN.good) break;
    }
    if (!best || bd > WIN.good) return;
    const kind = bd <= WIN.perfect ? 'perfect' : bd <= WIN.great ? 'great' : 'good';
    best.state = 'hit';
    game.counts[kind]++;
    onHit(best, kind, kind === 'perfect' ? 300 : kind === 'great' ? 200 : 100);
  }

  // ---- Adivinar notas ----
  const GUESS_LEN = 15;
  const range = (a, b, whitesOnly) => { const r = []; for (let m = a; m <= b; m++) if (!whitesOnly || !isBlack(m)) r.push(m); return r; };
  const GUESS_POOLS = { 1: range(60, 72, true), 2: range(57, 79, true), 3: range(55, 84, false) };
  const GUESS_LEVELS = [
    { id: 'guess1', name: 'Adivinar: Do a Do', emoji: '🔮', level: 1, desc: 'Notas blancas del Do central al Do de arriba' },
    { id: 'guess2', name: 'Adivinar: más notas', emoji: '🔮', level: 2, desc: 'Blancas de La3 a Sol5, con líneas adicionales' },
    { id: 'guess3', name: 'Adivinar: con sostenidos', emoji: '🔮', level: 3, desc: 'De Sol3 a Do6, también teclas negras (♯)' },
  ];

  function guessPress(m) {
    const n = game.notes[game.idx];
    if (!n || now() < game.lockUntil || !game.qStart) return;
    const k = keyScreen(n.midi);
    if (m === n.midi) {
      const el = now() - game.qStart;
      game.answerTimes.push(el);
      const speed = Math.max(0, Math.round(100 - Math.max(0, el - 1200) / 40));
      game.counts[n.mist ? 'good' : 'perfect']++;
      n.state = 'hit';
      onHit(n, n.mist ? 'good' : (el < 2500 ? 'perfect' : 'great'), (n.mist ? 40 : 100) + (n.mist ? 0 : speed));
      if (n.mist) { game.combo = 0; updateHud(); }
      floatText(noteName(n.midi), k.x, k.top - 80, '#fff', 30, 45);
      game.idx++;
      game.lockUntil = now() + 450;
      game.qStart = 0;
      setTargets([]);
      if (game.idx >= game.notes.length) game.endAt = now() + 700;
    } else {
      n.mist++;
      if (n.mist === 1) game.mistakes++;
      game.combo = 0;
      const wk = keyScreen(m);
      const sameName = m % 12 === n.midi % 12;
      floatText(sameName ? `¡Es ${noteName(m)}! Pero ${m < n.midi ? 'más aguda ⬆' : 'más grave ⬇'}` : '¡Ups! Probá otra 💫', wk.x, wk.top - 30, '#ffb3c6', 19);
      if (n.mist >= 2) setTargets([n.midi], true);
      updateHud();
    }
  }

  function gameTick() {
    if (game.paused || game.ended) return;
    const t = gameTime();
    if (game.mode === 'guess') {
      if (!game.qStart && game.idx < game.notes.length && now() >= game.lockUntil && t > 900) game.qStart = now();
    } else if (game.mode === 'learn') {
      for (const h of [...game.holding]) if (now() - h.pressReal > h.dur + holdTol(h.dur).good) judgeHold(h, now() - h.pressReal);
      const g = game.groups[game.gidx];
      let figNote = null;
      for (const h of game.holding) if (!figNote || h.voice < figNote.voice || h.pressReal > figNote.pressReal) figNote = h;
      if (g) {
        if (!game.waiting && t >= g.ms) { game.waiting = true; game.hold = g.ms; }
        const pend = g.notes.filter(n => n.mine && !n.pressed);
        setTargets(g.ms - t < 1500 ? pend.map(n => n.midi) : []);
        if (!figNote) figNote = pend[0] || null;
      } else if (!game.endAt && !game.holding.size) game.endAt = now() + 700;
      updateFig(figNote);
    } else {
      const targets = [];
      let figNote = null;
      for (const n of game.mine) {
        if (n.state !== 'pending') continue;
        if (t - n.ms > WIN.good) { n.state = 'miss'; game.counts.miss++; onMiss(n); continue; }
        const d = n.ms - t;
        if (!figNote) figNote = n;
        if (d < 350 && (!targets.length || Math.abs(game.mine[targets[0]].ms - n.ms) < 1)) targets.push(game.mine.indexOf(n));
        if (d > 400) break;
      }
      setTargets(targets.map(i => game.mine[i].midi));
      updateFig(figNote);
      const last = game.mine[game.mine.length - 1];
      if (!game.endAt && game.mine.every(n => n.state !== 'pending')) game.endAt = now() + Math.max(600, last.dur);
    }
    if (game.endAt && now() >= game.endAt) finishGame();
  }

  // ---- Pentagrama ----
  // Posición: letra (Do=0 … Si=6) + octava*7; y si lleva sostenido
  const PC_STEP = [[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
  const staffStep = m => PC_STEP[m % 12][0] + octaveOf(m) * 7;
  const hasSharp = m => PC_STEP[m % 12][1] === 1;
  // Clave de Sol: líneas Mi4..Fa5 (pasos 30..38). Clave de Fa: Sol2..La3 (pasos 18..26).
  const TREBLE = { mid: 34, low: 28, high: 40, clef: '𝄞' };
  const BASS = { mid: 22, low: 16, high: 28, clef: '𝄢' };

  function noteGeom(x, m, g, st) {
    const step = staffStep(m);
    return { step, y: st.y(step), rx: g * 0.68, ry: g * 0.5 };
  }

  // Dibuja una nota o un acorde (varias notas con una sola plica)
  function drawChord(c, x, midis, beats, g, st, ink, opts = {}) {
    const rx = g * 0.68, ry = g * 0.5;
    const items = midis.map(m => ({ m, step: staffStep(m) })).sort((a, b) => a.step - b.step);
    const lo = items[0].step, hi = items[items.length - 1].step;
    const up = (lo + hi) / 2 < st.mid;
    // Segundas: la nota de al lado va del otro lado de la plica
    const seq = up ? items : items.slice().reverse();
    let prev = null;
    for (const it of seq) {
      it.dx = (prev && Math.abs(it.step - prev.step) === 1 && prev.dx === 0) ? (up ? rx * 1.84 : -rx * 1.84) : 0;
      prev = it;
    }
    const minDx = Math.min(0, ...items.map(i => i.dx)), maxDx = Math.max(0, ...items.map(i => i.dx));
    c.strokeStyle = ink; c.lineWidth = Math.max(1.2, g * 0.11);
    const ledger = s => { c.beginPath(); c.moveTo(x + minDx - rx * 1.65, st.y(s)); c.lineTo(x + maxDx + rx * 1.65, st.y(s)); c.stroke(); };
    for (let s = st.low; s >= lo; s -= 2) ledger(s);
    for (let s = st.high; s <= hi; s += 2) ledger(s);
    const { base, dotted } = figBase(beats);
    const hollow = base >= 2;
    for (const it of items) {
      const hx = x + it.dx, y = st.y(it.step);
      if (opts.halo && (!opts.haloSet || opts.haloSet.has(it.m))) {
        const a = c.globalAlpha;
        c.fillStyle = typeof opts.halo === 'function' ? opts.halo(it.m) : opts.halo; c.globalAlpha = a * 0.4;
        c.beginPath(); c.arc(hx, y, g * 1.5, 0, 7); c.fill();
        c.globalAlpha = a;
      }
      c.save(); c.translate(hx, y); c.rotate(-0.38);
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.fillStyle = ink; c.fill();
      if (hollow) {
        c.beginPath(); c.ellipse(0, 0, rx * (base >= 4 ? 0.45 : 0.72), ry * (base >= 4 ? 0.62 : 0.42), base >= 4 ? 0.9 : 0, 0, 7);
        c.fillStyle = st.paper; c.fill();
      }
      c.restore();
      if (dotted) {
        c.fillStyle = ink;
        c.beginPath(); c.arc(x + maxDx + rx + g * 0.45, it.step % 2 === 0 ? y - g * 0.5 : y, g * 0.17, 0, 7); c.fill();
      }
    }
    // Sostenidos (escalonados si están cerca)
    let acc = 0, lastAccStep = -99;
    for (const it of items.slice().reverse()) {
      if (!hasSharp(it.m)) continue;
      acc = lastAccStep - it.step < 6 ? acc + 1 : 0; lastAccStep = it.step;
      const y = st.y(it.step);
      const ax = x + minDx - rx - g * 0.95 - acc * g * 1.1, w = g * 0.42;
      c.strokeStyle = ink; c.lineWidth = Math.max(1, g * 0.1);
      c.beginPath();
      c.moveTo(ax - w * 0.45, y - g * 1.25); c.lineTo(ax - w * 0.45, y + g * 1.35);
      c.moveTo(ax + w * 0.45, y - g * 1.35); c.lineTo(ax + w * 0.45, y + g * 1.25);
      c.stroke();
      c.lineWidth = Math.max(1.6, g * 0.24);
      c.beginPath();
      c.moveTo(ax - w, y - g * 0.3); c.lineTo(ax + w, y - g * 0.55);
      c.moveTo(ax - w, y + g * 0.55); c.lineTo(ax + w, y + g * 0.3);
      c.stroke();
    }
    // Plica y corchetes
    const sx = up ? x + rx * 0.92 : x - rx * 0.92;
    const yNear = up ? st.y(lo) : st.y(hi), yFar = up ? st.y(hi) : st.y(lo);
    if (base < 4 && !opts.noStem) {
      const ey = up ? yFar - g * 3.4 : yFar + g * 3.4;
      c.strokeStyle = ink; c.lineWidth = Math.max(1.2, g * 0.12);
      c.beginPath(); c.moveTo(sx, yNear); c.lineTo(sx, ey); c.stroke();
      const flags = base <= 0.25 ? 2 : base <= 0.5 ? 1 : 0;
      c.fillStyle = ink;
      for (let f = 0; f < flags; f++) {
        const d = up ? 1 : -1;
        const fy = ey + d * f * g * 0.85;
        c.beginPath();
        c.moveTo(sx, fy);
        c.bezierCurveTo(sx + g * 0.3, fy + d * g * 0.9, sx + g * 1.5, fy + d * g * 1.2, sx + g * 1.0, fy + d * g * 2.6);
        c.bezierCurveTo(sx + g * 1.2, fy + d * g * 1.5, sx + g * 0.4, fy + d * g * 1.25, sx, fy + d * g * 1.1);
        c.closePath(); c.fill();
      }
    }
    return { x, y: st.y(items[0].step), up, sx, step: items[0].step };
  }
  const drawNote = (c, x, m, beats, g, st, ink, opts) => drawChord(c, x, [m], beats, g, st, ink, opts);

  // Barra que une corcheas/semicorcheas
  function drawBeam(c, items, g, st, ink) {
    const avg = items.reduce((a, it) => a + it.step, 0) / items.length;
    const up = avg < st.mid;
    const pts = items.map(it => ({ x: up ? it.x + g * 0.68 * 0.92 : it.x - g * 0.68 * 0.92, y: it.y, base: figBase(it.n.beats).base }));
    const L = g * 3.3;
    let y1 = pts[0].y + (up ? -L : L), y2 = pts[pts.length - 1].y + (up ? -L : L);
    if (Math.abs(y2 - y1) > g) y2 = y1 + Math.sign(y2 - y1) * g;
    const x1 = pts[0].x, x2 = pts[pts.length - 1].x;
    const lineY = x => y1 + (y2 - y1) * (x - x1) / ((x2 - x1) || 1);
    let shift = 0;
    for (const p of pts) {
      const len = up ? p.y - lineY(p.x) : lineY(p.x) - p.y;
      if (len < g * 2.6) shift = Math.max(shift, g * 2.6 - len);
    }
    y1 += up ? -shift : shift; y2 += up ? -shift : shift;
    c.strokeStyle = ink; c.lineWidth = Math.max(1.2, g * 0.12);
    for (const p of pts) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, lineY(p.x)); c.stroke(); }
    const th = g * 0.48, dir = up ? 1 : -1;
    const bar = (xa, xb, off) => {
      c.beginPath();
      c.moveTo(xa, lineY(xa) + dir * off); c.lineTo(xb, lineY(xb) + dir * off);
      c.lineTo(xb, lineY(xb) + dir * (off + th)); c.lineTo(xa, lineY(xa) + dir * (off + th));
      c.closePath(); c.fill();
    };
    c.fillStyle = ink;
    bar(x1, x2, 0);
    for (let k = 0; k < pts.length; k++) {
      if (pts[k].base > 0.25) continue;
      if (pts[k + 1] && pts[k + 1].base <= 0.25) bar(pts[k].x, pts[k + 1].x, g * 0.8);
      else if (!(pts[k - 1] && pts[k - 1].base <= 0.25)) {
        const d = k > 0 ? -1 : 1;
        bar(Math.min(pts[k].x, pts[k].x + d * g * 1.1), Math.max(pts[k].x, pts[k].x + d * g * 1.1), g * 0.8);
      }
    }
  }

  function drawRest(c, x, beats, g, st, ink) {
    const y = st.y;
    c.fillStyle = ink; c.strokeStyle = ink;
    if (beats >= 4) c.fillRect(x - g * 0.6, y(36), g * 1.2, g * 0.5);
    else if (beats >= 2) c.fillRect(x - g * 0.6, y(34) - g * 0.5, g * 1.2, g * 0.5);
    else if (beats >= 1) {
      c.lineWidth = g * 0.3; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(x - g * 0.2, y(37)); c.lineTo(x + g * 0.35, y(35.6)); c.lineTo(x - g * 0.3, y(34.2));
      c.lineTo(x + g * 0.3, y(32.6)); c.stroke();
      c.beginPath(); c.arc(x, y(32.2), g * 0.3, 0.5, 3.6); c.stroke();
    } else {
      c.beginPath(); c.arc(x - g * 0.3, y(35), g * 0.24, 0, 7); c.fill();
      c.lineWidth = Math.max(1.2, g * 0.13);
      c.beginPath(); c.moveTo(x - g * 0.3, y(35) + g * 0.05); c.quadraticCurveTo(x + g * 0.1, y(35.2), x + g * 0.45, y(35.6));
      c.lineTo(x - g * 0.05, y(31.6)); c.stroke();
      if (beats <= 0.25) { c.beginPath(); c.arc(x - g * 0.5, y(33), g * 0.24, 0, 7); c.fill(); }
    }
  }

  function drawStaff(c, left, top, width, h, t, princess, fontFam) {
    const pad = 6;
    const paper = princess ? '#fff3fa' : '#f7f3ea';
    c.fillStyle = paper;
    roundRect(c, left + pad, top + pad, width - pad * 2, h - pad * 2, 14); c.fill();
    const grand = game.grand && game.mode !== 'guess';
    let g, staves;
    if (grand) {
      g = Math.max(5.5, Math.min(13, (h - 18) / 17.5));
      const midT = top + 8 + g * 4.2;
      staves = [{ ...TREBLE, midY: midT }, { ...BASS, midY: midT + g * 8.4 }];
    } else {
      g = Math.max(7, Math.min(16, (h - 26) / 12));
      staves = [{ ...TREBLE, midY: top + h * 0.46 }];
    }
    for (const st of staves) { st.y = s => st.midY - (s - st.mid) * g / 2; st.paper = paper; }
    const lineCol = princess ? '#c77dff' : '#555';
    const ink = princess ? '#3c096c' : '#1a1a1a';
    c.strokeStyle = lineCol; c.lineWidth = 1.3;
    for (const st of staves) for (let k = -4; k <= 4; k += 2) {
      c.beginPath(); c.moveTo(left + 14, st.y(st.mid + k)); c.lineTo(left + width - 14, st.y(st.mid + k)); c.stroke();
    }
    if (grand) { c.lineWidth = 2; c.beginPath(); c.moveTo(left + 14, staves[0].y(38)); c.lineTo(left + 14, staves[1].y(18)); c.stroke(); }
    // Claves
    c.fillStyle = ink; c.textAlign = 'left'; c.textBaseline = 'middle';
    const clefFont = `"Noto Music", "Segoe UI Symbol", "Apple Symbols", "Bravura", serif`;
    c.font = `${Math.round(g * 6.2)}px ${clefFont}`;
    c.fillText('𝄞', left + 18, staves[0].y(32) - g * 0.2);
    if (grand) {
      // Clave de Fa dibujada (no depende de la tipografía)
      const fy = staves[1].y(24), fx = left + 22;
      c.lineWidth = g * 0.32; c.strokeStyle = ink;
      c.beginPath(); c.arc(fx + g * 0.9, fy + g * 0.15, g * 0.95, Math.PI * 1.05, Math.PI * 0.05, false);
      c.quadraticCurveTo(fx + g * 1.7, fy + g * 2.4, fx - g * 0.1, fy + g * 3.4); c.stroke();
      c.beginPath(); c.arc(fx + g * 0.12, fy + g * 0.3, g * 0.4, 0, 7); c.fillStyle = ink; c.fill();
      c.beginPath(); c.arc(fx + g * 2.4, fy - g * 0.5, g * 0.2, 0, 7); c.arc(fx + g * 2.4, fy + g * 0.5, g * 0.2, 0, 7); c.fill();
    }
    const playX = left + Math.max(84, width * 0.2);
    const names = width > 500 && !grand;

    if (game.mode === 'guess') {
      const n = game.notes[game.idx];
      if (n && game.qStart) {
        const gg = g * 1.15, st0 = { ...staves[0], y: s => staves[0].midY - (s - 34) * gg / 2 };
        drawNote(c, left + width * 0.55, n.midi, 1, gg, st0, ink, { halo: princess ? '#ff9ad5' : '#ffd166' });
      }
      return;
    }
    // Cursor de lectura
    c.strokeStyle = princess ? '#ff4fa3' : '#e8b14a'; c.lineWidth = 3;
    c.shadowColor = c.strokeStyle; c.shadowBlur = 10;
    c.beginPath(); c.moveTo(playX, staves[0].y(44)); c.lineTo(playX, staves[staves.length - 1].y(staves.length > 1 ? 12 : 24)); c.stroke();
    c.shadowBlur = 0;
    const pxms = (left + width - 20 - playX) / 3400;
    const xOf = ms => playX + (ms - t) * pxms;
    const visible = x => x >= left + 74 && x <= left + width + 40;
    // Silencios de la melodía
    for (const r of game.rests) { const x = xOf(r.ms); if (visible(x)) drawRest(c, x, r.beats, g, staves[0], ink); }
    const g0 = game.groups[game.gidx];
    const beams = new Map();
    for (const cl of game.clusters) {
      const x = xOf(cl.ms);
      if (x > left + width + 40) break;
      if (!visible(x)) continue;
      const st = staves[grand ? cl.voice : 0];
      const mine = cl.notes[0].mine;
      const pending = cl.notes.filter(n => g0 && g0.notes.includes(n) && n.mine && !n.pressed);
      c.globalAlpha = cl.notes.every(n => n.pressed) ? 0.4 : mine ? 1 : 0.45;
      const single = cl.notes.length === 1 ? cl.notes[0] : null;
      const r = drawChord(c, x, cl.notes.map(n => n.midi), cl.beats, g, st, ink, {
        halo: pending.length ? (m => noteColor(m)) : null, haloSet: new Set(pending.map(n => n.midi)),
        noStem: !!(single && single.beam),
      });
      if (single && single.beam) {
        if (!beams.has(single.beam)) beams.set(single.beam, []);
        beams.get(single.beam).push({ ...r, n: single, alpha: c.globalAlpha, st });
      }
      if (names) {
        c.fillStyle = princess ? '#a0306e' : '#555'; c.font = `700 12px ${fontFam}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(cl.notes.map(n => noteName(n.midi)).join('·'), x, top + h - 16);
      }
      c.globalAlpha = 1;
    }
    // Barras: también se dibujan si parte del grupo quedó fuera de la vista
    for (const [grp, items] of beams) {
      const all = grp.map(n => {
        const found = items.find(it => it.n === n);
        if (found) return found;
        const st = items[0].st, x = xOf(n.ms);
        return { ...noteGeom(x, n.midi, g, st), step: staffStep(n.midi), x, n, alpha: items[0].alpha, st };
      });
      c.globalAlpha = items[0].alpha;
      drawBeam(c, all, g, items[0].st, ink);
      c.globalAlpha = 1;
    }
  }

  function drawHoldBar(c, n, bottom, fontFam, caption = true) {
    const held = now() - n.pressReal;
    const k = keyScreen(n.midi);
    const w = Math.max(26, k.w - 6), x = k.x - w / 2, y = bottom - 16, bh = 9;
    const tol = holdTol(n.dur);
    const okFrom = (n.dur - tol.good) / n.dur, okTo = (n.dur + tol.good) / n.dur;
    const ratio = held / n.dur;
    const scale = Math.max(1.6, okTo + 0.1);
    c.fillStyle = 'rgba(0,0,0,.35)'; roundRect(c, x - 2, y - 2, w + 4, bh + 4, 6); c.fill();
    c.fillStyle = 'rgba(120,255,160,.35)';
    c.fillRect(x + w * okFrom / scale, y, w * (okTo - okFrom) / scale, bh);
    c.fillStyle = ratio < okFrom ? '#ffd166' : ratio <= okTo ? '#5fe38d' : '#ff6b6b';
    roundRect(c, x, y, Math.min(w, w * ratio / scale), bh, 4); c.fill();
    c.fillStyle = '#fff'; c.fillRect(x + w / scale - 1, y - 3, 2, bh + 6);
    if (!caption) return;
    const fig = figureOf(n.beats);
    c.font = `800 13px ${fontFam}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.45)';
    const txt = ratio < okFrom ? `${fig.name} · ${fig.time} ⏳` : '¡Soltá! ✋';
    c.strokeText(txt, k.x, y - 4);
    c.fillStyle = '#fff';
    c.fillText(txt, k.x, y - 4);
  }

  // Fondo con estrellitas titilantes
  const SKY = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, p: Math.random() * 6 }));

  function drawLane() {
    const sr = stage.getBoundingClientRect();
    const kr = kb.getBoundingClientRect();
    const top = sr.top, bottom = kr.top, left = sr.left, width = sr.width, h = bottom - top;
    if (h <= 10) return;
    const princess = state.theme === 'princess';
    const c = fctx;
    c.save();
    c.beginPath(); c.rect(left, top, width, h); c.clip();

    const bg = c.createLinearGradient(0, top, 0, bottom);
    if (princess) { bg.addColorStop(0, '#3c096c'); bg.addColorStop(0.6, '#7b2cbf'); bg.addColorStop(1, '#ff6fb5'); }
    else { bg.addColorStop(0, '#07070b'); bg.addColorStop(1, '#1b1b26'); }
    c.fillStyle = bg; c.fillRect(left, top, width, h);
    const tt = now() / 1000;
    for (const s of SKY) {
      c.globalAlpha = (princess ? 0.35 : 0.18) + 0.35 * Math.sin(tt * 2 + s.p) ** 2;
      c.fillStyle = '#fff';
      if (princess && s.r > 1.8) drawStar(c, left + s.x * width, top + s.y * h, s.r * 2.2, s.p);
      else { c.beginPath(); c.arc(left + s.x * width, top + s.y * h, s.r, 0, 7); c.fill(); }
    }
    c.globalAlpha = 1;

    const t = gameTime();
    const fontFam = getComputedStyle(document.body).fontFamily;
    if (game.view === 'staff') drawStaff(c, left, top, width, h, t, princess, fontFam);
    else {
      const used = new Set(game.mine.map(n => n.midi));
      for (const m of used) {
        const k = keyScreen(m);
        c.fillStyle = princess ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.04)';
        c.fillRect(k.left + 1, top, k.w - 2, h);
      }
      const hitY = bottom - 2;
      const lg = c.createLinearGradient(left, 0, left + width, 0);
      if (princess) { lg.addColorStop(0, '#ffd166'); lg.addColorStop(0.5, '#fff'); lg.addColorStop(1, '#ffd166'); }
      else { lg.addColorStop(0, '#e8b14a'); lg.addColorStop(1, '#e8b14a'); }
      c.fillStyle = lg; c.shadowColor = princess ? '#ffd1ea' : '#e8b14a'; c.shadowBlur = 12;
      c.fillRect(left, hitY - 2, width, 4);
      c.shadowBlur = 0;
      const pxms = (h - 6) / game.look;
      const g0 = game.groups[game.gidx];
      for (const n of game.mine) {
        const doneLearn = game.mode === 'learn' && n.pressed;
        if ((n.state === 'hit' || doneLearn) && t - n.ms > (game.mode === 'learn' ? n.dur : 120)) continue;
        const yBottom = hitY - (n.ms - t) * pxms;
        const hgt = Math.max(22, n.dur * pxms - 4);
        const yTop = yBottom - hgt;
        if (yTop > bottom || yBottom < top - 4) { if (n.ms - t > game.look) break; continue; }
        const k = keyScreen(n.midi);
        const pad = Math.max(2, k.w * 0.1);
        const x = k.left + pad, w = k.w - pad * 2;
        const col = noteColor(n.midi);
        c.globalAlpha = n.state === 'miss' ? 0.3 : (n.state === 'hit' || doneLearn) ? (game.mode === 'learn' ? 0.8 : 0.5) : 1;
        const isNext = game.mode === 'learn' && g0 && g0.notes.includes(n);
        c.shadowColor = col; c.shadowBlur = isNext ? 22 : 10;
        const ng = c.createLinearGradient(0, yTop, 0, yBottom);
        ng.addColorStop(0, princess ? '#fff' : col); ng.addColorStop(princess ? 0.25 : 0.6, col); ng.addColorStop(1, col);
        c.fillStyle = ng;
        roundRect(c, x, yTop, w, hgt, princess ? Math.min(14, w / 2) : 6);
        c.fill();
        c.shadowBlur = 0;
        if (princess) { c.fillStyle = 'rgba(255,255,255,.9)'; drawStar(c, x + w / 2, yBottom - 11, Math.min(8, w / 4), tt * 2); }
        if (w >= 22 && hgt >= 22) {
          c.fillStyle = princess ? '#5a0e44' : '#111';
          c.font = `700 ${Math.min(14, Math.round(w / 2.6))}px ${fontFam}`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(noteName(n.midi), x + w / 2, princess ? yBottom - 26 : yBottom - 12);
        }
        c.globalAlpha = 1;
      }
    }

    if (game.mode === 'learn') {
      const seen = new Set();
      for (const n of [...game.holding].sort((a, b) => b.midi - a.midi)) {
        drawHoldBar(c, n, bottom, fontFam, !seen.has(n.voice));
        seen.add(n.voice);
      }
    }

    if (t < LEAD && game.mode !== 'guess') {
      const sec = Math.ceil((LEAD - t) / (LEAD / 3));
      const txt = t > LEAD - 300 ? '¡Ya!' : String(Math.max(1, sec));
      c.font = `800 ${Math.round(h * 0.4)}px ${fontFam}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = princess ? '#fff' : '#e8b14a';
      c.globalAlpha = 0.85; c.shadowColor = princess ? '#ff6fb5' : '#000'; c.shadowBlur = 18;
      c.fillText(txt, left + width / 2, top + h / 2);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
    const onPaper = game.view === 'staff';
    const msgCol = onPaper ? (princess ? '#7b2cbf' : '#333') : 'rgba(255,255,255,.85)';
    let msg = '';
    if (game.mode === 'guess' && game.qStart) msg = princess ? '🔮 ¿Qué nota es? ✨' : '¿Qué nota es?';
    if (game.mode === 'learn' && game.waiting) {
      const g0 = game.groups[game.gidx];
      const minePending = g0 && g0.notes.some(n => n.mine && !n.pressed);
      if (g0 && !minePending) msg = duo.hand === 'right' ? 'Esperando a la mano izquierda… 👈' : 'Esperando a la mano derecha… 👉';
      else if (g0 && g0.notes.filter(n => n.mine).length > 1) msg = princess ? '✨ ¡Tocá juntas las teclas que brillan! ✨' : 'Tocá juntas las teclas que brillan';
      else msg = princess ? '✨ Tocá la tecla que brilla ✨' : 'Tocá la tecla que brilla';
    }
    if (msg) {
      c.font = `700 ${onPaper && game.grand ? 13 : 16}px ${fontFam}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = msgCol;
      c.fillText(msg, left + width / 2, top + (onPaper && game.grand ? h - 14 : 22));
    }
    c.restore();
  }

  function pause(fromRemote) {
    if (!game.active || game.paused || game.ended) return;
    game.paused = true;
    game.pausedHold = game.hold;
    game.hold = gameTime();
    for (const m of [...held]) noteOff(m);
    show('pauseOverlay');
    if (game.duo && fromRemote !== true) duoSend({ t: 'pause' });
  }
  function resume(fromRemote) {
    if (!game.paused) return;
    hide('pauseOverlay');
    const t = game.hold;
    game.paused = false;
    if (game.waiting) game.hold = game.pausedHold ?? t;
    else { game.hold = null; game.start = now() - t; }
    if (game.duo && fromRemote !== true) duoSend({ t: 'resume' });
  }
  function quitGame() {
    if (game.duo && game.active) duoSend({ t: 'quit' });
    hideAll();
    endGameUI();
  }

  // ---- Récords y estrellas ----
  const bestKey = (mode, id) => `best.${mode}.${id}`;
  const getBest = (mode, id) => store.get(bestKey(mode, id), null);
  function totalStars() {
    let s = 0;
    for (const song of SONGS) for (const mode of ['learn', 'rhythm']) s += (getBest(mode, song.id)?.stars || 0);
    for (const g of GUESS_LEVELS) s += (getBest('guess', g.id)?.stars || 0);
    return s;
  }
  function rankFor(stars) {
    const p = state.theme === 'princess';
    if (stars >= 45) return p ? '👑 Princesa del piano' : '👑 Leyenda del piano';
    if (stars >= 30) return '💎 Diamante';
    if (stars >= 16) return '🌟 Estrella';
    if (stars >= 6) return p ? '🦄 Pianista mágica' : '🎵 Pianista';
    return '🐣 Aprendiz';
  }

  function finishGame() {
    if (game.ended) return;
    game.ended = true;
    setTargets([]);
    updateFig(null);
    const mine = game.mode === 'guess' ? game.notes : game.mine;
    const total = mine.length;
    let stars, stats;
    if (game.mode === 'learn') {
      const c = game.counts;
      const clean = mine.filter(n => !n.mist && !n.durBad).length / total;
      stars = clean >= 0.85 ? 3 : clean >= 0.6 ? 2 : 1;
      stats = [['💫', 'Tecla equivocada', game.mistakes], ['✨', 'Duración justa', c.perfect + c.good], ['⚡', 'Muy cortas', c.short], ['⏳', 'Muy largas', c.long], ['🔥', 'Combo', game.maxCombo]];
    } else if (game.mode === 'guess') {
      const first = mine.filter(n => !n.mist).length;
      stars = first / total >= 0.9 ? 3 : first / total >= 0.7 ? 2 : 1;
      const avg = game.answerTimes.length ? game.answerTimes.reduce((a, b) => a + b, 0) / game.answerTimes.length / 1000 : 0;
      stats = [['🎯', 'A la primera', first + '/' + total], ['💫', 'Errores', game.mistakes], ['⏱️', 'Promedio', avg.toFixed(1) + ' s'], ['🔥', 'Racha', game.maxCombo]];
    } else {
      const c = game.counts;
      const acc = (c.perfect + c.great * 0.8 + c.good * 0.5) / total;
      stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : acc >= 0.3 ? 1 : 0;
      stats = [['✨', 'Perfectos', c.perfect], ['💖', 'Genial', c.great], ['🌸', 'Bien', c.good], ['💧', 'Ups', c.miss], ['🔥', 'Combo', game.maxCombo]];
    }
    const prev = getBest(game.mode, game.song.id);
    const record = !prev || game.score > prev.score;
    store.set(bestKey(game.mode, game.song.id), {
      score: Math.max(game.score, prev?.score || 0),
      stars: Math.max(stars, prev?.stars || 0),
    });
    game.myResult = { score: game.score, stars };
    if (game.duo) duoSend({ t: 'result', score: game.score, stars });
    showResults(stars, stats, record && game.score > 0);
  }

  function renderDuoResult() {
    const el = $('resDuo');
    if (!game.duo) { el.hidden = true; return; }
    el.hidden = false;
    const other = duo.hand === 'right' ? '👈 Mano izquierda' : '👉 Mano derecha';
    const p = game.partnerResult;
    if (!p) { el.textContent = `${other}: tocando…`; return; }
    const team = (game.myResult?.score || 0) + p.score;
    el.innerHTML = `${other}: <b>${p.score.toLocaleString('es-AR')}</b> ${'⭐'.repeat(p.stars)} · 🤝 Equipo: <b>${team.toLocaleString('es-AR')}</b>`;
  }

  function showResults(stars, stats, record) {
    const titles = state.theme === 'princess'
      ? ['¡Seguí practicando! 🌷', '¡Bien hecho! 🌸', '¡Muy bien! 💖', '¡Increíble! 👑']
      : ['¡Seguí practicando!', '¡Bien hecho!', '¡Muy bien!', '¡Increíble!'];
    $('resTitle').textContent = titles[stars];
    $('resSong').textContent = game.mode === 'guess' ? `${game.song.emoji} ${game.song.name}` : `${game.song.emoji} ${game.song.name} · ${game.mode === 'learn' ? 'Aprender' : 'Desafío'} · ${Math.round(game.tempo * 100)}%`;
    $('resStats').innerHTML = stats.map(([e, l, v]) => `<div>${e} ${l}<b>${v}</b></div>`).join('');
    $('resRecord').hidden = !record;
    renderDuoResult();
    const starEls = [...$('resStars').children];
    starEls.forEach(s => s.classList.remove('lit'));
    show('resultOverlay');
    fx.style.zIndex = 60;
    const target = game.score, t0 = now();
    const step = () => {
      const k = Math.min(1, (now() - t0) / 900);
      $('resScore').textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString('es-AR');
      if (k < 1 && $('resultOverlay').classList.contains('show')) requestAnimationFrame(step);
    };
    step();
    for (let i = 0; i < stars; i++) {
      setTimeout(() => {
        starEls[i].classList.add('lit');
        chime([hz(76 + i * 4), hz(83 + i * 4)], 0.08, 0.12);
        const r = starEls[i].getBoundingClientRect();
        sparkle(r.left + r.width / 2, r.top + r.height / 2, '#ffd166', 14, 1.2);
      }, 450 + i * 420);
    }
    if (stars >= 2) setTimeout(() => { confetti(stars === 3 ? 160 : 90); chime([hz(72), hz(76), hz(79), hz(84)], 0.09, 0.1); }, 450 + stars * 420);
  }

  // ---- Selector ----
  let pickMode = store.get('pickMode', 'learn');
  let pickLevel = store.get('pickLevel', 1);
  $('tempo').value = store.get('tempo', 1);

  function renderPicker() {
    $('pickTitle').textContent = state.theme === 'princess' ? '✨ ¿Qué tocamos hoy? ✨' : '¿Qué tocamos hoy?';
    const ts = totalStars();
    $('rank').textContent = `⭐ ${ts} · ${rankFor(ts)}`;
    if (duo.connected && pickMode === 'guess') pickMode = 'learn';
    for (const b of $('modeSeg').children) {
      b.classList.toggle('on', b.dataset.mode === pickMode);
      if (b.dataset.mode === 'guess') b.hidden = duo.connected;
    }
    $('btnDuo').textContent = duo.connected ? (duo.hand === 'right' ? '📱📱 Vos: 👉 Mano derecha' : '📱📱 Vos: 👈 Mano izquierda') : '📱📱 Dos manos';
    $('btnDuo').classList.toggle('on', duo.connected);
    for (const b of $('levelTabs').querySelectorAll('button[data-level]')) b.classList.toggle('on', +b.dataset.level === pickLevel);
    $('tempoLbl').textContent = Math.round(tempoVal() * 100) + '%';
    $('tempoBox').style.visibility = pickMode === 'guess' ? 'hidden' : '';
    $('viewSeg').hidden = pickMode !== 'learn';
    const view = store.get('view', 'blocks');
    for (const b of $('viewSeg').children) b.classList.toggle('on', b.dataset.view === view);
    const list = $('songList');
    list.innerHTML = '';
    if (pickMode === 'guess') {
      const g = GUESS_LEVELS[pickLevel - 1];
      const best = getBest('guess', g.id);
      const st = best?.stars || 0;
      const card = document.createElement('div');
      card.className = 'song wide';
      card.innerHTML = `<div class="em">${g.emoji}</div>
        <div><div class="nm">▶ ${g.name}</div><div class="ds">${g.desc}. Aparece una nota en el pentagrama: ¡tocá la tecla correcta!</div>
        <div class="st">${[0,1,2].map(i => `<span class="${i < st ? '' : 'off'}">⭐</span>`).join('')}</div>
        <div class="bs">${best ? 'Récord: ' + best.score.toLocaleString('es-AR') : '¡Nuevo!'}</div></div>`;
      card.addEventListener('click', () => startGame(g, 'guess'));
      list.appendChild(card);
      return;
    }
    for (const s of SONGS.filter(s => s.level === pickLevel)) {
      const best = getBest(pickMode, s.id);
      const st = best?.stars || 0;
      const card = document.createElement('div');
      card.className = 'song';
      const hands = s.level === 3 || duo.connected ? '<span class="hands" title="Dos manos">🙌</span>' : '';
      card.innerHTML = `<div class="em">${s.emoji}</div>
        <div><div class="nm">${s.name} ${hands}</div>
        <div class="st">${[0,1,2].map(i => `<span class="${i < st ? '' : 'off'}">⭐</span>`).join('')}</div>
        <div class="bs">${best ? 'Récord: ' + best.score.toLocaleString('es-AR') : '¡Nueva!'}</div></div>
        <button class="pv" title="Escuchar">🎧</button>`;
      card.querySelector('.pv').addEventListener('click', e => { e.stopPropagation(); togglePreview(s, e.currentTarget); });
      card.addEventListener('click', () => startGame(s, pickMode));
      list.appendChild(card);
    }
  }
  $('modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    pickMode = b.dataset.mode; store.set('pickMode', pickMode); renderPicker();
  });
  $('viewSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    store.set('view', b.dataset.view); renderPicker();
  });
  $('levelTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-level]'); if (!b) return;
    pickLevel = +b.dataset.level; store.set('pickLevel', pickLevel); renderPicker();
  });
  $('tempo').addEventListener('input', e => {
    store.set('tempo', parseFloat(e.target.value));
    $('tempoLbl').textContent = Math.round(parseFloat(e.target.value) * 100) + '%';
  });
  function openPicker() {
    initAudio();
    hideAll();
    if (game.active) endGameUI();
    renderPicker();
    show('pickerOverlay');
  }
  $('btnPlay').onclick = openPicker;
  $('pickClose').onclick = () => { stopPreview(); hide('pickerOverlay'); };

  // Escuchar la canción (las dos manos) antes de jugar
  let preview = null;
  function stopPreview() {
    if (!preview) return;
    preview.timers.forEach(clearTimeout);
    preview.btn?.classList.remove('playing');
    if (preview.btn) preview.btn.textContent = '🎧';
    for (const m of preview.on) stopVoice(m, 0.2);
    preview = null;
  }
  function togglePreview(song, btn) {
    initAudio();
    const same = preview && preview.song === song;
    stopPreview();
    if (same) return;
    const msb = 60000 / (song.bpm * tempoVal());
    preview = { song, btn, timers: [], on: new Set() };
    btn.classList.add('playing'); btn.textContent = '■';
    const p = preview;
    song.parsed.concat(song.bassParsed).forEach(n => {
      const vel = n.voice ? 0.5 : 0.78;
      p.timers.push(setTimeout(() => { startVoice(n.midi, vel); p.on.add(n.midi); }, n.beat * msb));
      p.timers.push(setTimeout(() => { stopVoice(n.midi, 0.3); p.on.delete(n.midi); }, (n.beat + n.beats) * msb - 20));
    });
    p.timers.push(setTimeout(() => { if (preview === p) stopPreview(); }, song.length * msb + 300));
  }

  // ---- Botones de pausa y resultados ----
  $('hudPause').onclick = () => pause();
  $('btnResume').onclick = () => resume();
  $('btnRestart').onclick = () => { const s = game.song, m = game.mode; hide('pauseOverlay'); startGame(s, m); };
  $('btnPauseSongs').onclick = () => { if (game.duo) duoSend({ t: 'quit' }); hide('pauseOverlay'); openPicker(); };
  $('btnQuit').onclick = () => quitGame();
  $('btnAgain').onclick = () => { fx.style.zIndex = 30; startGame(game.song, game.mode); };
  $('btnResSongs').onclick = () => { fx.style.zIndex = 30; openPicker(); };
  $('btnResQuit').onclick = () => { fx.style.zIndex = 30; hideAll(); endGameUI(); };

  // ================== Dos dispositivos (una mano cada uno) ==================
  const PEER_PREFIX = 'pianomagico-fp-';
  const duo = { peer: null, conn: null, connected: false, hand: 'right', code: null, rtt: 120, status: 'idle',
    local: new URLSearchParams(location.search).has('duotest') };

  function duoSend(msg) { try { if (duo.conn && duo.connected) duo.conn.send(msg); } catch (e) { console.warn(e); } }
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/peerjs.min.js'; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar PeerJS'));
      document.head.appendChild(s);
    });
  }
  function duoReset() {
    try { duo.conn?.close(); } catch {}
    try { duo.peer?.destroy(); } catch {}
    duo.conn = null; duo.peer = null; duo.connected = false;
  }
  function duoError(msg) { duo.status = 'idle'; $('duoErr').textContent = msg; renderDuo(); }

  async function duoCreate() {
    duoReset();
    $('duoErr').textContent = '';
    duo.code = String(Math.floor(1000 + Math.random() * 9000));
    duo.hand = 'right'; duo.status = 'wait'; renderDuo();
    if (duo.local) return localTransport(duo.code, true);
    try { await loadPeer(); } catch (e) { return duoError('No se pudo cargar la conexión. ¿Hay internet?'); }
    const peer = new window.Peer(PEER_PREFIX + duo.code);
    duo.peer = peer;
    peer.on('connection', c => { if (duo.conn) { c.close(); return; } setupConn(c); });
    peer.on('error', e => { if (e.type === 'unavailable-id') duoCreate(); else duoError('Error de conexión (' + e.type + '). Probá de nuevo.'); });
  }
  async function duoJoin(code) {
    code = (code || '').replace(/\D/g, '');
    if (code.length !== 4) { $('duoErr').textContent = 'El código tiene 4 números.'; return; }
    duoReset();
    $('duoErr').textContent = '';
    duo.code = code; duo.hand = 'left'; duo.status = 'joining'; renderDuo();
    if (duo.local) return localTransport(code, false);
    try { await loadPeer(); } catch (e) { return duoError('No se pudo cargar la conexión. ¿Hay internet?'); }
    const peer = new window.Peer();
    duo.peer = peer;
    peer.on('open', () => setupConn(peer.connect(PEER_PREFIX + code, { reliable: true })));
    peer.on('error', e => duoError(e.type === 'peer-unavailable' ? 'No encontré esa sala. Revisá el código.' : 'Error de conexión (' + e.type + ').'));
  }
  // Transporte de prueba entre pestañas del mismo navegador (?duotest)
  function localTransport(code, host) {
    const ch = new BroadcastChannel('piano-duo-' + code);
    const me = Math.random();
    const conn = {
      _h: {}, on(ev, f) { this._h[ev] = f; },
      send(d) { ch.postMessage({ from: me, d }); },
      close() { try { ch.postMessage({ from: me, d: { t: 'bye' } }); ch.close(); } catch {} },
    };
    ch.onmessage = e => {
      if (e.data.from === me) return;
      const d = e.data.d;
      if (d.t === 'hello') { if (!duo.connected) { conn.send({ t: 'hello' }); conn._h.open?.(); } return; }
      if (d.t === 'bye') { conn._h.close?.(); return; }
      conn._h.data?.(d);
    };
    setupConn(conn);
    if (!host) conn.send({ t: 'hello' });
  }
  function setupConn(c) {
    duo.conn = c;
    c.on('open', () => {
      duo.connected = true; duo.status = 'on';
      if (duo.hand === 'right') duoSend({ t: 'hand', yours: 'left' });
      duoSend({ t: 'ping', ts: now() });
      renderDuo();
      toast('📱📱 ¡Conectados!', 2000);
      chime([hz(72), hz(79), hz(84)], 0.08, 0.1);
    });
    c.on('data', onDuoMessage);
    c.on('close', onDuoClose);
    c.on('error', onDuoClose);
  }
  function onDuoClose() {
    if (!duo.connected && !duo.conn) return;
    duo.connected = false; duo.conn = null; duo.status = 'idle';
    toast('Se desconectó el otro dispositivo', 3000);
    renderDuo();
    if (game.active && game.duo && !game.ended) {
      // Sigue solo: las notas de la otra mano se dan por tocadas
      game.duo = false;
      for (const n of game.notes) if (!n.mine) n.pressed = true;
      checkGroup();
    }
  }
  function onDuoMessage(d) {
    if (!d || !d.t) return;
    switch (d.t) {
      case 'ping': duoSend({ t: 'pong', ts: d.ts }); break;
      case 'pong': duo.rtt = Math.max(20, now() - d.ts); break;
      case 'hand': duo.hand = d.yours; renderDuo(); break;
      case 'start': {
        const song = SONGS.find(s => s.id === d.song);
        if (!song) return;
        stopPreview();
        hide('duoOverlay');
        beginGame(song, d.mode, { duo: true, tempo: d.tempo });
        break;
      }
      case 'press': {
        if (!game.active || !game.duo) return;
        const n = game.notes[d.i];
        if (n && !n.mine && !n.pressed) { n.pressed = true; checkGroup(); }
        break;
      }
      case 'pause': if (game.active && game.duo) pause(true); break;
      case 'resume': if (game.active && game.duo) resume(true); break;
      case 'quit':
        if (game.active && game.duo) { hideAll(); endGameUI(); toast('La otra mano salió del juego', 2500); }
        break;
      case 'result': game.partnerResult = d; renderDuoResult(); break;
      case 'bye': onDuoClose(); break;
    }
  }

  function renderDuo() {
    const s = duo.status;
    $('duoIdle').hidden = s !== 'idle';
    $('duoWait').hidden = !(s === 'wait' || s === 'joining');
    $('duoOn').hidden = s !== 'on';
    $('duoIntro').hidden = s !== 'idle';
    $('duoCodeShow').textContent = s === 'wait' ? duo.code : '…';
    $('duoWaitTxt').textContent = s === 'wait' ? 'Escribí este código en el otro dispositivo' : 'Conectando…';
    $('duoHandTxt').innerHTML = duo.hand === 'right'
      ? 'Este dispositivo toca la <b>👉 mano derecha</b> (melodía).<br>El otro, la mano izquierda.'
      : 'Este dispositivo toca la <b>👈 mano izquierda</b> (acompañamiento).<br>El otro, la mano derecha.';
    if ($('pickerOverlay').classList.contains('show')) renderPicker();
  }
  $('btnDuo').onclick = () => { renderDuo(); show('duoOverlay'); };
  $('duoClose').onclick = () => hide('duoOverlay');
  $('duoCreate').onclick = () => duoCreate();
  $('duoJoin').onclick = () => duoJoin($('duoCode').value);
  $('duoCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') duoJoin($('duoCode').value); });
  $('duoCode').addEventListener('keyup', e => e.stopPropagation());
  $('duoCancel').onclick = () => { duoReset(); duo.status = 'idle'; renderDuo(); };
  $('duoSwap').onclick = () => {
    duo.hand = duo.hand === 'right' ? 'left' : 'right';
    duoSend({ t: 'hand', yours: duo.hand === 'right' ? 'left' : 'right' });
    renderDuo();
  };
  $('duoPick').onclick = () => { hide('duoOverlay'); openPicker(); };
  $('duoLeave').onclick = () => { duoSend({ t: 'bye' }); duoReset(); duo.status = 'idle'; renderDuo(); };

  // ================== Controles generales ==================
  function show(id) { $(id).classList.add('show'); }
  function hide(id) { $(id).classList.remove('show'); }
  function hideAll() { ['pickerOverlay', 'pauseOverlay', 'resultOverlay', 'duoOverlay'].forEach(hide); fx.style.zIndex = 30; }
  function status(t) { $('status').textContent = t; }
  let toastT;
  function toast(t, ms = 3500) {
    const el = $('toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  function zoom(f) {
    state.whiteW = Math.max(24, Math.min(140, geom.whiteW * f));
    store.set('whiteW', state.whiteW);
    layout(true);
  }
  $('btnZoomIn').onclick = () => zoom(1.2);
  $('btnZoomOut').onclick = () => zoom(1 / 1.2);

  function renderSustain() { $('btnSustain').classList.toggle('on', state.sustain); }
  $('btnSustain').onclick = () => {
    state.sustain = !state.sustain; store.set('sustain', state.sustain);
    if (!state.sustain) releaseSustain();
    renderSustain();
  };

  const LABEL_TXT = ['Notas: no', 'Notas: Do', 'Notas: todas'];
  function renderLabels() { $('btnLabels').textContent = LABEL_TXT[state.labels]; }
  $('btnLabels').onclick = () => {
    state.labels = (state.labels + 1) % 3; store.set('labels', state.labels);
    renderLabels(); layout(true);
  };

  $('vol').value = state.volume;
  $('vol').oninput = e => {
    state.volume = parseFloat(e.target.value); store.set('volume', state.volume);
    if (master) master.gain.setTargetAtTime(state.volume, ctx.currentTime, 0.02);
  };

  function applyTheme() {
    const p = state.theme === 'princess';
    document.body.classList.toggle('princess', p);
    $('btnTheme').textContent = p ? '🌙' : '👑';
    $('btnTheme').title = p ? 'Estilo normal' : 'Estilo princesa';
    $('appTitle').innerHTML = p ? 'Piano mágico <span>✨</span>' : 'PIANO<span>●</span>';
    $('startIcon').textContent = p ? '🦄' : '🎹';
    $('startTitle').textContent = p ? 'Piano mágico' : 'Piano de 88 teclas';
    document.querySelector('meta[name=theme-color]').content = p ? '#ffc2e2' : '#141414';
    drawMini();
    if ($('pickerOverlay').classList.contains('show')) renderPicker();
  }
  $('btnTheme').onclick = () => {
    state.theme = state.theme === 'princess' ? 'normal' : 'princess';
    store.set('theme', state.theme);
    applyTheme();
    if (state.theme === 'princess') { const r = $('btnTheme').getBoundingClientRect(); sparkle(r.left + r.width / 2, r.bottom, '#ff9ad5', 18, 1); }
  };

  // ================== Pantalla completa ==================
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsSupported = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const isStandalone = () => window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  async function enterFullscreen() {
    const de = document.documentElement;
    try {
      if (de.requestFullscreen) await de.requestFullscreen({ navigationUI: 'hide' });
      else if (de.webkitRequestFullscreen) de.webkitRequestFullscreen();
      else { iosHint(); return; }
      try { await screen.orientation?.lock?.('landscape'); } catch {}
    } catch { iosHint(); }
  }
  async function exitFullscreen() {
    try { screen.orientation?.unlock?.(); } catch {}
    if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  function iosHint() {
    if (!isStandalone()) toast('En iPhone: tocá Compartir → "Agregar a inicio" y abrilo desde ahí para verlo en pantalla completa.', 6000);
  }
  function onFsChange() {
    const on = !!fsEl();
    $('icoFull').style.display = on ? 'none' : '';
    $('icoExit').style.display = on ? '' : 'none';
    $('btnFull').classList.toggle('on', on);
    setTimeout(() => { layout(true); checkOrientation(); }, 120);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  $('btnFull').onclick = () => fsEl() ? exitFullscreen() : enterFullscreen();
  if (isStandalone()) $('btnFull').style.display = 'none';

  // ================== Inicio / orientación ==================
  function start(full) {
    initAudio();
    hide('startOverlay');
    if (full && fsSupported()) enterFullscreen(); else if (full) iosHint();
    checkOrientation();
  }
  $('btnStart').onclick = () => start(false);
  $('btnStartFull').onclick = () => start(true);
  if (!fsSupported() || isStandalone()) $('btnStartFull').style.display = 'none';

  function checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 700;
    const show_ = portrait && !state.rotateDismissed && !$('startOverlay').classList.contains('show');
    $('rotateOverlay').classList.toggle('show', show_);
  }
  $('btnRotateDismiss').onclick = () => { state.rotateDismissed = true; checkOrientation(); };

  let resizeT;
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { sizeFx(); layout(true); checkOrientation(); }, 80); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  new ResizeObserver(onResize).observe(stage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const m of [...held]) noteOff(m); pointers.clear(); releaseSustain(); stopPreview();
      if (game.active && !game.ended && !game.duo) pause();
    }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ================== Teclado de computadora ==================
  const KEYMAP = { a:0, w:1, s:2, e:3, d:4, f:5, t:6, g:7, y:8, h:9, u:10, j:11, k:12, o:13, l:14, p:15, 'ñ':16, ';':16 };
  let kbOct = 4;
  const kbDown = new Map();
  window.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && game.active) { game.paused ? resume() : pause(); return; }
    if (k === ' ') { e.preventDefault(); if (!state.sustain) { state.sustain = true; renderSustain(); } return; }
    if (k === 'z') { kbOct = Math.max(0, kbOct - 1); toast('Octava ' + kbOct, 1200); return; }
    if (k === 'x') { kbOct = Math.min(7, kbOct + 1); toast('Octava ' + kbOct, 1200); return; }
    if (!(k in KEYMAP)) return;
    const m = (kbOct + 1) * 12 + KEYMAP[k];
    if (m < FIRST || m > LAST) return;
    if ($('startOverlay').classList.contains('show')) start(false);
    kbDown.set(k, m); noteOn(m);
    if (!game.active) {
      const x = keyLeft(m);
      if (x < state.scroll || x > state.scroll + geom.viewW - geom.whiteW) { setScroll(x - geom.viewW / 2); saveScroll(); }
    }
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') { state.sustain = store.get('sustain', false); if (!state.sustain) releaseSustain(); renderSustain(); return; }
    if (kbDown.has(k)) { noteOff(kbDown.get(k)); kbDown.delete(k); }
  });

  // ================== Arranque ==================
  buildKeys();
  applyTheme();
  sizeFx();
  layout(false);
  renderSustain();
  renderLabels();
  show('startOverlay');

  // Ganchos para pruebas automáticas
  window.__piano = { game, noteOn, noteOff, gameTime, SONGS, startGame, keyScreen, duo };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
