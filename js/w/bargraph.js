// 막대그래프 만들기: 표를 보고, 칸을 눌러 막대를 쌓아요
// content: { title, cats: '사과, 배, 귤', values: '3, 5, 2' (표에 보여 줄 수, 비우면 자유 조사), max: 8, unit: '명', scale: 1, showTable: true }
// answer:  { h: [3, 5, 2] }  (막대마다 수)
import { h } from '../common.js?v=202611101540';
import { s, svgRoot, toSvg, makeState, wrap, num, clamp } from './base.js?v=202611101540';

const list = (t) => String(t || '').split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6', '#84CC16'];
function shape(c) {
  const cats = list(c.cats).slice(0, 8);
  const vals = list(c.values).map(Number);
  const scale = clamp(num(c.scale, 1), 1, 10);
  const max = clamp(Math.round(num(c.max, 8)), 2, 20);
  return { cats, vals: vals.length === cats.length && vals.every(Number.isFinite) ? vals : null, scale, max };
}

export const bargraph = {
  name: '막대그래프',
  desc: '표를 보고 막대 쌓기',
  help: () => '칸을 눌러 막대 높이를 정해요. 맨 위 칸을 다시 누르면 한 칸 내려가요',
  mode: '막대 쌓는 중',
  defaults: { title: '좋아하는 과일', cats: '사과, 배, 귤, 포도', values: '3, 5, 2, 4', max: 8, unit: '명', scale: 1, showTable: true },
  fields: [
    { k: 'title', label: '그래프 제목', type: 'text' },
    { k: 'cats', label: '항목 (쉼표로)', type: 'text' },
    { k: 'values', label: '표의 수 (쉼표로, 비우면 자유 조사)', type: 'text' },
    { k: 'unit', label: '단위', type: 'text' },
    { k: 'max', label: '세로 칸 수', type: 'number' },
    { k: 'scale', label: '한 칸의 크기', type: 'select', options: [[1, '1'], [2, '2'], [5, '5'], [10, '10']] },
    { k: 'showTable', label: '표 보여 주기', type: 'check' },
  ],
  validate(c) {
    const x = shape(c);
    if (x.cats.length < 2) return '항목을 두 개 이상 써 주세요';
    if (list(c.values).length && !x.vals) return '표의 수를 항목 수만큼 써 주세요';
    if (x.vals && x.vals.some((v) => v % x.scale || v / x.scale > x.max)) return '표의 수가 칸에 맞지 않아요 (한 칸 크기와 세로 칸 수를 확인해 주세요)';
    return null;
  },
  tokens(c) { return [c.title || null]; },
  defaultQuestion(c) { return shape(c).vals ? '표를 보고\n막대그래프를 그려 보세요.' : '우리 반 친구들에게 물어보고\n막대그래프를 그려 보세요.'; },
  grade(ans, k, c) {
    const x = shape(c);
    if (!x.vals || !ans || !ans.mine) return null;
    const hs = ans.h || [];
    const wrong = x.vals.filter((v, i) => (hs[i] || 0) * x.scale !== v).length;
    return { ok: !wrong, short: wrong ? `막대 ${wrong}개 다름` : '맞았어요' };
  },
  render(sheet, c, opt) {
    const x = shape(c);
    const n = x.cats.length;
    const box = wrap(sheet, 'wg-bar' + (c.showTable === false ? ' no-table' : ''));
    const a = opt.answer || {};
    const S = makeState({ h: Array.from({ length: n }, (_, i) => (a.h && a.h[i]) || 0) }, opt, draw);
    if (c.showTable !== false) {
      const t = h('table', { class: 'bg-table' },
        h('caption', null, c.title || ''),
        h('tbody', null,
          ...x.cats.map((cat, i) => h('tr', null, h('th', null, cat), h('td', null, x.vals ? `${x.vals[i]}${c.unit || ''}` : '')))));
      box.appendChild(t);
    }
    const CW = 110, CH = 52, L = 90, T = 50, B = 60;
    const W = L + n * CW + 20, H = T + x.max * CH + B;
    const svg = svgRoot(`0 0 ${W} ${H}`, 'bg');
    svg.appendChild(s('text', { x: L - 12, y: T - 18, class: 'bg-unit' }, `(${c.unit || ''})`));
    for (let r = 0; r <= x.max; r++) {
      const y = T + (x.max - r) * CH;
      svg.appendChild(s('line', { x1: L, y1: y, x2: L + n * CW, y2: y, class: r ? 'bg-grid' : 'bg-base' }));
      svg.appendChild(s('text', { x: L - 14, y: y + 7, class: 'bg-ylb' }, r * x.scale));
    }
    for (let i = 0; i <= n; i++) svg.appendChild(s('line', { x1: L + i * CW, y1: T, x2: L + i * CW, y2: T + x.max * CH, class: 'bg-grid' }));
    svg.appendChild(s('line', { x1: L, y1: T - 8, x2: L, y2: T + x.max * CH, class: 'bg-base' }));
    x.cats.forEach((cat, i) => svg.appendChild(s('text', { x: L + i * CW + CW / 2, y: T + x.max * CH + 38, class: 'bg-xlb' }, cat)));
    const bars = s('g');
    svg.appendChild(bars);
    box.appendChild(svg);
    if (opt.interactive) {
      svg.addEventListener('click', (e) => {
        const p = toSvg(svg, e);
        const i = Math.floor((p.x - L) / CW);
        if (i < 0 || i >= n) return;
        const r = clamp(Math.ceil((T + x.max * CH - p.y) / CH), 0, x.max);
        S.set((st) => { st.h[i] = st.h[i] === r ? r - 1 : r; });
      });
    }
    function draw(st) {
      bars.innerHTML = '';
      const review = !opt.interactive && x.vals && st.h.some((v) => v);
      st.h.forEach((v, i) => {
        if (!v) return;
        const bad = review && v * x.scale !== x.vals[i];
        bars.appendChild(s('rect', { x: L + i * CW + 18, y: T + (x.max - v) * CH, width: CW - 36, height: v * CH, rx: 6,
          class: 'bg-barr' + (bad ? ' bad' : ''), fill: COLORS[i % COLORS.length] }));
      });
    }
    draw(S.get());
    return { getAnswer: () => ({ h: S.get().h, mine: S.mine() }), hasWork: () => S.mine() > 0, undo: () => S.undo() };
  },
};
