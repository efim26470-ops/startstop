(() => {
  'use strict';

  const STORAGE_KEY = 'reflexlab.v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const themes = [
    { id: 'dark', name: 'Reflex Dark', swatch: ['#080808', '#ff4c35'] },
    { id: 'light', name: 'Soft Light', swatch: ['#f7f8fb', '#ff4b34'] },
    { id: 'neon', name: 'Neon Pulse', swatch: ['#030511', '#00e5ff'] },
    { id: 'ember', name: 'Ember', swatch: ['#130704', '#ff7a18'] },
    { id: 'ocean', name: 'Ocean', swatch: ['#031017', '#33d6ff'] },
    { id: 'sakura', name: 'Sakura', swatch: ['#fff1f6', '#ff5da8'] },
    { id: 'matrix', name: 'Matrix', swatch: ['#020703', '#32ff70'] }
  ];

  const levels = {
    easy:   { label: 'Easy',   targets: 10, grid: 4, aim: 78, sequence: 3, matrix: 12, stroop: 8, raceDelay: [850, 1700] },
    normal: { label: 'Normal', targets: 15, grid: 5, aim: 64, sequence: 4, matrix: 16, stroop: 12, raceDelay: [1150, 2300] },
    hard:   { label: 'Hard',   targets: 25, grid: 6, aim: 48, sequence: 5, matrix: 25, stroop: 18, raceDelay: [1500, 3300] }
  };

  const modeInfo = {
    tiles: { title: 'Tiles', bestType: 'time', instruction: '// TAP ON THE COLORED TILE TO START //' },
    race: { title: 'Race', bestType: 'reaction', instruction: '// TAP WHEN YOU ARE READY TO RACE //' },
    aim: { title: 'Aim', bestType: 'time', instruction: '// TAP THE TARGETS AS FAST AS YOU CAN //' },
    sequence: { title: 'Memory', bestType: 'level', instruction: '// REMEMBER THE GLOWING TILES //' },
    matrix: { title: 'Matrix', bestType: 'time', instruction: '// TAP NUMBERS IN ORDER //' },
    stroop: { title: 'Color', bestType: 'time', instruction: '// TAP THE TEXT COLOR, NOT THE WORD //' }
  };

  const defaultState = {
    theme: 'dark',
    level: 'easy',
    mode: 'tiles',
    sound: true,
    haptic: true,
    reduceMotion: false,
    bests: {},
    runs: {},
    globalRuns: 0,
    installTipSeen: false
  };

  let state = loadState();
  let raf = 0;
  let timerStart = 0;
  let elapsed = 0;
  let activeTimer = false;
  let game = null;
  let audioCtx = null;
  let deferredInstallPrompt = null;

  const els = {
    body: document.body,
    appShell: $('#appShell'),
    mainTime: $('#mainTime'),
    bestValue: $('#bestValue'),
    progressValue: $('#progressValue'),
    instruction: $('#instruction'),
    scoreCard: $('#scoreCard'),
    tilesGrid: $('#tilesGrid'),
    raceZone: $('#raceZone'),
    lights: $('#lights'),
    raceInstruction: $('#raceInstruction'),
    raceButton: $('#raceButton'),
    aimZone: $('#aimZone'),
    aimTarget: $('#aimTarget'),
    sequenceZone: $('#sequenceZone'),
    sequenceGrid: $('#sequenceGrid'),
    sequenceStart: $('#sequenceStart'),
    matrixZone: $('#matrixZone'),
    matrixGrid: $('#matrixGrid'),
    stroopZone: $('#stroopZone'),
    stroopWord: $('#stroopWord'),
    stroopOptions: $('#stroopOptions'),
    modeTabs: $$('.mode-tab'),
    levelButtons: $$('#levelButtons .seg-btn'),
    themeGrid: $('#themeGrid'),
    settingsDrawer: $('#settingsDrawer'),
    helpDrawer: $('#helpDrawer'),
    toast: $('#toast'),
    avgStat: $('#avgStat'),
    accuracyStat: $('#accuracyStat'),
    sessionStat: $('#sessionStat'),
    globalRank: $('#globalRank'),
    soundToggle: $('#soundToggle'),
    hapticToggle: $('#hapticToggle'),
    motionToggle: $('#motionToggle'),
    installBtn: $('#installBtn')
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      return { ...JSON.parse(JSON.stringify(defaultState)), ...JSON.parse(raw) };
    } catch {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function key(mode = state.mode, level = state.level) { return `${mode}.${level}`; }
  function getLevel() { return levels[state.level]; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a,b) => a[0]-b[0]).map(v => v[1]); }
  function fmt(sec) { return Number.isFinite(sec) ? sec.toFixed(3) : '--'; }
  function fmtMs(ms) { return Number.isFinite(ms) ? `${Math.round(ms)}ms` : '--'; }
  function bestFor() { return state.bests[key()]; }

  function vibrate(pattern = 12) {
    if (state.haptic && navigator.vibrate) navigator.vibrate(pattern);
  }

  function beep(type = 'tap') {
    if (!state.sound) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const freqs = { tap: 520, good: 780, bad: 170, finish: 980, tick: 360, go: 680 };
      osc.type = type === 'bad' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freqs[type] || 520, now);
      if (type === 'finish') osc.frequency.exponentialRampToValueAtTime(1320, now + .12);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.09, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (type === 'finish' ? .22 : .08));
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + (type === 'finish' ? .24 : .1));
    } catch {}
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  function startTimer() {
    stopTimer();
    timerStart = performance.now();
    activeTimer = true;
    tick();
  }

  function stopTimer() {
    activeTimer = false;
    cancelAnimationFrame(raf);
  }

  function tick() {
    if (!activeTimer) return;
    elapsed = (performance.now() - timerStart) / 1000;
    els.mainTime.textContent = fmt(elapsed);
    raf = requestAnimationFrame(tick);
  }

  function flashScore() {
    els.scoreCard.classList.remove('pulse');
    void els.scoreCard.offsetWidth;
    els.scoreCard.classList.add('pulse');
  }

  function recordResult(value, meta = {}) {
    stopTimer();
    const k = key();
    const oldBest = state.bests[k];
    let improved = false;
    const bestType = modeInfo[state.mode].bestType;

    if (bestType === 'level') {
      improved = !oldBest || value > oldBest.value;
    } else {
      improved = !oldBest || value < oldBest.value;
    }
    if (improved) state.bests[k] = { value, at: Date.now(), meta };

    state.runs[k] = (state.runs[k] || 0) + 1;
    state.globalRuns += 1;
    saveState();
    updateHud();
    flashScore();
    beep(improved ? 'finish' : 'good');
    vibrate(improved ? [16, 34, 16] : 18);
    showToast(improved ? 'Новый рекорд' : 'Результат сохранён');
  }

  function updateHud(progressText = null) {
    const best = bestFor();
    if (!best) els.bestValue.textContent = '--';
    else if (modeInfo[state.mode].bestType === 'level') els.bestValue.textContent = `${best.value}`;
    else if (state.mode === 'race') els.bestValue.textContent = fmt(best.value);
    else els.bestValue.textContent = fmt(best.value);

    const runs = state.runs[key()] || 0;
    els.sessionStat.textContent = String(runs);
    const rank = Math.max(1, 20000 - state.globalRuns * 7 - Object.keys(state.bests).length * 13);
    els.globalRank.textContent = `#${String(rank).padStart(5, '0')}`;
    if (progressText !== null) els.progressValue.textContent = progressText;
  }

  function updateStats(meta = {}) {
    els.avgStat.textContent = meta.avg ? fmtMs(meta.avg) : '--';
    els.accuracyStat.textContent = Number.isFinite(meta.accuracy) ? `${Math.round(meta.accuracy)}%` : '100%';
  }

  function setTheme(id) {
    state.theme = themes.some(t => t.id === id) ? id : 'dark';
    document.documentElement.dataset.theme = state.theme === 'dark' ? '' : state.theme;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', state.theme === 'light' || state.theme === 'sakura' ? '#f7f8fb' : '#090909');
    $$('.theme-choice').forEach(btn => btn.classList.toggle('is-active', btn.dataset.theme === state.theme));
    saveState();
  }

  function syncLayoutState() {
    document.body.dataset.mode = state.mode;
    document.body.dataset.level = state.level;
    if (els.appShell) {
      els.appShell.dataset.mode = state.mode;
      els.appShell.dataset.level = state.level;
    }
  }

  function setLevel(level) {
    state.level = levels[level] ? level : 'easy';
    syncLayoutState();
    els.levelButtons.forEach(b => b.classList.toggle('is-active', b.dataset.level === state.level));
    saveState();
    resetMode();
  }

  function setMode(mode) {
    state.mode = modeInfo[mode] ? mode : 'tiles';
    syncLayoutState();
    els.modeTabs.forEach(b => b.classList.toggle('is-active', b.dataset.mode === state.mode));
    saveState();
    resetMode();
  }

  function hideAllZones() {
    [els.tilesGrid, els.raceZone, els.aimZone, els.sequenceZone, els.matrixZone, els.stroopZone].forEach(el => el.classList.add('hidden'));
  }

  function resetMode() {
    stopTimer();
    elapsed = 0;
    game = null;
    syncLayoutState();
    els.mainTime.textContent = modeInfo[state.mode].bestType === 'level' ? '0' : '0.000';
    els.instruction.textContent = modeInfo[state.mode].instruction;
    updateStats({ accuracy: 100 });
    updateHud(defaultProgress());
    hideAllZones();
    if (state.mode === 'tiles') initTiles();
    if (state.mode === 'race') initRace();
    if (state.mode === 'aim') initAim();
    if (state.mode === 'sequence') initSequence();
    if (state.mode === 'matrix') initMatrix();
    if (state.mode === 'stroop') initStroop();
  }

  function defaultProgress() {
    const lvl = getLevel();
    if (state.mode === 'tiles') return `0/${lvl.targets}`;
    if (state.mode === 'aim') return `0/${lvl.targets}`;
    if (state.mode === 'sequence') return `0/${lvl.sequence}`;
    if (state.mode === 'matrix') return `1/${lvl.matrix}`;
    if (state.mode === 'stroop') return `0/${lvl.stroop}`;
    return 'READY';
  }

  function initTiles() {
    const lvl = getLevel();
    const count = lvl.grid * lvl.grid;
    els.tilesGrid.classList.remove('hidden');
    els.tilesGrid.style.gridTemplateColumns = `repeat(${lvl.grid}, 1fr)`;
    els.tilesGrid.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset.index = i;
      b.addEventListener('click', onTileTap);
      els.tilesGrid.appendChild(b);
    }
    game = { started: false, active: -1, hits: 0, misses: 0, targets: lvl.targets, lastTap: 0, intervals: [] };
    nextTile();
  }

  function nextTile() {
    const tiles = $$('.tile', els.tilesGrid);
    tiles.forEach(t => t.classList.remove('active'));
    let idx;
    do idx = randInt(0, tiles.length - 1); while (tiles.length > 1 && idx === game.active);
    game.active = idx;
    tiles[idx]?.classList.add('active');
  }

  function onTileTap(e) {
    if (!game) return;
    const idx = Number(e.currentTarget.dataset.index);
    if (idx !== game.active) {
      e.currentTarget.classList.add('miss');
      setTimeout(() => e.currentTarget.classList.remove('miss'), 280);
      game.misses++;
      beep('bad'); vibrate(35);
      updateStats({ accuracy: (game.hits / Math.max(1, game.hits + game.misses)) * 100, avg: avg(game.intervals) });
      return;
    }
    const now = performance.now();
    if (!game.started) {
      game.started = true;
      game.lastTap = now;
      startTimer();
      els.instruction.textContent = '// KEEP GOING //';
    } else {
      game.intervals.push(now - game.lastTap);
      game.lastTap = now;
    }
    game.hits++;
    beep('tap'); vibrate(10);
    updateHud(`${game.hits}/${game.targets}`);
    updateStats({ accuracy: (game.hits / Math.max(1, game.hits + game.misses)) * 100, avg: avg(game.intervals) });
    if (game.hits >= game.targets) {
      const total = (performance.now() - timerStart) / 1000;
      els.mainTime.textContent = fmt(total);
      recordResult(total, { misses: game.misses, avg: avg(game.intervals) });
      els.instruction.textContent = '// DONE. TAP A TILE TO RESTART //';
      initTiles();
      return;
    }
    nextTile();
  }

  function avg(arr) { return arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0; }

  function initRace() {
    els.raceZone.classList.remove('hidden');
    els.lights.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const pillar = document.createElement('div');
      pillar.className = 'light-pillar';
      for (let j = 0; j < 4; j++) {
        const bulb = document.createElement('span');
        bulb.className = 'bulb';
        pillar.appendChild(bulb);
      }
      els.lights.appendChild(pillar);
    }
    els.raceButton.classList.remove('ready');
    els.raceInstruction.textContent = '// TAP WHEN YOU ARE READY TO RACE //';
    els.instruction.textContent = '// WAIT FOR GREEN. EARLY TAP = FALSE START //';
    game = { phase: 'idle', timeout: 0, goAt: 0, falseStarts: 0 };
  }

  function clearRaceTimeout() {
    if (game?.timeout) clearTimeout(game.timeout);
    if (game?.timeouts) game.timeouts.forEach(clearTimeout);
  }

  function raceTap() {
    if (!game || state.mode !== 'race') return;
    if (game.phase === 'idle' || game.phase === 'done') {
      startRaceCountdown();
      return;
    }
    if (game.phase === 'countdown' || game.phase === 'waiting') {
      clearRaceTimeout();
      game.falseStarts++;
      game.phase = 'idle';
      setBulbs('off');
      els.raceButton.classList.remove('ready');
      els.mainTime.textContent = 'FALSE';
      els.progressValue.textContent = 'START';
      els.raceInstruction.textContent = '// TOO EARLY. TAP TO TRY AGAIN //';
      beep('bad'); vibrate([45, 40, 45]);
      updateStats({ accuracy: 0 });
      return;
    }
    if (game.phase === 'go') {
      const reaction = (performance.now() - game.goAt) / 1000;
      game.phase = 'done';
      els.mainTime.textContent = fmt(reaction);
      els.progressValue.textContent = 'GO';
      els.raceInstruction.textContent = '// NICE LAUNCH. TAP TO RESTART //';
      recordResult(reaction, { falseStarts: game.falseStarts });
    }
  }

  function startRaceCountdown() {
    clearRaceTimeout();
    game.phase = 'countdown';
    game.timeouts = [];
    setBulbs('off');
    els.raceButton.classList.remove('ready');
    els.mainTime.textContent = '0.000';
    els.progressValue.textContent = 'WAIT';
    els.raceInstruction.textContent = '// WAIT... //';
    beep('tick'); vibrate(10);
    for (let i = 0; i < 4; i++) {
      game.timeouts.push(setTimeout(() => {
        lightPillar(i, 'red');
        beep('tick'); vibrate(8);
      }, 450 * (i + 1)));
    }
    const [min, max] = getLevel().raceDelay;
    game.timeouts.push(setTimeout(() => {
      game.phase = 'waiting';
      const randomDelay = randInt(min, max);
      game.timeout = setTimeout(() => {
        game.phase = 'go';
        game.goAt = performance.now();
        setBulbs('green');
        els.raceButton.classList.add('ready');
        els.raceInstruction.textContent = '// GO! //';
        els.progressValue.textContent = 'TAP';
        beep('go'); vibrate(20);
      }, randomDelay);
    }, 2300));
  }

  function lightPillar(index, color) {
    const pillars = $$('.light-pillar', els.lights);
    $$('.bulb', pillars[index]).forEach(b => b.classList.add(color));
  }

  function setBulbs(mode) {
    $$('.bulb', els.lights).forEach(b => {
      b.classList.remove('red', 'green');
      if (mode === 'green') b.classList.add('green');
    });
  }

  function initAim() {
    els.aimZone.classList.remove('hidden');
    const lvl = getLevel();
    game = { started: false, hits: 0, misses: 0, targets: lvl.targets, intervals: [], lastTap: 0 };
    els.aimTarget.style.width = `${lvl.aim}px`;
    els.aimTarget.style.height = `${lvl.aim}px`;
    placeTarget(true);
  }

  function placeTarget(center = false) {
    const size = getLevel().aim;
    const rect = els.aimZone.getBoundingClientRect();
    const pad = 12;
    const x = center ? (rect.width - size) / 2 : randInt(pad, Math.max(pad, rect.width - size - pad));
    const y = center ? (rect.height - size) / 2 : randInt(pad, Math.max(pad, rect.height - size - pad));
    els.aimTarget.style.left = `${x}px`;
    els.aimTarget.style.top = `${y}px`;
    els.aimTarget.classList.remove('pop');
    void els.aimTarget.offsetWidth;
    els.aimTarget.classList.add('pop');
  }

  function aimTap(e) {
    e.stopPropagation();
    if (!game || state.mode !== 'aim') return;
    const now = performance.now();
    if (!game.started) {
      game.started = true;
      game.lastTap = now;
      startTimer();
      els.instruction.textContent = '// TARGET LOCKED //';
    } else {
      game.intervals.push(now - game.lastTap);
      game.lastTap = now;
    }
    game.hits++;
    beep('tap'); vibrate(10);
    updateHud(`${game.hits}/${game.targets}`);
    updateStats({ accuracy: (game.hits / Math.max(1, game.hits + game.misses)) * 100, avg: avg(game.intervals) });
    if (game.hits >= game.targets) {
      const total = (performance.now() - timerStart) / 1000;
      els.mainTime.textContent = fmt(total);
      recordResult(total, { misses: game.misses, avg: avg(game.intervals) });
      els.instruction.textContent = '// DONE. TARGET RESET //';
      initAim();
      return;
    }
    placeTarget();
  }

  function aimMiss() {
    if (!game || state.mode !== 'aim' || !game.started) return;
    game.misses++;
    beep('bad'); vibrate(22);
    updateStats({ accuracy: (game.hits / Math.max(1, game.hits + game.misses)) * 100, avg: avg(game.intervals) });
  }

  function initSequence() {
    els.sequenceZone.classList.remove('hidden');
    els.sequenceGrid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.className = 'seq-tile';
      b.type = 'button';
      b.dataset.index = i;
      b.addEventListener('click', sequenceTap);
      els.sequenceGrid.appendChild(b);
    }
    game = { round: getLevel().sequence, sequence: [], input: [], showing: false, streak: 0, mistakes: 0 };
    els.mainTime.textContent = '0';
  }

  function startSequenceRound() {
    if (!game || game.showing) return;
    game.sequence = Array.from({ length: game.round }, () => randInt(0, 8));
    game.input = [];
    showSequence();
  }

  async function showSequence() {
    game.showing = true;
    els.sequenceStart.textContent = 'Watch...';
    $$('.seq-tile', els.sequenceGrid).forEach(t => t.classList.add('locked'));
    els.progressValue.textContent = `0/${game.round}`;
    await wait(260);
    for (const idx of game.sequence) {
      const tile = $$('.seq-tile', els.sequenceGrid)[idx];
      tile.classList.add('active');
      beep('tick'); vibrate(8);
      await wait(state.reduceMotion ? 120 : 360);
      tile.classList.remove('active');
      await wait(state.reduceMotion ? 60 : 145);
    }
    $$('.seq-tile', els.sequenceGrid).forEach(t => t.classList.remove('locked'));
    els.sequenceStart.textContent = 'Repeat it';
    els.instruction.textContent = '// YOUR TURN //';
    game.showing = false;
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function sequenceTap(e) {
    if (!game || game.showing) return;
    const idx = Number(e.currentTarget.dataset.index);
    e.currentTarget.classList.add('active');
    setTimeout(() => e.currentTarget.classList.remove('active'), 160);
    const expected = game.sequence[game.input.length];
    if (idx !== expected) {
      game.mistakes++;
      beep('bad'); vibrate([30, 30, 30]);
      els.instruction.textContent = '// WRONG. SHOW AGAIN //';
      updateStats({ accuracy: Math.max(0, 100 - game.mistakes * 20) });
      setTimeout(showSequence, 550);
      return;
    }
    beep('tap'); vibrate(8);
    game.input.push(idx);
    els.progressValue.textContent = `${game.input.length}/${game.round}`;
    if (game.input.length === game.round) {
      game.streak++;
      els.mainTime.textContent = String(game.round);
      recordResult(game.round, { mistakes: game.mistakes });
      game.round++;
      els.instruction.textContent = '// ROUND UP //';
      setTimeout(() => {
        if (state.mode === 'sequence') startSequenceRound();
      }, 700);
    }
  }

  function initMatrix() {
    els.matrixZone.classList.remove('hidden');
    const count = getLevel().matrix;
    const cols = Math.ceil(Math.sqrt(count));
    els.matrixGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    els.matrixGrid.innerHTML = '';
    const nums = shuffle(Array.from({ length: count }, (_, i) => i + 1));
    nums.forEach(n => {
      const b = document.createElement('button');
      b.className = 'matrix-cell';
      b.type = 'button';
      b.textContent = n;
      b.dataset.number = n;
      b.addEventListener('click', matrixTap);
      els.matrixGrid.appendChild(b);
    });
    game = { next: 1, count, started: false, mistakes: 0, intervals: [], lastTap: 0 };
    markNext();
  }

  function markNext() {
    $$('.matrix-cell', els.matrixGrid).forEach(c => c.classList.toggle('next', Number(c.dataset.number) === game.next));
  }

  function matrixTap(e) {
    if (!game || state.mode !== 'matrix') return;
    const num = Number(e.currentTarget.dataset.number);
    if (num !== game.next) {
      game.mistakes++;
      e.currentTarget.classList.add('miss');
      setTimeout(() => e.currentTarget.classList.remove('miss'), 280);
      beep('bad'); vibrate(28);
      updateStats({ accuracy: (game.next - 1) / Math.max(1, game.next - 1 + game.mistakes) * 100, avg: avg(game.intervals) });
      return;
    }
    const now = performance.now();
    if (!game.started) {
      game.started = true;
      game.lastTap = now;
      startTimer();
    } else {
      game.intervals.push(now - game.lastTap);
      game.lastTap = now;
    }
    e.currentTarget.classList.add('done');
    beep('tap'); vibrate(9);
    game.next++;
    updateHud(`${Math.min(game.next, game.count)}/${game.count}`);
    updateStats({ accuracy: (game.next - 1) / Math.max(1, game.next - 1 + game.mistakes) * 100, avg: avg(game.intervals) });
    if (game.next > game.count) {
      const total = (performance.now() - timerStart) / 1000;
      els.mainTime.textContent = fmt(total);
      recordResult(total, { mistakes: game.mistakes, avg: avg(game.intervals) });
      initMatrix();
      return;
    }
    markNext();
  }

  const colorWords = [
    { key: 'red', ru: 'RED', color: '#ff3b30' },
    { key: 'blue', ru: 'BLUE', color: '#0a84ff' },
    { key: 'green', ru: 'GREEN', color: '#30d158' },
    { key: 'yellow', ru: 'YELLOW', color: '#ffd60a' }
  ];

  function initStroop() {
    els.stroopZone.classList.remove('hidden');
    els.stroopOptions.innerHTML = '';
    colorWords.forEach(c => {
      const b = document.createElement('button');
      b.className = 'stroop-btn';
      b.type = 'button';
      b.textContent = c.ru;
      b.dataset.key = c.key;
      b.style.background = `linear-gradient(180deg, ${c.color}, color-mix(in srgb, ${c.color} 76%, black))`;
      b.addEventListener('click', stroopTap);
      els.stroopOptions.appendChild(b);
    });
    game = { started: false, hits: 0, misses: 0, targets: getLevel().stroop, correct: '', intervals: [], lastTap: 0 };
    nextStroop();
  }

  function nextStroop() {
    const word = colorWords[randInt(0, colorWords.length - 1)];
    let ink = colorWords[randInt(0, colorWords.length - 1)];
    if (Math.random() > .25) while (ink.key === word.key) ink = colorWords[randInt(0, colorWords.length - 1)];
    game.correct = ink.key;
    els.stroopWord.textContent = word.ru;
    els.stroopWord.style.color = ink.color;
  }

  function stroopTap(e) {
    if (!game || state.mode !== 'stroop') return;
    const pick = e.currentTarget.dataset.key;
    const now = performance.now();
    if (!game.started) {
      game.started = true;
      game.lastTap = now;
      startTimer();
    }
    if (pick !== game.correct) {
      game.misses++;
      beep('bad'); vibrate(28);
      updateStats({ accuracy: (game.hits / Math.max(1, game.hits + game.misses)) * 100, avg: avg(game.intervals) });
      nextStroop();
      return;
    }
    game.intervals.push(now - game.lastTap);
    game.lastTap = now;
    game.hits++;
    beep('tap'); vibrate(8);
    updateHud(`${game.hits}/${game.targets}`);
    updateStats({ accuracy: (game.hits / Math.max(1, game.hits + game.misses)) * 100, avg: avg(game.intervals) });
    if (game.hits >= game.targets) {
      const total = (performance.now() - timerStart) / 1000;
      els.mainTime.textContent = fmt(total);
      recordResult(total, { misses: game.misses, avg: avg(game.intervals) });
      initStroop();
      return;
    }
    nextStroop();
  }

  function buildThemes() {
    els.themeGrid.innerHTML = '';
    themes.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'theme-choice';
      btn.dataset.theme = t.id;
      btn.type = 'button';
      btn.innerHTML = `<span class="swatch" style="background:linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})"></span><span>${t.name}</span>`;
      btn.addEventListener('click', () => setTheme(t.id));
      els.themeGrid.appendChild(btn);
    });
  }

  function openDrawer(drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
  function closeDrawer(drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }

  function bindEvents() {
    els.modeTabs.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    els.levelButtons.forEach(btn => btn.addEventListener('click', () => setLevel(btn.dataset.level)));
    $('#settingsBtn').addEventListener('click', () => openDrawer(els.settingsDrawer));
    $('#closeSettings').addEventListener('click', () => closeDrawer(els.settingsDrawer));
    $('#helpBtn').addEventListener('click', () => openDrawer(els.helpDrawer));
    $('#closeHelp').addEventListener('click', () => closeDrawer(els.helpDrawer));
    els.settingsDrawer.addEventListener('click', e => { if (e.target === els.settingsDrawer) closeDrawer(els.settingsDrawer); });
    els.helpDrawer.addEventListener('click', e => { if (e.target === els.helpDrawer) closeDrawer(els.helpDrawer); });
    els.raceButton.addEventListener('click', raceTap);
    els.aimTarget.addEventListener('click', aimTap);
    els.aimTarget.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') aimTap(e); });
    els.aimZone.addEventListener('click', aimMiss);
    els.sequenceStart.addEventListener('click', startSequenceRound);
    $('#randomModeBtn').addEventListener('click', () => {
      const modes = Object.keys(modeInfo);
      setMode(modes[randInt(0, modes.length - 1)]);
      showToast('Случайный режим выбран');
    });
    $('#dailyBtn').addEventListener('click', dailyChallenge);
    $('#resetBtn').addEventListener('click', () => {
      if (confirm('Сбросить все рекорды ReflexLab?')) {
        state.bests = {}; state.runs = {}; state.globalRuns = 0; saveState(); updateHud(defaultProgress());
        showToast('Рекорды сброшены');
      }
    });
    els.soundToggle.addEventListener('change', () => { state.sound = els.soundToggle.checked; saveState(); });
    els.hapticToggle.addEventListener('change', () => { state.haptic = els.hapticToggle.checked; saveState(); });
    els.motionToggle.addEventListener('change', () => {
      state.reduceMotion = els.motionToggle.checked;
      document.body.classList.toggle('reduce-motion', state.reduceMotion);
      saveState();
    });
    els.installBtn.addEventListener('click', installApp);

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredInstallPrompt = e;
      els.installBtn.textContent = '＋ Установить';
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.mode === 'race') clearRaceTimeout();
    });
  }

  function dailyChallenge() {
    const day = Math.floor(Date.now() / 86400000);
    const modes = Object.keys(modeInfo);
    const levelsKeys = Object.keys(levels);
    setMode(modes[day % modes.length]);
    setLevel(levelsKeys[(day + 1) % levelsKeys.length]);
    showToast(`Daily: ${modeInfo[state.mode].title} / ${levels[state.level].label}`);
  }

  async function installApp() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      return;
    }
    showToast('iPhone: Safari → Поделиться → На экран Домой');
    openDrawer(els.helpDrawer);
  }

  function boot() {
    buildThemes();
    bindEvents();
    els.soundToggle.checked = !!state.sound;
    els.hapticToggle.checked = !!state.haptic;
    els.motionToggle.checked = !!state.reduceMotion;
    document.body.classList.toggle('reduce-motion', state.reduceMotion);
    setTheme(state.theme);
    els.levelButtons.forEach(b => b.classList.toggle('is-active', b.dataset.level === state.level));
    els.modeTabs.forEach(b => b.classList.toggle('is-active', b.dataset.mode === state.mode));
    syncLayoutState();
    resetMode();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  boot();
})();
