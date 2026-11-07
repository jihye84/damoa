// 수직선: 점 찍기(point) · 뛰어 세기(jump)
// content: { min, max, step(큰 눈금 간격), minor(큰 눈금 사이 칸 수), labels: 'all'|'major'|'ends', fmt: 'int'|'frac'|'dec', mode, start }
// answer:  point → { i } (작은 눈금 번호)   jump → { path: [i0, i1, …] }
// answer_key: point → { value }   jump → { end, size }
import { h } from '../common.js?v=202611072130';
import { s, svgRoot, toSvg, makeState, wrap, num, clamp, parseNum, eul } from './base.js?v=202611072130';

function shape(c) {
  const min = num(parseNum(c.min), 0), max = num(parseNum(c.max), 10);
  const step = Math.max(1e-9, num(parseNum(c.step), 1));
  const minor = clamp(Math.round(num(c.minor, 1)), 1, 20);
  const unit = step / minor;
  const N = Math.max(1, Math.round((max - min) / unit));
  return { min, max, step, minor, unit, N, valueOf: (i) => min + i * unit, indexOf: (v) => Math.round((v - min) / unit) };
}
function label(v, c, sh, i) {
  if (c.fmt === 'frac' && sh.minor > 1) {
    const whole = Math.floor(i / sh.minor + 1e-9), part = i - whole * sh.minor;
    const base = sh.min + whole * sh.step;
    if (part === 0) return String(Math.round(base * 1000) / 1000);
    return { n: part, d: sh.minor, w: base ? String(base) : '' };
  }
  if (c.fmt === 'dec') return String(Math.round(v * 1000) / 1000);
  return String(Math.round(v * 1000) / 1000);
}
const closeTo = (a, b) => Math.abs(a - b) < 1e-6;

