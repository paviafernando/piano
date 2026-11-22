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
  const SONGS = (window.SONGS || []).map(s => {
    let t = 0; const notes = [];
    for (const tok of s.notes.trim().split(/\s+/)) {
      const [nm, d] = tok.split(':');
      const dur = d ? parseFloat(d) : 1;
      if (nm !== 'R') notes.push({ midi: nameToMidi(nm), beat: t, beats: dur });
      t += dur;
    }
    return { ...s, parsed: notes, length: t };
  });

  const WIN = { perfect: 75, great: 150, good: 240 };
  const LEAD = 2600;

  const game = {
    active: false, mode: 'learn', song: null, notes: [], tempo: 1, msBeat: 600,
    start: 0, hold: null, paused: false, waiting: false, idx: 0, ended: false,
    score: 0, combo: 0, maxCombo: 0, counts: null, mistakes: 0, look: 2400,
    lo: 60, hi: 72, lastTarget: null, endAt: 0,
    fitWhiteW() {
      const wl = whiteIndex[this.lo - (isBlack(this.lo) ? 1 : 0)];
      const wh = whiteIndex[this.hi + (isBlack(this.hi) ? 1 : 0)];
      const n = wh - wl + 1 + 2;
      return Math.max(30, Math.min(120, geom.viewW / n));
    },
    fitScroll() {
      const wl = whiteIndex[this.lo - (isBlack(this.lo) ? 1 : 0)];
      const wh = whiteIndex[this.hi + (isBlack(this.hi) ? 1 : 0)];
      const center = (wl + wh + 1) / 2 * geom.whiteW;
      return center - geom.viewW / 2;
    },
  };
  const now = () => performance.now();
  function gameTime() { return game.hold !== null ? game.hold : now() - game.start; }

  function startGame(song, mode) {
    stopPreview();
    initAudio();
    for (const m of [...held]) noteOff(m);
    releaseSustain();
    hideAll();
    game.active = true; game.ended = false; game.paused = false; game.waiting = false;
    game.song = song; game.mode = mode;
    game.tempo = parseFloat($('tempo').value) || 1;
    game.msBeat = 60000 / (song.bpm * game.tempo);
    game.notes = song.parsed.map((n, i) => ({
      i, midi: n.midi, ms: LEAD + n.beat * game.msBeat, dur: n.beats * game.msBeat,
      state: 'pending', mist: false,
    }));
    const mids = game.notes.map(n => n.midi);
    game.lo = Math.min(...mids); game.hi = Math.max(...mids);
    // Velocidad de caída: más lenta en modo aprender y con tempo lento
    game.look = mode === 'learn' ? 2600 : Math.max(1500, Math.min(2600, 2200 / Math.sqrt(game.tempo)));
    game.score = 0; game.combo = 0; game.maxCombo = 0; game.mistakes = 0; game.idx = 0;
    game.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    game.lastTarget = null; game.endAt = 0;
    game.start = now(); game.hold = null;
    document.body.classList.add('ingame');
    $('bar').hidden = true; $('mini').hidden = true; $('hud').hidden = false;
    $('hudEmoji').textContent = song.emoji; $('hudName').textContent = song.name;
    updateHud();
    requestAnimationFrame(() => { layout(false); ensureLoop(); });
  }

  function endGameUI() {
    game.active = false;
    setTarget(null);
    document.body.classList.remove('ingame');
    $('bar').hidden = false; $('mini').hidden = false; $('hud').hidden = true;
    for (const m of [...held]) noteOff(m);
    requestAnimationFrame(() => layout(false));
  }

  function setTarget(m, wrong = false) {
    if (game.lastTarget !== null && game.lastTarget !== m) keyEls[game.lastTarget]?.classList.remove('target', 'wrong');
    if (m !== null && m !== undefined) {
      const el = keyEls[m];
      el.style.setProperty('--tgt', noteColor(m));
      el.classList.add('target');
      if (wrong) { el.classList.remove('wrong'); void el.offsetWidth; el.classList.add('wrong'); }
    }
    game.lastTarget = m ?? null;
  }

  function mult() { return 1 + Math.min(3, Math.floor(game.combo / 10)); }

  function updateHud(bumpScore) {
    $('hudScore').textContent = '⭐ ' + game.score.toLocaleString('es-AR');
    const c = game.combo;
    $('hudCombo').textContent = c >= 2 ? `🔥 ${c}${mult() > 1 ? ' ×' + mult() : ''}` : '';
    const done = game.mode === 'learn' ? game.idx : game.notes.filter(n => n.state !== 'pending').length;
    $('hudProg').style.width = (done / game.notes.length * 100) + '%';
    if (bumpScore) { const s = $('hudScore'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
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
      floatText(`¡Combo ×${game.combo}! ${state.theme === 'princess' ? '🦄' : '🔥'}`, fxW / 2, (k.top) / 2 + 30, '#ff9ad5', 34, 70);
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

  function gamePress(m) {
    if (!game.active || game.paused || game.ended) return;
    const t = gameTime();
    if (game.mode === 'learn') {
      const n = game.notes[game.idx];
      if (!n) return;
      const early = n.ms - t;
      if (m === n.midi && (game.waiting || early < 700)) {
        n.state = 'hit';
        const pts = n.mist ? 50 : 100;
        if (n.mist) game.combo = 0;
        game.idx++;
        // Seguir desde el tiempo de esta nota
        game.start = now() - n.ms; game.hold = null; game.waiting = false;
        onHit(n, n.mist ? 'good' : 'perfect', pts);
        setTarget(null);
      } else if (game.waiting || early < 700) {
        if (!n.mist) game.mistakes++;
        n.mist = true;
        onMiss(n, true);
        setTarget(n.midi, true);
      }
      return;
    }
    // Desafío: buscar la nota pendiente más cercana de esa tecla
    let best = null, bd = 1e9;
    for (const n of game.notes) {
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

  function gameTick() {
    if (game.paused || game.ended) return;
    const t = gameTime();
    if (game.mode === 'learn') {
      const n = game.notes[game.idx];
      if (n) {
        if (!game.waiting && t >= n.ms) { game.waiting = true; game.hold = n.ms; }
        if (n.ms - t < 1500) { if (game.lastTarget !== n.midi) setTarget(n.midi); }
      } else if (!game.endAt) game.endAt = now() + 700;
    } else {
      let target = null, td = 1e9;
      for (const n of game.notes) {
        if (n.state !== 'pending') continue;
        if (t - n.ms > WIN.good) { n.state = 'miss'; game.counts.miss++; onMiss(n); continue; }
        const d = n.ms - t;
        if (d < 350 && d < td) { td = d; target = n.midi; }
        if (d > 400) break;
      }
      if (target !== game.lastTarget) setTarget(target);
      const last = game.notes[game.notes.length - 1];
      if (!game.endAt && game.notes.every(n => n.state !== 'pending')) game.endAt = now() + Math.max(600, last.dur);
    }
    if (game.endAt && now() >= game.endAt) finishGame();
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

    // Fondo
    const g = c.createLinearGradient(0, top, 0, bottom);
    if (princess) { g.addColorStop(0, '#3c096c'); g.addColorStop(0.6, '#7b2cbf'); g.addColorStop(1, '#ff6fb5'); }
    else { g.addColorStop(0, '#07070b'); g.addColorStop(1, '#1b1b26'); }
    c.fillStyle = g; c.fillRect(left, top, width, h);
    const tt = now() / 1000;
    for (const s of SKY) {
      c.globalAlpha = (princess ? 0.35 : 0.18) + 0.35 * Math.sin(tt * 2 + s.p) ** 2;
      c.fillStyle = '#fff';
      if (princess && s.r > 1.8) drawStar(c, left + s.x * width, top + s.y * h, s.r * 2.2, s.p);
      else { c.beginPath(); c.arc(left + s.x * width, top + s.y * h, s.r, 0, 7); c.fill(); }
    }
    c.globalAlpha = 1;

    // Carriles tenues de las teclas usadas
    const used = new Set(game.notes.map(n => n.midi));
    for (const m of used) {
      const k = keyScreen(m);
      c.fillStyle = princess ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.04)';
      c.fillRect(k.left + 1, top, k.w - 2, h);
    }

    // Línea de golpe
    const hitY = bottom - 2;
    const lg = c.createLinearGradient(left, 0, left + width, 0);
    if (princess) { lg.addColorStop(0, '#ffd166'); lg.addColorStop(0.5, '#fff'); lg.addColorStop(1, '#ffd166'); }
    else { lg.addColorStop(0, '#e8b14a'); lg.addColorStop(1, '#e8b14a'); }
    c.fillStyle = lg; c.shadowColor = princess ? '#ffd1ea' : '#e8b14a'; c.shadowBlur = 12;
    c.fillRect(left, hitY - 2, width, 4);
    c.shadowBlur = 0;

    // Notas que caen
    const t = gameTime();
    const pxms = (h - 6) / game.look;
    const fontFam = getComputedStyle(document.body).fontFamily;
    for (const n of game.notes) {
      if (n.state === 'hit' && t - n.ms > 120) continue;
      const yBottom = hitY - (n.ms - t) * pxms;
      const hgt = Math.max(22, n.dur * pxms - 4);
      const yTop = yBottom - hgt;
      if (yTop > bottom || yBottom < top - 4) { if (n.ms - t > game.look) break; continue; }
      const k = keyScreen(n.midi);
      const pad = Math.max(2, k.w * 0.1);
      const x = k.left + pad, w = k.w - pad * 2;
      const col = noteColor(n.midi);
      c.globalAlpha = n.state === 'miss' ? 0.3 : n.state === 'hit' ? 0.5 : 1;
      const isNext = game.mode === 'learn' && n.i === game.idx;
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

    // Cuenta regresiva
    if (t < LEAD) {
      const sec = Math.ceil((LEAD - t) / (LEAD / 3));
      const txt = t > LEAD - 300 ? '¡Ya!' : String(Math.max(1, sec));
      c.font = `800 ${Math.round(h * 0.4)}px ${fontFam}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = princess ? '#fff' : '#e8b14a';
      c.globalAlpha = 0.85; c.shadowColor = princess ? '#ff6fb5' : '#000'; c.shadowBlur = 18;
      c.fillText(txt, left + width / 2, top + h / 2);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
    if (game.mode === 'learn' && game.waiting) {
      c.font = `700 16px ${fontFam}`; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.fillText(state.theme === 'princess' ? '✨ Tocá la tecla que brilla ✨' : 'Tocá la tecla que brilla', left + width / 2, top + 22);
    }
    c.restore();
  }

  function pause() {
    if (!game.active || game.paused || game.ended) return;
    game.paused = true;
    game.pausedHold = game.hold;
    game.hold = gameTime();
    for (const m of [...held]) noteOff(m);
    show('pauseOverlay');
  }
  function resume() {
    if (!game.paused) return;
    hide('pauseOverlay');
    const t = game.hold;
    game.paused = false;
    if (game.waiting) game.hold = game.pausedHold ?? t;
    else { game.hold = null; game.start = now() - t; }
  }

  // ---- Récords y estrellas ----
  const bestKey = (mode, id) => `best.${mode}.${id}`;
  const getBest = (mode, id) => store.get(bestKey(mode, id), null);
  function totalStars() {
    let s = 0;
    for (const song of SONGS) for (const mode of ['learn', 'rhythm']) s += (getBest(mode, song.id)?.stars || 0);
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
    setTarget(null);
    const total = game.notes.length;
    let stars, stats;
    if (game.mode === 'learn') {
      const clean = game.notes.filter(n => !n.mist).length / total;
      stars = clean >= 0.9 ? 3 : clean >= 0.7 ? 2 : 1;
      stats = [['🎯', 'Notas', total], ['💫', 'Errores', game.mistakes], ['🔥', 'Mejor combo', game.maxCombo]];
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
    showResults(stars, stats, record && game.score > 0);
  }

  function showResults(stars, stats, record) {
    const titles = state.theme === 'princess'
      ? ['¡Seguí practicando! 🌷', '¡Bien hecho! 🌸', '¡Muy bien! 💖', '¡Increíble! 👑']
      : ['¡Seguí practicando!', '¡Bien hecho!', '¡Muy bien!', '¡Increíble!'];
    $('resTitle').textContent = titles[stars];
    $('resSong').textContent = `${game.song.emoji} ${game.song.name} · ${game.mode === 'learn' ? 'Aprender' : 'Desafío'} · ${Math.round(game.tempo * 100)}%`;
    $('resStats').innerHTML = stats.map(([e, l, v]) => `<div>${e} ${l}<b>${v}</b></div>`).join('');
    $('resRecord').hidden = !record;
    const starEls = [...$('resStars').children];
    starEls.forEach(s => s.classList.remove('lit'));
    show('resultOverlay');
    fx.style.zIndex = 60;
    // Puntaje que sube
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
    for (const b of $('modeSeg').children) b.classList.toggle('on', b.dataset.mode === pickMode);
    for (const b of $('levelTabs').children) b.classList.toggle('on', +b.dataset.level === pickLevel);
    $('tempoLbl').textContent = Math.round(parseFloat($('tempo').value) * 100) + '%';
    const list = $('songList');
    list.innerHTML = '';
    for (const s of SONGS.filter(s => s.level === pickLevel)) {
      const best = getBest(pickMode, s.id);
      const st = best?.stars || 0;
      const card = document.createElement('div');
      card.className = 'song';
      card.innerHTML = `<div class="em">${s.emoji}</div>
        <div><div class="nm">${s.name}</div>
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
  $('levelTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
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

  // Escuchar la canción antes de jugar
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
    const tempo = parseFloat($('tempo').value) || 1;
    const msb = 60000 / (song.bpm * tempo);
    preview = { song, btn, timers: [], on: new Set() };
    btn.classList.add('playing'); btn.textContent = '■';
    const p = preview;
    song.parsed.forEach(n => {
      p.timers.push(setTimeout(() => { startVoice(n.midi, 0.75); p.on.add(n.midi); }, n.beat * msb));
      p.timers.push(setTimeout(() => { stopVoice(n.midi, 0.3); p.on.delete(n.midi); }, (n.beat + n.beats) * msb - 20));
    });
    p.timers.push(setTimeout(() => { if (preview === p) stopPreview(); }, song.length * msb + 300));
  }

  // ---- Botones de pausa y resultados ----
  $('hudPause').onclick = pause;
  $('btnResume').onclick = resume;
  $('btnRestart').onclick = () => { const s = game.song, m = game.mode; hide('pauseOverlay'); startGame(s, m); };
  $('btnPauseSongs').onclick = () => { hide('pauseOverlay'); openPicker(); };
  $('btnQuit').onclick = () => { hide('pauseOverlay'); endGameUI(); };
  $('btnAgain').onclick = () => { fx.style.zIndex = 30; startGame(game.song, game.mode); };
  $('btnResSongs').onclick = () => { fx.style.zIndex = 30; openPicker(); };
  $('btnResQuit').onclick = () => { fx.style.zIndex = 30; hide('resultOverlay'); endGameUI(); };

  // ================== Controles generales ==================
  function show(id) { $(id).classList.add('show'); }
  function hide(id) { $(id).classList.remove('show'); }
  function hideAll() { ['pickerOverlay', 'pauseOverlay', 'resultOverlay'].forEach(hide); fx.style.zIndex = 30; }
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
      if (game.active && !game.ended) pause();
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
  window.__piano = { game, noteOn, noteOff, gameTime, SONGS, startGame, keyScreen };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
