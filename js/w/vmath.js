// 세로셈: 덧셈 · 뺄셈 · 곱셈. 빈칸을 누르고 숫자 패드로 써요 (받아올림 작은 칸은 채점하지 않아요)
// content: { op: '+'|'-'|'×', a: 27, b: 35, carry: true }
// answer:  { rows: { carry: [], p1: [], p2: [], ans: [] } }   (왼쪽부터 칸마다 한 글자)
import { h } from '../common.js?v=202611072119';
import { makeState, wrap, num, eul } from './base.js?v=202611072119';

function calc(c) {
  const a = Math.trunc(num(c.a, 0)), b = Math.trunc(num(c.b, 0));
  const op = c.op === '-' ? '-' : c.op === '×' || c.op === 'x' || c.op === '*' ? '×' : '+';
  const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
  const twoRow = op === '×' && b >= 10;
  const p1 = twoRow ? a * (b % 10) : null;
  const p2 = twoRow ? a * Math.floor(b / 10) : null;
  const W = Math.max(String(a).length, String(b).length, String(r).length, p1 != null ? String(p1).length : 0, p2 != null ? String(p2).length + 1 : 0);
  return { a, b, op, r, p1, p2, W, twoRow };
}
const rightDigits = (n, W) => { const t = String(n); return Array.from({ length: W }, (_, i) => t[t.length - (W - i)] || ''); };

export const vmath = {
  name: '세로셈',
  desc: '덧셈·뺄셈·곱셈 칸 채우기',
  help: () => '빈칸을 누르고 오른쪽 숫자를 눌러 써요',
  mode: '숫자 패드로 쓰는 중',
  defaults: { op: '+', a: 27, b: 35, carry: true },
  fields: [
    { k: 'op', label: '셈', type: 'select', options: [['+', '덧셈 (+)'], ['-', '뺄셈 (−)'], ['×', '곱셈 (×)']] },
    { k: 'a', label: '위의 수', type: 'number' },
    { k: 'b', label: '아래 수', type: 'number' },
    { k: 'carry', label: '받아올림 · 받아내림 작은 칸 보이기', type: 'check' },
  ],
  validate(c) {
    const x = calc(c);
    if (x.a < 0 || x.b < 0) return '0보다 큰 수를 써 주세요';
    if (x.op === '-' && x.a < x.b) return '뺄셈은 위의 수가 더 커야 해요';
    if (x.op === '×' && x.b > 99) return '곱셈의 아래 수는 두 자리까지예요';
    if (x.W > 7) return '수가 너무 커요 (일곱 자리까지)';
    return null;
  },
  defaultQuestion(c) { const x = calc(c); return `${eul(`${x.a} ${x.op === '-' ? '−' : x.op} ${x.b}`)}\n세로셈으로 계산해 보세요.`; },
  grade(ans, k, c) {
    if (!ans || !ans.rows) return null;
    const x = calc(c);
    const got = (ans.rows.ans || []).join('');
    if (!got.trim()) return null;
    const t = (ans.rows.ans || []).map((d) => d || ' ').join('').trim();
    const ok = !/\s/.test(t) && Number(t) === x.r;
    return { ok, short: ok ? '맞았어요' : `${t.replace(/\s/g, '□')}` };
  },
  render(sheet, c, opt) {
    const x = calc(c);
    const box = wrap(sheet, 'wg-vmath');
    const a0 = (opt.answer && opt.answer.rows) || {};
    const blank = () => Array(x.W).fill('');
    const rows = { carry: blank(), ans: blank() };
    if (x.twoRow) { rows.p1 = blank(); rows.p2 = blank(); }
    for (const k of Object.keys(rows)) if (Array.isArray(a0[k])) rows[k] = rows[k].map((_, i) => a0[k][i] || '');
    const S = makeState({ rows }, opt, draw);
    let sel = { row: 'ans', col: x.W - 1 };

    const grid = h('div', { class: 'vm-grid', style: { gridTemplateColumns: `repeat(${x.W + 1}, var(--vm))` } });
    const cells = {};
    const put = (el, row) => { grid.appendChild(el); return el; };
    const fixedRow = (digits, opCh, cls = '') => {
      put(h('div', { class: 'vm-op' }, opCh || ''));
      digits.forEach((d) => put(h('div', { class: 'vm-d ' + cls }, d)));
    };
    const inputRow = (name, small, skipLast) => {
      put(h('div', { class: 'vm-op' }));
      cells[name] = [];
      for (let i = 0; i < x.W; i++) {
        if (skipLast && i === x.W - 1) { put(h('div', { class: 'vm-d vm-gap' })); cells[name].push(null); continue; }
        const b = h('button', { type: 'button', class: 'vm-in' + (small ? ' small' : ''), disabled: !opt.interactive, 'aria-label': `${name} ${i + 1}째 칸` });
        if (opt.interactive) b.addEventListener('click', () => { sel = { row: name, col: i }; draw(S.get()); });
        put(b);
        cells[name].push(b);
      }
    };
    const line = () => put(h('div', { class: 'vm-line', style: { gridColumn: `1 / span ${x.W + 1}` } }));

    if (c.carry !== false) inputRow('carry', true);
    fixedRow(rightDigits(x.a, x.W), '');
    fixedRow(rightDigits(x.b, x.W), x.op === '-' ? '−' : x.op);
    line();
    if (x.twoRow) { inputRow('p1'); inputRow('p2', false, true); line(); }
    inputRow('ans');
    box.appendChild(h('div', { class: 'vm-paper' }, grid));

    // 숫자 패드
    const type = (d) => S.set((st) => {
      const r = st.rows[sel.row];
      if (!r) return;
      r[sel.col] = d;
      if (d !== '') {   // 다음 칸은 왼쪽 (계산 순서대로)
        let n = sel.col - 1;
        while (n >= 0 && cells[sel.row][n] === null) n--;
        if (n >= 0) sel = { row: sel.row, col: n };
      }
    });
    let onKey = null;
    if (opt.interactive) {
      const pad = h('div', { class: 'vm-pad' });
      for (const d of ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0']) pad.appendChild(h('button', { type: 'button', class: 'vm-key', onclick: () => type(d) }, d));
      pad.appendChild(h('button', { type: 'button', class: 'vm-key del', 'aria-label': '지우기', onclick: () => type('') }, '⌫'));
      box.appendChild(pad);
      onKey = (e) => {
        if (!box.isConnected) return;
        if (/^[0-9]$/.test(e.key)) { type(e.key); e.preventDefault(); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { type(''); e.preventDefault(); }
      };
      window.addEventListener('keydown', onKey);
    }

    const expect = rightDigits(x.r, x.W);
    function draw(st) {
      const showMarks = !opt.interactive && (st.rows.ans || []).some((d) => d);
      for (const [name, list] of Object.entries(cells)) {
        list.forEach((b, i) => {
          if (!b) return;
          b.textContent = st.rows[name][i] || '';
          b.classList.toggle('sel', opt.interactive && sel.row === name && sel.col === i);
          if (name === 'ans') {
            b.classList.toggle('ok', showMarks && (st.rows.ans[i] || '') === expect[i] && !!expect[i]);
            b.classList.toggle('no', showMarks && (st.rows.ans[i] || '') !== expect[i]);
          }
        });
      }
    }
    draw(S.get());
    return {
      getAnswer: () => ({ rows: S.get().rows, mine: S.mine() }),
      hasWork: () => S.mine() > 0,
      undo: () => S.undo(),
      destroy: () => { if (onKey) window.removeEventListener('keydown', onKey); },
    };
  },
};
