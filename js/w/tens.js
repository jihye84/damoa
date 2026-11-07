// 십 배열판(frame) · 수 모형(blocks)
// content: { mode: 'frame', frames: 1|2 }  /  { mode: 'blocks', places: 2|3 }
// answer:  frame → { cells: ['r','b',null,…] }   blocks → { n: [백, 십, 일] }
// answer_key: frame → { count, red, blue }   blocks → { value, exact }
import { h } from '../common.js?v=202611072130';
import { s, svgRoot, makeState, wrap, num, clamp, eul } from './base.js?v=202611072130';

const RED = '#E53935', BLUE = '#1E78E8';
const PLACE = [['백', 100], ['십', 10], ['일', 1]];

export const tens = {
  name: '십 배열판 · 수 모형',
  desc: '동그라미·수 모형 놓기',
  help: (c) => c.mode === 'blocks' ? '+ 를 눌러 수 모형을 놓고, 모형을 누르면 빠져요' : '칸을 톡 눌러 동그라미를 놓아요',
  mode: '톡 눌러 놓는 중',
  defaults: { mode: 'frame', frames: 1, places: 2 },
  fields: [
    { k: 'mode', label: '도구', type: 'select', options: [['frame', '십 배열판 (동그라미 놓기)'], ['blocks', '수 모형 (십 모형 · 일 모형)']] },
    { k: 'frames', label: '배열판 수', type: 'select', options: [[1, '1개 (10칸)'], [2, '2개 (20칸)']], show: (c) => c.mode !== 'blocks' },
    { k: 'places', label: '자리', type: 'select', options: [[2, '십 · 일'], [3, '백 · 십 · 일']], show: (c) => c.mode === 'blocks' },
  ],
  keyFields: [
    { k: 'count', label: '놓을 동그라미 수 (채점)', type: 'number', show: (c) => c.mode !== 'blocks' },
    { k: 'red', label: '그중 빨강 (가르기, 비우면 상관없음)', type: 'number', show: (c) => c.mode !== 'blocks' },
    { k: 'value', label: '나타낼 수 (채점)', type: 'number', show: (c) => c.mode === 'blocks' },
    { k: 'exact', label: '자리마다 9개까지만 (예: 34 = 십 3, 일 4)', type: 'check', show: (c) => c.mode === 'blocks' },
  ],
  defaultQuestion(c, k) {
    if (c.mode === 'blocks') return k && k.value != null ? `${eul(k.value)}\n수 모형으로 나타내 보세요.` : '수 모형으로\n수를 나타내 보세요.';
    if (k && k.count != null && k.red != null) return `${eul(k.count)} 빨강 ${k.red}개와\n파랑으로 갈라 보세요.`;
    return k && k.count != null ? `${k.count}만큼\n동그라미를 놓아 보세요.` : '동그라미를 놓아\n수를 나타내 보세요.';
  },
  grade(ans, k, c) {
    if (!ans || !k || !ans.mine) return null;
    if (c.mode === 'blocks') {
      if (k.value == null) return null;
      const n = ans.n || [0, 0, 0];
      const v = n[0] * 100 + n[1] * 10 + n[2];
      const ok = v === k.value && (!k.exact || n.every((x) => x <= 9));
      return { ok, short: ok ? '맞았어요' : `${v}을 놓음` };
    }
    if (k.count == null) return null;
    const cells = ans.cells || [];
    const r = cells.filter((x) => x === 'r').length, b = cells.filter((x) => x === 'b').length;
    const ok = r + b === k.count && (k.red == null || r === k.red);
    return { ok, short: ok ? '맞았어요' : (k.red != null ? `빨강 ${r} · 파랑 ${b}` : `${r + b}개`) };
  },
  render(sheet, c, opt) {
    return c.mode === 'blocks' ? blocks(sheet, c, opt) : frame(sheet, c, opt);
  },
};

