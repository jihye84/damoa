// 모양 그림판: 동그라미·세모·네모를 놓고, 옮기고, 크기·방향을 바꾸고, 색을 칠해서 그림을 꾸며요.
//
// content = {
//   kind: 'shapes', question,
//   allow: ['c', 't', 'r'],            // 쓸 수 있는 모양 (동그라미·세모·네모)
//   given: [shape…],                   // 선생님이 미리 놓아 둔 모양 (학생이 옮길 수 있어요)
// }
// shape  = { t: 'c'|'t'|'r', x, y, w, h, rot, fx, fy, fill }   (판 좌표 1600 × 800, x·y는 가운데)
// answer = { shapes: [shape…], mine: 학생이 바꾼 횟수 }
// answer_key = { counts: { c: 2, t: 3 } }   (모양별 개수 채점, 비우면 채점 안 함)

import { h } from './common.js?v=202611080717';

const W = 1600, H = 800;
const SVGNS = 'http://www.w3.org/2000/svg';
export const SHAPE_NAMES = { c: '동그라미', t: '세모', r: '네모' };
export const SHAPE_COLORS = ['#E53935', '#F48FB1', '#FFCC99', '#FB8C00', '#FFC34D', '#FDE047', '#9CCC65', '#2E9E4F',
  '#14857F', '#5BC2F2', '#1E78E8', '#1E3A9E', '#7B3FB8', '#B9A2DF', '#C2185B', '#8B5A2B', '#A3A3A3', '#FFFFFF', '#222222'];
const ICON = {
  c: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>',
  t: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="currentColor"/></svg>',
  r: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" fill="currentColor"/></svg>',
};
const ACTIONS = [
  ['dup', '똑같이 하나 더', '<path d="M12 5v14M5 12h14"/>'],
  ['fx', '옆으로 뒤집기', '<path d="M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4"/>'],
  ['fy', '위아래 뒤집기', '<path d="M12 4v16M8 7l4-4 4 4M8 17l4 4 4-4"/>'],
  ['front', '맨 앞으로', '<path d="M12 19V5M6 11l6-6 6 6"/>'],
  ['back', '맨 뒤로', '<path d="M12 5v14M6 13l6 6 6-6"/>'],
  ['del', '지우기', '<path d="M6 6l12 12M18 6L6 18"/>'],
];

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}
const clone = (s) => s.map((x) => Object.assign({}, x));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function countShapes(shapes) {
  const n = { c: 0, t: 0, r: 0 };
  for (const s of shapes || []) if (n[s.t] !== undefined) n[s.t]++;
  return n;
}

// 개수 채점: 정한 모양마다 개수가 꼭 같으면 맞음
export function gradeShapes(answer, key) {
  if (!key || !key.counts || !answer) return null;
  const want = Object.entries(key.counts).filter(([, v]) => typeof v === 'number' && v >= 0);
  if (!want.length) return null;
  const got = countShapes(answer.shapes);
  if (!(answer.shapes || []).length) return null;
  const parts = want.map(([t, v]) => ({ t, v, n: got[t] }));
  const ok = parts.every((p) => p.n === p.v);
  return { ok, parts, short: ok ? '맞았어요' : parts.filter((p) => p.n !== p.v).map((p) => `${SHAPE_NAMES[p.t]} ${p.n}/${p.v}`).join(' · ') };
}

/**
 * @param sheet .sheet 요소
 * @param opt   {interactive, answer, onChange, compact}
 */