export const numline = {
  name: '수직선',
  desc: '점 찍기 · 뛰어 세기',
  help: (c) => c.mode === 'jump' ? '눈금을 차례로 눌러 뛰어 세요' : '눈금을 눌러 점을 찍어요',
  mode: '눈금 누르는 중',
  defaults: { mode: 'point', min: 0, max: 10, step: 1, minor: 1, labels: 'all', fmt: 'int', start: 0 },
  fields: [
    { k: 'mode', label: '할 일', type: 'select', options: [['point', '점 찍기'], ['jump', '뛰어 세기 (화살표)']] },
    { k: 'min', label: '시작 수', type: 'text' },
    { k: 'max', label: '끝 수', type: 'text' },
    { k: 'step', label: '큰 눈금 간격', type: 'text' },
    { k: 'minor', label: '큰 눈금 사이 칸 수', type: 'number' },
    { k: 'fmt', label: '수 모양', type: 'select', options: [['int', '자연수'], ['frac', '분수 (작은 눈금마다)'], ['dec', '소수']] },
    { k: 'labels', label: '눈금 이름', type: 'select', options: [['all', '모든 큰 눈금'], ['minor', '작은 눈금까지 모두'], ['ends', '양 끝만']] },
    { k: 'start', label: '뛰어 세기 출발 수', type: 'text', show: (c) => c.mode === 'jump' },
  ],
  keyFields: [
    { k: 'value', label: '찍을 곳 (채점, 예: 3/4 · 0.7)', type: 'text', show: (c) => c.mode !== 'jump' },
    { k: 'end', label: '도착할 수 (채점)', type: 'text', show: (c) => c.mode === 'jump' },
    { k: 'size', label: '한 번에 뛰는 크기 (비우면 상관없음)', type: 'text', show: (c) => c.mode === 'jump' },
  ],
  validate(c) {
    const sh = shape(c);
    if (!(sh.max > sh.min)) return '끝 수가 시작 수보다 커야 해요';
    if (sh.N > 60) return '눈금이 너무 많아요 (60칸까지)';
    return null;
  },
  defaultQuestion(c, k) {
    if (c.mode === 'jump') return k && k.size ? `${c.start}에서 ${k.size}씩 뛰어 세어\n${k.end}까지 가 보세요.` : '수직선에서\n뛰어 세어 보세요.';
    return k && k.value ? `${eul(k.value)}\n수직선에 나타내 보세요.` : '수직선에\n점을 찍어 보세요.';
  },
  grade(ans, k, c) {
    if (!ans || !k) return null;
    const sh = shape(c);
    if (c.mode === 'jump') {
      const p = ans.path || [];
      const end = parseNum(k.end);
      if (p.length < 2 || !Number.isFinite(end)) return null;
      const size = parseNum(k.size);
      const okEnd = closeTo(sh.valueOf(p[p.length - 1]), end);
      const okSize = !Number.isFinite(size) || p.slice(1).every((v, i) => closeTo(Math.abs(sh.valueOf(v) - sh.valueOf(p[i])), size));
      const ok = okEnd && okSize;
      return { ok, short: ok ? '맞았어요' : (okEnd ? '뛰는 크기가 달라요' : `${label(sh.valueOf(p[p.length - 1]), { fmt: 'int' }, sh, 0)}에 도착`) };
    }
    const v = parseNum(k.value);
    if (ans.i == null || !Number.isFinite(v)) return null;
    const ok = closeTo(sh.valueOf(ans.i), v);
    return { ok, short: ok ? '맞았어요' : '다른 곳에 찍음' };
  },
  render(sheet, c, opt) {
    const sh = shape(c);
    const box = wrap(sheet, 'wg-numline');
    const a = opt.answer || {};
    const startI = clamp(sh.indexOf(num(parseNum(c.start), sh.min)), 0, sh.N);
    const S = makeState(c.mode === 'jump' ? { path: (a.path && a.path.length ? a.path : [startI]) } : { i: a.i ?? null }, opt, draw);
    const X0 = 50, X1 = 950, Y = 190;
    const xOf = (i) => X0 + (X1 - X0) * i / sh.N;
    const svg = svgRoot('0 0 1000 300', 'nl');
    svg.appendChild(s('line', { x1: X0 - 30, y1: Y, x2: X1 + 30, y2: Y, class: 'nl-axis' }));
    svg.appendChild(s('path', { d: `M${X1 + 30} ${Y}l-14 -9v18z`, class: 'nl-arrow' }));
    for (let i = 0; i <= sh.N; i++) {
      const major = i % sh.minor === 0;
      const x = xOf(i);
      svg.appendChild(s('line', { x1: x, y1: Y - (major ? 22 : 13), x2: x, y2: Y + (major ? 22 : 13), class: major ? 'nl-tick big' : 'nl-tick' }));
      const show = c.labels === 'ends' ? (i === 0 || i === sh.N) : c.labels === 'minor' ? true : major;
      if (show) {
        const L = label(sh.valueOf(i), c, sh, i);
        if (typeof L === 'string') svg.appendChild(s('text', { x, y: Y + 58, class: 'nl-lb' }, L));
        else {
          const g = s('g', { class: 'nl-frac' });
          g.appendChild(s('text', { x, y: Y + 50, class: 'nl-lb sm' }, L.n));
          g.appendChild(s('line', { x1: x - 12, y1: Y + 58, x2: x + 12, y2: Y + 58, class: 'nl-bar' }));
          g.appendChild(s('text', { x, y: Y + 80, class: 'nl-lb sm' }, L.d));
          if (L.w) g.appendChild(s('text', { x: x - 22, y: Y + 66, class: 'nl-lb sm' }, L.w));
          svg.appendChild(g);
        }
      }
    }
    const marks = s('g');
    svg.appendChild(marks);
    box.appendChild(svg);

    if (opt.interactive) {
      svg.addEventListener('click', (e) => {
        const p = toSvg(svg, e);
        if (p.y < 40 || p.y > 290) return;
        const i = clamp(Math.round((p.x - X0) / (X1 - X0) * sh.N), 0, sh.N);
        S.set((st) => {
          if (c.mode === 'jump') { if (st.path[st.path.length - 1] !== i) st.path.push(i); }
          else st.i = st.i === i ? null : i;
        });
      });
    }
    function draw(st) {
      marks.innerHTML = '';
      if (c.mode === 'jump') {
        const p = st.path;
        marks.appendChild(s('circle', { cx: xOf(p[0]), cy: Y, r: 11, class: 'nl-start' }));
        for (let j = 1; j < p.length; j++) {
          const x1 = xOf(p[j - 1]), x2 = xOf(p[j]);
          const hgt = Math.min(130, 30 + Math.abs(x2 - x1) * 0.45);
          marks.appendChild(s('path', { d: `M${x1} ${Y - 6} Q${(x1 + x2) / 2} ${Y - hgt} ${x2} ${Y - 6}`, class: 'nl-jump' }));
          const dir = x2 > x1 ? -1 : 1;
          marks.appendChild(s('path', { d: `M${x2} ${Y - 6} l${dir * 14} -8 l${dir * 2} 14 z`, class: 'nl-head' }));
        }
        if (p.length > 1) marks.appendChild(s('circle', { cx: xOf(p[p.length - 1]), cy: Y, r: 10, class: 'nl-pt' }));
      } else if (st.i != null) {
        marks.appendChild(s('circle', { cx: xOf(st.i), cy: Y, r: 14, class: 'nl-pt' }));
        marks.appendChild(s('path', { d: `M${xOf(st.i)} ${Y - 30} l-12 -22 h24 z`, class: 'nl-pin' }));
      }
    }
    draw(S.get());
    return { getAnswer: () => Object.assign({}, S.get(), { mine: S.mine() }), hasWork: () => S.mine() > 0, undo: () => S.undo() };
  },
};