function frame(sheet, c, opt) {
  const n = clamp(num(c.frames, 1), 1, 2) * 10;
  const box = wrap(sheet, 'wg-frame');
  const a = opt.answer || {};
  const init = Array.from({ length: n }, (_, i) => (a.cells && a.cells[i]) || null);
  let color = 'r';
  const S = makeState({ cells: init }, opt, draw);
  const W = n === 10 ? 560 : 1160;
  const svg = svgRoot(`-10 -10 ${W + 20} 244`, 'tf');
  const slots = [];
  for (let f = 0; f < n / 10; f++) {
    const ox = f * 600;
    svg.appendChild(s('rect', { x: ox, y: 0, width: 560, height: 224, rx: 10, class: 'tf-frame' }));
    for (let i = 0; i < 10; i++) {
      const x = ox + (i % 5) * 112, y = Math.floor(i / 5) * 112;
      const cell = s('rect', { x, y, width: 112, height: 112, class: 'tf-cell' });
      const dot = s('circle', { cx: x + 56, cy: y + 56, r: 40, class: 'tf-dot' });
      const g = s('g', { class: 'tf-slot' }, cell, dot);
      const idx = f * 10 + i;
      if (opt.interactive) g.addEventListener('click', () => S.set((st) => {
        const cur = st.cells[idx];
        st.cells[idx] = cur === color ? null : color;
      }));
      slots.push(dot);
      svg.appendChild(g);
    }
  }
  box.appendChild(svg);
  if (opt.interactive) {
    const pick = (col, label, fill) => h('button', { type: 'button', class: 'tf-pick' + (col === color ? ' on' : ''), 'data-c': col,
      onclick: (e) => { color = col; box.querySelectorAll('.tf-pick').forEach((x) => x.classList.toggle('on', x.dataset.c === col)); } },
    h('i', { style: { background: fill } }), label);
    box.appendChild(h('div', { class: 'wg-tools' }, pick('r', '빨강', RED), pick('b', '파랑', BLUE),
      h('button', { type: 'button', class: 'tf-pick clear', onclick: () => S.set((st) => { st.cells = st.cells.map(() => null); }) }, '모두 빼기')));
  }
  function draw(st) {
    slots.forEach((d, i) => {
      const v = st.cells[i];
      d.style.fill = v === 'r' ? RED : v === 'b' ? BLUE : 'transparent';
      d.classList.toggle('on', !!v);
    });
  }
  draw(S.get());
  return { getAnswer: () => ({ cells: S.get().cells, mine: S.mine() }), hasWork: () => S.mine() > 0, undo: () => S.undo() };
}

function blocks(sheet, c, opt) {
  const places = clamp(num(c.places, 2), 2, 3);
  const cols = PLACE.slice(3 - places);
  const box = wrap(sheet, 'wg-blocks');
  const a = opt.answer || {};
  const S = makeState({ n: (a.n || [0, 0, 0]).slice() }, opt, draw);
  const mat = h('div', { class: 'bk-mat', style: { gridTemplateColumns: `repeat(${places}, minmax(0, 1fr))` } });
  const areas = [];
  cols.forEach(([label, v], ci) => {
    const pi = 3 - places + ci;   // n 배열의 자리 (0 백, 1 십, 2 일)
    const area = h('div', { class: 'bk-area' });
    const col = h('div', { class: 'bk-col' },
      h('div', { class: 'bk-head' }, label + ' 모형'),
      area,
      opt.interactive ? h('button', { type: 'button', class: 'bk-add', onclick: () => S.set((st) => { if (st.n[pi] < 20) st.n[pi]++; }) }, '+ ' + label + ' 모형') : null);
    areas.push([area, pi, v]);
    mat.appendChild(col);
  });
  box.appendChild(mat);
  function piece(v) {
    if (v === 100) {
      const g = svgRoot('0 0 100 100', 'bk-h');
      g.appendChild(s('rect', { x: 1, y: 1, width: 98, height: 98, class: 'bk-fill' }));
      for (let i = 1; i < 10; i++) { g.appendChild(s('line', { x1: i * 10, y1: 1, x2: i * 10, y2: 99, class: 'bk-ln' })); g.appendChild(s('line', { x1: 1, y1: i * 10, x2: 99, y2: i * 10, class: 'bk-ln' })); }
      return g;
    }
    if (v === 10) {
      const g = svgRoot('0 0 10 100', 'bk-t');
      g.appendChild(s('rect', { x: 0.5, y: 0.5, width: 9, height: 99, class: 'bk-fill' }));
      for (let i = 1; i < 10; i++) g.appendChild(s('line', { x1: 0.5, y1: i * 10, x2: 9.5, y2: i * 10, class: 'bk-ln' }));
      return g;
    }
    const g = svgRoot('0 0 10 10', 'bk-o');
    g.appendChild(s('rect', { x: 0.5, y: 0.5, width: 9, height: 9, class: 'bk-fill' }));
    return g;
  }
  function draw(st) {
    for (const [area, pi, v] of areas) {
      area.innerHTML = '';
      for (let i = 0; i < st.n[pi]; i++) {
        const p = piece(v);
        if (opt.interactive) {
          p.addEventListener('click', () => S.set((x) => { x.n[pi] = Math.max(0, x.n[pi] - 1); }));
        }
        area.appendChild(p);
      }
    }
  }
  draw(S.get());
  return { getAnswer: () => ({ n: S.get().n, mine: S.mine() }), hasWork: () => S.mine() > 0, undo: () => S.undo() };
}
