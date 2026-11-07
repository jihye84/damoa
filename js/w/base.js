// 수학 도구 템플릿 공용 부품
import { h } from '../common.js?v=202611072336';

export const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
export function svgRoot(vb, cls) {
  return s('svg', { viewBox: vb, preserveAspectRatio: 'xMidYMid meet', class: 'wg-svg ' + (cls || '') });
}
// 화면 좌표 → SVG 좌표
export function toSvg(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}

/**
 * 상태 + 되돌리기 + "학생이 몇 번 바꿨나"(mine)
 * draw(state) 로 다시 그려요.
 */
export function makeState(initial, opt, draw) {
  let st = JSON.parse(JSON.stringify(initial));
  const hist = [];
  let mine = (opt.answer && opt.answer.mine) || 0;
  const api = {
    get: () => st,
    // 바꾸기: 되돌리기에 남기고, 다시 그리고, 알려요
    set(fn, { record = true } = {}) {
      if (record) { hist.push(JSON.stringify(st)); if (hist.length > 80) hist.shift(); }
      fn(st);
      mine++;
      draw(st);
      if (opt.onChange) opt.onChange();
    },
    mark() { hist.push(JSON.stringify(st)); if (hist.length > 80) hist.shift(); },
    undo() {
      const p = hist.pop();
      if (!p) return;
      st = JSON.parse(p);
      draw(st);
      if (opt.onChange) opt.onChange();
    },
    mine: () => mine,
  };
  return api;
}

export function wrap(sheet, cls) {
  const box = h('div', { class: 'wg ' + cls });
  sheet.appendChild(box);
  return box;
}

export const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// "3/4", "0.7", "2" → 숫자
export function parseNum(t) {
  if (t === null || t === undefined) return NaN;
  const x = String(t).trim();
  if (!x) return NaN;
  const m = x.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const k = x.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);   // 대분수 1 1/2
  if (k) return Number(k[1]) + Number(k[2]) / Number(k[3]);
  return Number(x);
}

// 을/를: 마지막 글자(숫자는 읽는 소리)에 받침이 있으면 "을"
export function eul(word) {
  const t = String(word).trim();
  const ch = t[t.length - 1] || '';
  if (/[0-9]/.test(ch)) return t + ('013678'.includes(ch) ? '을' : '를');
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code >= 0 && code < 11172) return t + (code % 28 ? '을' : '를');
  return t + '을(를)';
}
