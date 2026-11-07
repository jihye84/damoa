// 작곡 칸: 칸을 톡 눌러 음을 놓고, ▶로 들어 봐요.
// 선생님이 앞부분을 만들어 두면(given) 학생은 그 뒤를 이어서 지어요. 앞부분은 학생이 못 바꿔요.
//
// content = {
//   kind: 'song', question,
//   bars: 4, beats: 4, split: 2,        // 마디 수, 한 마디 박 수, 한 박을 몇 칸으로
//   octaves: 1 | 2,                     // 1옥타브: 도~높은 도 8줄, 2옥타브: 15줄
//   drums: true,                        // 아래 타악기 두 줄 (큰북·작은북)
//   melody: true,                       // false면 리듬만
//   tempo: 100, instrument: 'marimba' | 'piano' | 'synth',
//   givenBars: 2,                       // 선생님이 만든 앞부분 마디 수 (0이면 빈 칸)
//   given: { notes: [[col,row]…], drums: [[col,row]…] }
// }
// answer = { notes: [[col,row]…], drums: [[col,row]…], tempo }   (앞부분 포함 전체 곡)

import { h } from './common.js?v=202611072148';

const STEP_NAMES = ['도', '레', '미', '파', '솔', '라', '시'];
// 붐웨커 색 (도 빨강 · 레 주황 · 미 노랑 · 파 연두 · 솔 초록 · 라 보라 · 시 분홍)
const STEP_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#7CB342', '#00897B', '#5E35B1', '#D81B60'];
const SEMI = [0, 2, 4, 5, 7, 9, 11];
// 줄 이름 글자색 (노랑은 흰 바탕에서 잘 안 보여서 진하게)
const NAME_COLORS = ['#C62828', '#E65100', '#A07800', '#558B2F', '#00796B', '#5E35B1', '#C2185B'];
const DRUMS = [{ name: '큰북', color: '#37474F' }, { name: '작은북', color: '#8D6E63' }];

export function songShape(c) {
  const bars = clamp(c.bars || 4, 1, 16), beats = clamp(c.beats || 4, 2, 6), split = clamp(c.split || 2, 1, 4);
  const rows = c.melody === false ? 0 : (c.octaves === 2 ? 15 : 8);
  return { bars, beats, split, cols: bars * beats * split, rows, drumRows: c.drums === false ? 0 : 2,
    givenCols: clamp(c.givenBars || 0, 0, bars) * beats * split };
}
function clamp(v, a, b) { v = Number(v) || 0; return Math.max(a, Math.min(b, v)); }
const key = (c, r) => c + ':' + r;

export function noteName(row) {
  const o = Math.floor(row / 7);
  return (o ? '높은 ' : '') + STEP_NAMES[row % 7];
}

// ---------------------------------------------------------------- 소리
let ctx = null;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function freqOf(row) {
  const o = Math.floor(row / 7);
  return 261.63 * Math.pow(2, (SEMI[row % 7] + 12 * o) / 12);   // 도 = C4
}
function playNote(row, t, instrument, dur) {
  const a = audio();
  const f = freqOf(row);
  const out = a.createGain();
  out.connect(a.destination);
  const parts = instrument === 'synth' ? [[1, 'square', 0.12]]
    : instrument === 'piano' ? [[1, 'triangle', 0.5], [2, 'sine', 0.12], [3, 'sine', 0.05]]
      : [[1, 'sine', 0.55], [4, 'sine', 0.12], [10, 'sine', 0.03]];   // 마림바
  const len = instrument === 'piano' ? Math.max(0.6, dur * 2) : instrument === 'synth' ? dur * 0.9 : 0.7;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, t + len);
  for (const [mul, type, vol] of parts) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f * mul;
    g.gain.value = vol;
    // 높은 배음은 빨리 사라져요 (나무 두드리는 소리)
    if (mul > 1) { g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); }
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + len + 0.05);
  }
}
function playDrum(row, t) {
  const a = audio();
  if (row === 0) {   // 큰북
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.32);
  } else {           // 작은북
    const n = a.createBufferSource();
    const buf = a.createBuffer(1, a.sampleRate * 0.2, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = a.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(f); f.connect(g); g.connect(a.destination);
    n.start(t); n.stop(t + 0.2);
  }
}

// ---------------------------------------------------------------- 화면
/**
 * @param sheet  .sheet 요소 (이 안에 칸을 붙여요)
 * @param opt    {interactive, answer, onChange, editGiven(선생님이 앞부분 만들기), compact(작은 칸: 재생 버튼 없음)}
 */
