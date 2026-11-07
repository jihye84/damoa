// 분수 색칠판: 똑같이 나눈 원·막대·사각형을 톡 눌러 칠해요
// content: { shape: 'circle'|'bar'|'rect', parts: 4, wholes: 1 }
// answer:  { on: [칠한 조각 번호…] }    answer_key: { num }  (칠한 조각 수)
import { s, svgRoot, makeState, wrap, num, clamp } from './base.js?v=202611072349';

export const fraction = {
  name: '분수 색칠판',
  desc: '똑같이 나눈 조각 칠하기',
  help: () => '조각을 톡 눌러 칠하고, 다시 누르면 지워져요',
  mode: '톡 눌러 칠하는 중',
  defaults: { shape: 'circle', parts: 4, wholes: 1 },
  fields: [
    { k: 'shape', label: '모양', type: 'select', options: [['circle', '원 (피자)'], ['bar', '막대 (초콜릿)'], ['rect', '사각형 (두 줄)']] },
    { k: 'parts', label: '한 개를 몇 조각으로', type: 'number' },
    { k: 'wholes', label: '몇 개', type: 'select', options: [[1, '1개'], [2, '2개'], [3, '3개']] },
  ],
  keyFields: [
    { k: 'num', label: '칠할 조각 수 (채점)', type: 'number' },
  ],
  validate(c) {
    const p = num(c.parts, 0);
    if (p < 2 || p > 16) return '조각 수는 2~16으로 써 주세요';
    if (c.shape === 'rect' && p % 2) return '사각형(두 줄)은 짝수 조각이어야 해요';
    return null;
  },
  tokens(c, k) { return [k && k.num != null ? `${k.num}/${num(c.parts, 4)}` : null]; },
  defaultQuestion(c, k) {
    const p = num(c.parts, 4);
    return k && k.num != null ? `${k.num}/${p}만큼\n색칠해 보세요.` : '조각을 칠해\n분수를 나타내 보세요.';
  },
  grade(ans, k) {
    if (!ans || !k || k.num == null || !ans.mine) return null;
    const n = (ans.on || []).length;
    const ok = n === Number(k.num);
    return { ok, short: ok ? '맞았어요' : `${n}조각 칠함` };
  },
  render(sheet, c, opt) {
    const P = clamp(Math.round(num(c.parts, 4)), 2, 16), Wn = clamp(num(c.wholes, 1), 1, 3);
    const box = wrap(sheet, 'wg-frac');
    const a = opt.answer || {};
    const S = makeState({ on: (a.on || []).slice() }, opt, draw);
    const unitW = c.shape === 'circle' ? 240 : c.shape === 'bar' ? 300 : 300;
    const unitH = c.shape === 'circle' ? 240 : c.shape === 'bar' ? 110 : 180;
    const gap = 50;
    const vertical = c.shape !== 'circle' && Wn > 1;   // 막대·사각형 여러 개는 위아래로
    const W = vertical ? unitW : Wn * unitW + (Wn - 1) * gap;
    const H = vertical ? Wn * unitH + (Wn - 1) * 30 : unitH;
    const svg = svgRoot(`-10 -10 ${W + 20} ${H + 20}`, 'fr');
    const pieces = [];
    for (let w = 0; w < Wn; w++) {
      const ox = vertical ? 0 : w * (unitW + gap), oy = vertical ? w * (unitH + 30) : 0;
      for (let i = 0; i < P; i++) {
        let el;
        if (c.shape === 'circle') {
          const cx = ox + 120, cy = oy + 120, r = 115;
          if (P === 1) el = s('circle', { cx, cy, r });
          const a0 = (i / P) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / P) * 2 * Math.PI - Math.PI / 2;
          el = s('path', { d: `M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}Z` });
        } else if (c.shape === 'bar') {
          const pw = unitW / P;
          el = s('rect', { x: ox + i * pw, y: oy, width: pw, height: unitH });
        } else {
          const cols = P / 2, pw = unitW / cols, ph = unitH / 2;
          el = s('rect', { x: ox + (i % cols) * pw, y: oy + Math.floor(i / cols) * ph, width: pw, height: ph });
        }
        el.setAttribute('class', 'fr-piece');
        const id = w * P + i;
        if (opt.interactive) el.addEventListener('click', () => S.set((st) => {
          const k = st.on.indexOf(id);
          if (k >= 0) st.on.splice(k, 1); else st.on.push(id);
        }));
        pieces.push([id, el]);
        svg.appendChild(el);
      }
    }
    box.appendChild(svg);
    function draw(st) { for (const [id, el] of pieces) el.classList.toggle('on', st.on.includes(id)); }
    draw(S.get());
    return { getAnswer: () => ({ on: S.get().on.slice().sort((x, y) => x - y), mine: S.mine() }), hasWork: () => S.mine() > 0, undo: () => S.undo() };
  },
};
