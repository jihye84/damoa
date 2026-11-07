// 점판(지오보드): 점을 차례로 눌러 선을 잇고, 처음 점을 누르면 도형이 닫혀요
// content: { cols: 7, rows: 5 }
// answer:  { polys: [{ pts: [[x,y]…], closed }] }
// answer_key: { sides: 3|4|…, kind: 'any'|'rect'|'square'|'right', area }
import { h } from '../common.js?v=202611072130';
import { s, svgRoot, toSvg, makeState, wrap, num, clamp, eul } from './base.js?v=202611072130';

const COLORS = ['#2563EB', '#E11D48', '#059669', '#D97706', '#7C3AED'];
const SIDES = { 3: '삼각형', 4: '사각형', 5: '오각형', 6: '육각형' };
const KIND = { rect: '직사각형', square: '정사각형', right: '직각삼각형' };

function simplify(pts) {
  // 한 줄 위에 있는 꼭짓점은 빼요 (변이 하나로 이어지게)
  let p = pts.slice();
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) === 0) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}
const area = (p) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
const dot = (o, a, b) => (a[0] - o[0]) * (b[0] - o[0]) + (a[1] - o[1]) * (b[1] - o[1]);
function rightAt(p, i) { const n = p.length; return dot(p[i], p[(i - 1 + n) % n], p[(i + 1) % n]) === 0; }
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function matches(pts, k) {
  const p = simplify(pts);
  if (k.sides && p.length !== Number(k.sides)) return false;
  if (k.kind === 'rect' && !(p.length === 4 && p.every((_, i) => rightAt(p, i)))) return false;
  if (k.kind === 'square' && !(p.length === 4 && p.every((_, i) => rightAt(p, i)) && d2(p[0], p[1]) === d2(p[1], p[2]))) return false;
  if (k.kind === 'right' && !(p.length === 3 && p.some((_, i) => rightAt(p, i)))) return false;
  if (k.area != null && k.area !== '' && area(p) !== Number(k.area)) return false;
  return true;
}

export const geoboard = {
  name: '점판',
  desc: '점을 이어 도형 그리기',
  help: () => '점을 차례로 누르고, 처음 점을 다시 누르면 도형이 닫혀요',
  mode: '점 잇는 중',
  defaults: { cols: 7, rows: 5 },
  fields: [
    { k: 'cols', label: '가로 점 수', type: 'number' },
    { k: 'rows', label: '세로 점 수', type: 'number' },
  ],
  keyFields: [
    { k: 'sides', label: '꼭짓점 수 (채점)', type: 'select', options: [['', '상관없음'], [3, '3 (삼각형)'], [4, '4 (사각형)'], [5, '5 (오각형)'], [6, '6 (육각형)']] },
    { k: 'kind', label: '특별한 모양', type: 'select', options: [['any', '상관없음'], ['right', '직각삼각형'], ['rect', '직사각형'], ['square', '정사각형']] },
    { k: 'area', label: '넓이 (작은 정사각형 몇 개, 비우면 상관없음)', type: 'number' },
  ],
  validate(c) {
    const a = num(c.cols, 0), b = num(c.rows, 0);
    if (a < 3 || a > 12 || b < 3 || b > 9) return '점은 가로 3~12, 세로 3~9개로 해 주세요';
    return null;
  },
  defaultQuestion(c, k) {
    if (!k) return '점을 이어\n여러 가지 도형을 그려 보세요.';
    const name = k.kind && k.kind !== 'any' ? KIND[k.kind] : SIDES[k.sides] || '도형';
    return `점을 이어 ${eul(name)}\n그려 보세요.` + (k.area ? ` (넓이 ${k.area})` : '');
  },
  grade(ans, k) {
    if (!ans || !k || (!k.sides && (!k.kind || k.kind === 'any') && (k.area == null || k.area === ''))) return null;
    const closed = (ans.polys || []).filter((p) => p.closed);
    if (!closed.length) return (ans.polys || []).length ? { ok: false, short: '도형을 닫지 않았어요' } : null;
    const ok = closed.some((p) => matches(p.pts, k));
    return { ok, short: ok ? '맞았어요' : '조건과 달라요' };
  },
  render(sheet, c, opt) {
    const C = clamp(Math.round(num(c.cols, 7)), 3, 12), R = clamp(Math.round(num(c.rows, 5)), 3, 9);
    const box = wrap(sheet, 'wg-geo');
    const a = opt.answer || {};
    const S = makeState({ polys: JSON.parse(JSON.stringify(a.polys || [])) }, opt, draw);
    const G = 100;
    const svg = svgRoot(`-50 -50 ${(C - 1) * G + 100} ${(R - 1) * G + 100}`, 'geo');
    svg.appendChild(s('rect', { x: -40, y: -40, width: (C - 1) * G + 80, height: (R - 1) * G + 80, rx: 24, class: 'geo-board' }));
    const shapes = s('g');
    svg.appendChild(shapes);
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) svg.appendChild(s('circle', { cx: x * G, cy: y * G, r: 9, class: 'geo-dot' }));
    const marks = s('g');
    svg.appendChild(marks);
    box.appendChild(svg);
    if (opt.interactive) {
      box.appendChild(h('div', { class: 'wg-tools' },
        h('button', { type: 'button', class: 'tf-pick clear', onclick: () => S.set((st) => { st.polys = []; }) }, '모두 지우기')));
      svg.addEventListener('click', (e) => {
        const p = toSvg(svg, e);
        const x = Math.round(p.x / G), y = Math.round(p.y / G);
        if (x < 0 || y < 0 || x >= C || y >= R || Math.hypot(p.x - x * G, p.y - y * G) > G * 0.45) return;
        S.set((st) => {
          let cur = st.polys[st.polys.length - 1];
          if (!cur || cur.closed) { st.polys.push({ pts: [[x, y]], closed: false }); return; }
          const [fx, fy] = cur.pts[0];
          if (fx === x && fy === y && cur.pts.length >= 3) { cur.closed = true; return; }
          if (cur.pts.some(([px, py]) => px === x && py === y)) return;
          cur.pts.push([x, y]);
        });
      });
    }
    function draw(st) {
      shapes.innerHTML = ''; marks.innerHTML = '';
      st.polys.forEach((pl, i) => {
        const col = COLORS[i % COLORS.length];
        const pts = pl.pts.map(([x, y]) => `${x * G},${y * G}`).join(' ');
        shapes.appendChild(s(pl.closed ? 'polygon' : 'polyline', { points: pts, class: 'geo-shape' + (pl.closed ? ' closed' : ''), stroke: col, fill: pl.closed ? col : 'none' }));
        if (!pl.closed) {
          pl.pts.forEach(([x, y], j) => marks.appendChild(s('circle', { cx: x * G, cy: y * G, r: j === 0 ? 17 : 12, class: 'geo-v' + (j === 0 ? ' first' : ''), stroke: col })));
        }
      });
    }
    draw(S.get());
    return { getAnswer: () => ({ polys: S.get().polys, mine: S.mine() }), hasWork: () => S.mine() > 0, undo: () => S.undo() };
  },
};