export function renderSong(sheet, content, opt = {}) {
  const S = songShape(content);
  const interactive = !!opt.interactive;
  const editGiven = !!opt.editGiven;
  const given = content.given || {};
  const isGiven = (c) => !editGiven && c < S.givenCols;

  // 지금 곡: 앞부분 + 학생이 놓은 음
  const notes = new Set();
  const drums = new Set();
  const src = opt.answer && (opt.answer.notes || opt.answer.drums) ? opt.answer : null;
  for (const [c, r] of (src ? src.notes : given.notes) || []) if (c < S.cols && r < S.rows) notes.add(key(c, r));
  for (const [c, r] of (src ? src.drums : given.drums) || []) if (c < S.cols && r < S.drumRows) drums.add(key(c, r));
  // 앞부분은 늘 선생님 것 그대로
  if (!editGiven && S.givenCols) {
    for (const k of [...notes]) if (+k.split(':')[0] < S.givenCols) notes.delete(k);
    for (const k of [...drums]) if (+k.split(':')[0] < S.givenCols) drums.delete(k);
    for (const [c, r] of given.notes || []) if (c < S.givenCols && r < S.rows) notes.add(key(c, r));
    for (const [c, r] of given.drums || []) if (c < S.givenCols && r < S.drumRows) drums.add(key(c, r));
  }
  let tempo = clamp((src && src.tempo) || content.tempo || 100, 50, 200);
  const history = [];

  const box = h('div', { class: 'song' + (opt.compact ? ' compact' : '') });
  box.style.setProperty('--cols', S.cols);
  box.style.setProperty('--rows', S.rows);
  box.style.setProperty('--drows', S.drumRows);
  box.style.setProperty('--per-bar', S.beats * S.split);

  // 줄 이름 (왼쪽)
  const names = h('div', { class: 'song-names', 'aria-hidden': 'true' });
  for (let r = S.rows - 1; r >= 0; r--) names.appendChild(h('span', { style: { color: NAME_COLORS[r % 7] } }, noteName(r)));
  for (let r = S.drumRows - 1; r >= 0; r--) names.appendChild(h('span', { class: 'dn' }, DRUMS[r].name));

  const grid = h('div', { class: 'song-grid', role: interactive ? 'grid' : 'img', 'aria-label': '작곡 칸' });
  const cells = new Map();
  const mk = (type, c, r) => {
    const el = h('div', { class: 'sc ' + type });
    el.dataset.c = c; el.dataset.r = r; el.dataset.t = type;
    if (c % (S.beats * S.split) === 0) el.classList.add('bar');
    else if (c % S.split === 0) el.classList.add('beat');
    if (c < S.givenCols) el.classList.add('given');
    if (c === S.givenCols && S.givenCols) el.classList.add('start');
    cells.set(type + key(c, r), el);
    return el;
  };
  for (let r = S.rows - 1; r >= 0; r--) {
    for (let c = 0; c < S.cols; c++) {
      const el = mk('n', c, r);
      if (r === 7 && S.rows > 8) el.classList.add('octave');
      grid.appendChild(el);
    }
  }
  for (let r = S.drumRows - 1; r >= 0; r--) {
    for (let c = 0; c < S.cols; c++) {
      const el = mk('d', c, r);
      if (r === S.drumRows - 1) el.classList.add('dtop');
      grid.appendChild(el);
    }
  }
  const head = h('div', { class: 'song-head' });
  box.append(names, grid);
  sheet.appendChild(box);
  if (S.givenCols && !editGiven && interactive) {
    grid.appendChild(h('div', { class: 'song-start-tag', style: { left: `calc(${S.givenCols} / ${S.cols} * 100%)` } }, '여기부터 이어서 지어요'));
  }

  function paint() {
    for (const [k, el] of cells) {
      const type = k[0];
      const [c, r] = k.slice(1).split(':').map(Number);
      const on = type === 'n' ? notes.has(key(c, r)) : drums.has(key(c, r));
      el.classList.toggle('on', on);
      el.style.background = on ? (type === 'n' ? STEP_COLORS[r % 7] : DRUMS[r].color) : '';
    }
  }
  paint();

  // ------------------------------------------------ 누르고 끌어서 음 놓기
  let painting = null;   // {add: bool, type}
  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.classList && el.classList.contains('sc') && grid.contains(el) ? el : null;
  }
  function apply(el) {
    const c = +el.dataset.c, r = +el.dataset.r, t = el.dataset.t;
    if (isGiven(c)) return false;
    if (editGiven && opt.givenCols != null && c >= opt.givenCols()) return false;
    const set = t === 'n' ? notes : drums;
    const k = key(c, r);
    if (painting.add === set.has(k)) return false;
    if (painting.add) set.add(k); else set.delete(k);
    paint();
    if (painting.add) {
      try { if (t === 'n') playNote(r, audio().currentTime, content.instrument, 0.25); else playDrum(r, audio().currentTime); } catch (_) {}
    }
    return true;
  }
  if (interactive) {
    grid.addEventListener('pointerdown', (e) => {
      const el = cellAt(e.clientX, e.clientY);
      if (!el) return;
      e.preventDefault();
      const c = +el.dataset.c;
      if (isGiven(c)) { pulse(el); return; }
      const set = el.dataset.t === 'n' ? notes : drums;
      history.push([new Set(notes), new Set(drums)]);
      if (history.length > 50) history.shift();
      painting = { add: !set.has(key(c, +el.dataset.r)), type: el.dataset.t };
      try { grid.setPointerCapture(e.pointerId); } catch (_) {}
      if (apply(el)) changed();
    });
    grid.addEventListener('pointermove', (e) => {
      if (!painting) return;
      e.preventDefault();
      const el = cellAt(e.clientX, e.clientY);
      if (el && el.dataset.t === painting.type && apply(el)) changed();
    });
    const end = () => { painting = null; };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
  }
  function pulse(el) {
    el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
  }
  function changed() { if (opt.onChange) opt.onChange(); }

  // ------------------------------------------------ 재생
  let timer = null, step = 0, nextT = 0;
  const playBtn = h('button', { type: 'button', class: 'song-play', 'aria-label': '들어 보기' });
  const tempoIn = h('input', { type: 'range', min: '50', max: '200', step: '5', value: String(tempo), 'aria-label': '빠르기' });
  const tempoOut = h('span', { class: 'song-tempo-n' }, String(tempo));
  tempoIn.addEventListener('input', () => { tempo = +tempoIn.value; tempoOut.textContent = tempo; if (interactive) changed(); });
  function paintPlay() {
    playBtn.classList.toggle('on', !!timer);
    playBtn.innerHTML = timer
      ? '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
    playBtn.setAttribute('aria-label', timer ? '멈추기' : '들어 보기');
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    grid.querySelectorAll('.sc.now').forEach((x) => x.classList.remove('now'));
    paintPlay();
  }
  function play() {
    const a = audio();
    step = 0; nextT = a.currentTime + 0.08;
    const tick = () => {
      const dur = 60 / tempo / S.split;
      while (nextT < a.currentTime + 0.12) {
        const c = step;
        for (let r = 0; r < S.rows; r++) if (notes.has(key(c, r))) playNote(r, nextT, content.instrument, dur);
        for (let r = 0; r < S.drumRows; r++) if (drums.has(key(c, r))) playDrum(r, nextT);
        const when = (nextT - a.currentTime) * 1000;
        setTimeout(() => {
          if (!timer) return;
          grid.querySelectorAll('.sc.now').forEach((x) => x.classList.remove('now'));
          grid.querySelectorAll(`.sc[data-c="${c}"]`).forEach((x) => x.classList.add('now'));
        }, Math.max(0, when));
        nextT += dur;
        step++;
        if (step >= S.cols) {
          // 한 번 끝까지 들으면 멈춰요
          setTimeout(stop, Math.max(0, (nextT - a.currentTime) * 1000));
          clearInterval(timer);
          timer = -1;
          return;
        }
      }
    };
    timer = setInterval(tick, 25);
    tick();
    paintPlay();
  }
  playBtn.addEventListener('click', (e) => { e.stopPropagation(); if (timer) stop(); else play(); });
  paintPlay();
  if (!opt.compact) {
    head.append(playBtn, h('label', { class: 'song-tempo' }, h('span', null, '빠르기'), tempoIn, tempoOut));
    if (interactive) {
      head.appendChild(h('button', { type: 'button', class: 'song-clear', onclick: (e) => {
        e.stopPropagation();
        history.push([new Set(notes), new Set(drums)]);
        for (const k of [...notes]) if (!isGiven(+k.split(':')[0])) notes.delete(k);
        for (const k of [...drums]) if (!isGiven(+k.split(':')[0])) drums.delete(k);
        paint(); changed();
      } }, S.givenCols && !editGiven ? '내가 지은 것 지우기' : '모두 지우기'));
    }
    sheet.appendChild(head);
  }

  function mine() {
    let n = 0;
    for (const k of notes) if (+k.split(':')[0] >= S.givenCols) n++;
    for (const k of drums) if (+k.split(':')[0] >= S.givenCols) n++;
    return n;
  }
  const list = (set) => [...set].map((k) => k.split(':').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    // mine: 앞부분 말고 학생이 놓은 음 수 (안 낸 장을 거둘 때 씀)
    getAnswer() { return { notes: list(notes), drums: list(drums), tempo, mine: mine() }; },
    hasWork() { return mine() > 0; },
    undo() {
      const prev = history.pop();
      if (!prev) return;
      notes.clear(); prev[0].forEach((k) => notes.add(k));
      drums.clear(); prev[1].forEach((k) => drums.add(k));
      paint(); changed();
    },
    stop,
    destroy() { stop(); },
  };
}