export function renderShapes(sheet, content, opt = {}) {
  const interactive = !!opt.interactive;
  const allow = (content.allow && content.allow.length ? content.allow : ['c', 't', 'r']).filter((t) => SHAPE_NAMES[t]);
  const src = opt.answer && Array.isArray(opt.answer.shapes) ? opt.answer.shapes : (content.given || []);
  let shapes = clone(src);
  let sel = -1;
  let color = '#FB8C00';
  let mine = (opt.answer && opt.answer.mine) || 0;
  const history = [];

  const board = h('div', { class: 'shp-board' });
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', class: 'shp-svg', role: 'img', 'aria-label': '모양 그림' });
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, class: 'shp-bg' }));
  const layer = svgEl('g');
  const over = svgEl('g', { class: 'shp-over' });
  svg.append(layer, over);
  board.appendChild(svg);
  sheet.appendChild(board);

  // ------------------------------------------------ 도구 (오른쪽 · 아래)
  const side = h('div', { class: 'shp-side' });
  const palette = h('div', { class: 'shp-palette', role: 'group', 'aria-label': '색' });
  const actBtns = {};
  if (interactive) {
    for (const t of allow) {
      side.appendChild(h('button', { type: 'button', class: 'shp-add', 'aria-label': SHAPE_NAMES[t] + ' 놓기', onclick: () => add(t) },
        h('span', { class: 'ic', html: ICON[t], style: { color } }), h('span', null, SHAPE_NAMES[t])));
    }
    side.appendChild(h('div', { class: 'shp-sep' }));
    for (const [k, label, path] of ACTIONS) {
      actBtns[k] = h('button', { type: 'button', class: 'shp-act', disabled: true, onclick: () => act(k) },
        h('span', { class: 'ic', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>` }),
        h('span', null, label));
      side.appendChild(actBtns[k]);
    }
    side.appendChild(h('button', { type: 'button', class: 'shp-act clear', onclick: () => { if (!shapes.length) return; save(); shapes = []; sel = -1; draw(); changed(); } }, h('span', null, '모두 지우기')));
    for (const c of SHAPE_COLORS) {
      palette.appendChild(h('button', {
        type: 'button', class: 'shp-sw' + (c === color ? ' on' : ''), style: { background: c }, 'aria-label': '색 ' + c,
        onclick: (e) => { pickColor(c, e.currentTarget); },
      }));
    }
    sheet.append(side, palette);
  }
  sheet.classList.add(interactive ? 'shp-live' : 'shp-view');

  function pickColor(c, btn) {
    color = c;
    palette.querySelectorAll('.shp-sw').forEach((x) => x.classList.toggle('on', x === btn));
    side.querySelectorAll('.shp-add .ic').forEach((x) => { x.style.color = c; });
    if (sel >= 0 && shapes[sel].fill !== c) { save(); shapes[sel].fill = c; draw(); changed(); }
  }

  // ------------------------------------------------ 그리기
  function shapeNode(s) {
    const g = svgEl('g', { transform: `translate(${s.x} ${s.y}) rotate(${s.rot || 0}) scale(${s.fx ? -1 : 1} ${s.fy ? -1 : 1})` });
    const fill = s.fill || '#FB8C00';
    const stroke = fill.toUpperCase() === '#FFFFFF' ? '#C9C9C9' : 'none';
    let el;
    if (s.t === 'c') el = svgEl('ellipse', { cx: 0, cy: 0, rx: s.w / 2, ry: s.h / 2 });
    else if (s.t === 'r') el = svgEl('rect', { x: -s.w / 2, y: -s.h / 2, width: s.w, height: s.h });
    else el = svgEl('polygon', { points: `0 ${-s.h / 2} ${s.w / 2} ${s.h / 2} ${-s.w / 2} ${s.h / 2}` });
    el.setAttribute('fill', fill);
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', '3');
    g.appendChild(el);
    return g;
  }
  function pxScale() {
    const r = svg.getBoundingClientRect();
    return r.width ? Math.max(W / r.width, H / r.height) : 2;
  }
  function draw() {
    layer.innerHTML = '';
    shapes.forEach((s, i) => {
      const g = shapeNode(s);
      g.dataset.i = i;
      g.classList.add('shp');
      layer.appendChild(g);
    });
    over.innerHTML = '';
    if (interactive && sel >= 0 && shapes[sel]) {
      const s = shapes[sel];
      const k = pxScale();
      const hr = 13 * k;
      const g = svgEl('g', { transform: `translate(${s.x} ${s.y}) rotate(${s.rot || 0})` });
      g.appendChild(svgEl('rect', { x: -s.w / 2 - 6 * k, y: -s.h / 2 - 6 * k, width: s.w + 12 * k, height: s.h + 12 * k, class: 'shp-box', 'stroke-width': 2 * k, 'stroke-dasharray': `${7 * k} ${5 * k}` }));
      g.appendChild(svgEl('line', { x1: 0, y1: -s.h / 2 - 6 * k, x2: 0, y2: -s.h / 2 - 44 * k, class: 'shp-box', 'stroke-width': 2 * k }));
      const rot = svgEl('circle', { cx: 0, cy: -s.h / 2 - 44 * k, r: hr, class: 'shp-h rot' });
      rot.dataset.h = 'rot';
      const size = svgEl('rect', { x: s.w / 2 + 6 * k - hr, y: s.h / 2 + 6 * k - hr, width: hr * 2, height: hr * 2, rx: 4 * k, class: 'shp-h size' });
      size.dataset.h = 'size';
      g.append(rot, size);
      // 손가락으로 잡기 쉽게 투명하게 크게 한 겹 더
      for (const [hx, hy, name] of [[0, -s.h / 2 - 44 * k, 'rot'], [s.w / 2 + 6 * k, s.h / 2 + 6 * k, 'size']]) {
        const hit = svgEl('circle', { cx: hx, cy: hy, r: hr * 2.2, class: 'shp-hit' });
        hit.dataset.h = name;
        g.appendChild(hit);
      }
      over.appendChild(g);
    }
    for (const b of Object.values(actBtns)) b.disabled = sel < 0;
  }
  draw();
  // 크기가 정해진 다음 손잡이 크기를 다시 맞춰요
  const ro = new ResizeObserver(() => { if (sel >= 0) draw(); });
  ro.observe(board);

  // ------------------------------------------------ 바꾸기
  function save() { history.push({ shapes: clone(shapes), sel }); if (history.length > 60) history.shift(); }
  function changed() { mine++; if (opt.onChange) opt.onChange(); }
  function add(t) {
    save();
    const n = shapes.length;
    const size = t === 'r' ? [220, 220] : t === 't' ? [240, 210] : [220, 220];
    shapes.push({ t, x: W / 2 + ((n * 47) % 300) - 150, y: H / 2 + ((n * 31) % 200) - 100, w: size[0], h: size[1], rot: 0, fx: false, fy: false, fill: color });
    sel = shapes.length - 1;
    draw(); changed();
  }
  function act(k) {
    if (sel < 0) return;
    save();
    const s = shapes[sel];
    if (k === 'dup') { shapes.push(Object.assign({}, s, { x: clamp(s.x + 50, 0, W), y: clamp(s.y + 50, 0, H) })); sel = shapes.length - 1; }
    if (k === 'fx') s.fx = !s.fx;
    if (k === 'fy') s.fy = !s.fy;
    if (k === 'front') { shapes.splice(sel, 1); shapes.push(s); sel = shapes.length - 1; }
    if (k === 'back') { shapes.splice(sel, 1); shapes.unshift(s); sel = 0; }
    if (k === 'del') { shapes.splice(sel, 1); sel = -1; }
    draw(); changed();
  }

  // ------------------------------------------------ 누르고 끌기
  function toSvg(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }
  let drag = null;
  if (interactive) {
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = toSvg(e);
      const handle = e.target.dataset && e.target.dataset.h;
      if (handle && sel >= 0) {
        save();
        drag = { mode: handle, moved: false };
      } else {
        const g = e.target.closest && e.target.closest('.shp');
        if (!g) { if (sel >= 0) { sel = -1; draw(); } return; }
        sel = +g.dataset.i;
        save();
        drag = { mode: 'move', dx: p.x - shapes[sel].x, dy: p.y - shapes[sel].y, moved: false };
        draw();
      }
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || sel < 0) return;
      e.preventDefault();
      const p = toSvg(e);
      const s = shapes[sel];
      if (drag.mode === 'move') {
        s.x = clamp(p.x - drag.dx, 0, W);
        s.y = clamp(p.y - drag.dy, 0, H);
      } else if (drag.mode === 'size') {
        // 돌아간 모양이어도 모양 방향으로 크기를 바꿔요
        const a = -(s.rot || 0) * Math.PI / 180;
        const dx = p.x - s.x, dy = p.y - s.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        s.w = clamp(Math.abs(lx) * 2 - 12, 30, W * 1.5);
        s.h = clamp(Math.abs(ly) * 2 - 12, 30, H * 1.5);
      } else if (drag.mode === 'rot') {
        let deg = Math.atan2(p.y - s.y, p.x - s.x) * 180 / Math.PI + 90;
        deg = Math.round(deg / 15) * 15;   // 15도씩 딱딱 맞춰요
        s.rot = ((deg % 360) + 360) % 360;
      }
      drag.moved = true;
      draw();
    });
    const end = () => {
      if (!drag) return;
      if (drag.moved) changed(); else history.pop();
      drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  return {
    getAnswer() { return { shapes: clone(shapes).map((s) => Object.assign(s, { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) })), mine }; },
    hasWork() { return mine > 0; },
    undo() {
      const prev = history.pop();
      if (!prev) return;
      shapes = prev.shapes; sel = -1;
      draw(); if (opt.onChange) opt.onChange();
    },
    stop() {},
    destroy() { ro.disconnect(); },
  };
}
