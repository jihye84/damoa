// 빠른 만들기: 한 줄에 하나씩 쓰면 알맞은 템플릿으로 바꿔 줘요. 여러 줄이면 한꺼번에.
//   8 + 5              → 4지선다 (보기 자동)      27 + 35, 52 − 18, 23 × 4 → 세로셈
//   3:30, 3시 30분      → 모형 시계                3/4                    → 분수 색칠판
//   7 = 3 + 4          → 십 배열판 가르기          57                     → 수 모형 (20까지는 십 배열판)
//   사과는? 배, *사과, 귤, 감 → 4지선다 (* 가 정답)  물음표로 끝나는 글       → 서술형
//   그 밖의 글           → 빈 답지
import { h, $, toast, errMsg, KINDS } from './common.js?v=202611072338';
import { renderSheet, WIDGETS } from './sheet.js?v=202611072338';

const eunOf = (t) => { const ch = String(t).trim().slice(-1); if (/[0-9]/.test(ch)) return '013678'.includes(ch) ? '은' : '는'; const k = ch.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 && k % 28 ? '은' : '는'; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function tool(kind, content, key) {
  const w = WIDGETS[kind];
  const c = Object.assign({}, w.defaults, content, { kind });
  if (w.validate && w.validate(c)) return null;
  c.question = w.defaultQuestion(c, key);
  return { kind, content: c, answer_key: key || null, title: c.question.replace(/\s*\n\s*/g, ' ').slice(0, 30), label: w.name };
}
function choice(question, options, correct) {
  return { kind: 'choice4', content: { kind: 'choice4', question, options }, answer_key: { correct }, title: question.replace(/\s*\n\s*/g, ' ').slice(0, 30), label: KINDS.choice4 };
}
function arithChoice(a, op, b, r) {
  const set = new Set([r]);
  for (const d of shuffle([1, -1, 2, -2, 10, -10, 3])) { if (set.size >= 4) break; if (r + d >= 0) set.add(r + d); }
  const opts = shuffle([...set]).map(String);
  const sym = op === '-' ? '−' : op;
  const expr = `${a} ${sym} ${b}`;
  return choice(`${expr}${eunOf(b)} 얼마일까요?`, opts, opts.indexOf(String(r)));
}

// 한 줄 → 만들 수 있는 템플릿들 (첫 번째가 추천)
export function parseLine(raw) {
  const line = raw.trim().replace(/\s*=\s*\??\s*$/, '');
  if (!line) return [];
  const out = [];
  let m;
  // 보기가 있는 문제: "질문? 보기, *정답, 보기, 보기"
  if ((m = raw.match(/^(.+?[?？])\s*(.+)$/)) && m[2].split(/[,，]/).length === 4 && /\*/.test(m[2])) {
    const parts = m[2].split(/[,，]/).map((x) => x.trim());
    const correct = parts.findIndex((x) => x.startsWith('*'));
    out.push(choice(m[1].trim(), parts.map((x) => x.replace(/^\*/, '').trim()), correct));
    return out;
  }
  // 셈: 27 + 35, 8+5, 23×4, 52-18
  if ((m = line.match(/^(\d{1,4})\s*([+\-−x×*])\s*(\d{1,3})$/))) {
    const a = +m[1], b = +m[3];
    const op = m[2] === '+' ? '+' : /[-−]/.test(m[2]) ? '-' : '×';
    const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
    if (r < 0) return [];
    const v = tool('vmath', { op, a, b, carry: true });
    const ch = arithChoice(a, op, b, r);
    if (a >= 10 || b >= 10) { if (v) out.push(v); out.push(ch); } else { out.push(ch); if (v) out.push(v); }
    return out;
  }
  // 가르기: 7 = 3 + 4
  if ((m = line.match(/^(\d{1,2})\s*=\s*(\d{1,2})\s*\+\s*(\d{1,2})$/)) && +m[1] === +m[2] + +m[3] && +m[1] <= 20) {
    const n = +m[1];
    const x = tool('tens', { mode: 'frame', frames: n > 10 ? 2 : 1 }, { count: n, red: +m[2] });
    if (x) out.push(x);
    return out;
  }
  // 시각: 3:30, 3시 30분, 3시
  if ((m = line.match(/^(\d{1,2})\s*(?::|시)\s*(\d{1,2})?\s*분?$/)) && +m[1] >= 1 && +m[1] <= 12 && (+m[2] || 0) < 60) {
    const time = `${+m[1]}:${String(+m[2] || 0).padStart(2, '0')}`;
    const mm = +m[2] || 0;
    const step = mm % 30 === 0 ? 30 : mm % 5 === 0 ? 5 : 1;
    const a = tool('clock', { mode: 'set', time, step });
    const b = tool('clock', { mode: 'read', time, step });
    if (a) out.push(a);
    if (b) out.push(Object.assign(b, { label: '모형 시계 (읽기)' }));
    return out;
  }
  // 분수: 3/4
  if ((m = line.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)) && +m[2] >= 2 && +m[2] <= 16 && +m[1] >= 1) {
    const num = +m[1], parts = +m[2];
    const wholes = Math.ceil(num / parts);
    const a = wholes <= 3 ? tool('fraction', { shape: parts <= 8 ? 'circle' : 'bar', parts, wholes }, { num }) : null;
    const b = num <= parts ? tool('numline', { mode: 'point', min: 0, max: 1, step: 1, minor: parts, labels: 'minor', fmt: 'frac' }, { value: `${num}/${parts}` }) : null;
    if (a) out.push(a);
    if (b) out.push(Object.assign(b, { label: '수직선' }));
    return out;
  }
  // 수: 7 → 십 배열판, 57 → 수 모형
  if ((m = line.match(/^(\d{1,3})$/))) {
    const n = +m[1];
    if (n >= 1 && n <= 20) { const x = tool('tens', { mode: 'frame', frames: n > 10 ? 2 : 1 }, { count: n }); if (x) out.push(x); }
    if (n >= 10) { const x = tool('tens', { mode: 'blocks', places: n >= 100 ? 3 : 2 }, { value: n, exact: true }); if (x) out.push(Object.assign(x, { label: '수 모형' })); }
    return out;
  }
  // 글: 물음표로 끝나면 서술형, 아니면 빈 답지
  const essay = { kind: 'essay', content: { kind: 'essay', question: line }, answer_key: null, title: line.slice(0, 30), label: KINDS.essay };
  const blank = { kind: 'blank', content: { kind: 'blank', question: line }, answer_key: null, title: line.slice(0, 30), label: KINDS.blank };
  return /[?？]$/.test(line) ? [essay, blank] : [blank, essay];
}

export function openQuick(ctx) {
  const { sb, openModal, closeModal, reload, onSaved, send } = ctx;   // send: 수업 중이면 만들자마자 보내요
  const ta = h('textarea', { class: 'textarea quick-in', id: 'qk-in', rows: '8',
    placeholder: '한 줄에 하나씩 써요. 예)\n8 + 5\n27 + 35\n3:30\n3/4\n7 = 3 + 4\n57\n가장 큰 동물은? 개미, 고양이, *코끼리, 토끼\n친구와 다툰 적이 있나요?' });
  const d = new Date();
  const folder = h('input', { class: 'input', id: 'qk-folder', value: `${send ? '수업 중 만든 문제' : '빠른 만들기'} ${d.getMonth() + 1}/${d.getDate()}` });
  const list = h('div', { class: 'quick-list' });
  const stage = h('div', { class: 'tv-stage' });
  const help = h('div', { class: 'quick-help muted' },
    h('b', null, '이렇게 쓰면 알아서 만들어요'),
    h('span', null, '8 + 5 → 4지선다 (보기 자동) · 27 + 35, 23 × 4 → 세로셈 · 3:30 → 모형 시계 · 3/4 → 분수 색칠판 · 7 = 3 + 4 → 가르기 · 57 → 수 모형 · "질문? 보기, *정답, 보기, 보기" → 4지선다 · 물음표로 끝나는 글 → 서술형 · 그 밖의 글 → 빈 답지'));
  let rows = [];   // { line, cands, pick }
  let sel = 0;
  let pv = null;
  const goLabel = send ? '바로 보내기' : '보관함에 넣기';
  const go = h('button', { type: 'button', class: 'btn primary', disabled: true }, goLabel);
  const body = h('div', { class: 'quick' },
    h('div', { class: 'col quick-left' },
      h('div', { class: 'field grow' }, h('label', { for: 'qk-in' }, '문제 쓰기'), ta),
      h('div', { class: 'field' }, h('label', { for: 'qk-folder' }, '넣을 폴더'), folder),
      help),
    h('div', { class: 'col quick-right' },
      h('div', { class: 'side-h' }, '이렇게 만들어져요 (종류를 누르면 바꿀 수 있어요)'),
      list,
      h('div', { class: 'tv-main quick-pv' }, h('div', { class: 'tv-label' }, '학생 태블릿에 이렇게 보여요'), stage)));

  function show(i) {
    sel = i;
    list.querySelectorAll('.quick-row').forEach((r, k) => r.classList.toggle('on', k === i));
    if (pv) pv.destroy();
    pv = null;
    stage.innerHTML = '';
    const r = rows[i];
    if (!r || !r.cands.length) return;
    const c = r.cands[r.pick];
    const k = c.answer_key || {};
    pv = renderSheet(stage, c.content, { interactive: true, correctIndex: typeof k.correct === 'number' ? k.correct : null });
  }
  function paint() {
    const old = new Map(rows.map((r) => [r.line, r.pick]));
    rows = ta.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 60)
      .map((line) => ({ line, cands: parseLine(line), pick: old.get(line) || 0 }));
    list.innerHTML = '';
    rows.forEach((r, i) => {
      const chips = h('div', { class: 'quick-chips' }, ...r.cands.map((c, k) => h('button', {
        type: 'button', class: 'quick-chip' + (k === r.pick ? ' on' : ''),
        onclick: (e) => { e.stopPropagation(); r.pick = k; paint(); show(i); },
      }, c.label)));
      list.appendChild(h('div', { class: 'quick-row' + (i === sel ? ' on' : ''), onclick: () => show(i) },
        h('span', { class: 'quick-n' }, i + 1),
        h('span', { class: 'quick-line' }, r.line),
        r.cands.length ? chips : h('span', { class: 'muted' }, '만들 수 없어요')));
    });
    if (!rows.length) list.appendChild(h('div', { class: 'empty' }, '왼쪽에 문제를 써 보세요.'));
    const n = rows.filter((r) => r.cands.length).length;
    go.disabled = !n;
    go.textContent = n ? `${goLabel} (${n}개)` : goLabel;
    if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
  }
  let timer = null;
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      paint();
      // 지금 쓰고 있는 줄을 미리 보여 줘요
      const lineNo = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
      const realIdx = ta.value.split('\n').slice(0, lineNo + 1).filter((x) => x.trim()).length - 1;
      show(Math.max(0, Math.min(rows.length - 1, realIdx)));
    }, 200);
  });
  go.addEventListener('click', async () => {
    const make = rows.filter((r) => r.cands.length).map((r) => {
      const c = r.cands[r.pick];
      return { title: c.title, kind: c.kind, content: c.content, answer_key: c.answer_key, folder: folder.value.trim() || null };
    });
    if (!make.length) return;
    go.disabled = true;
    const res = await sb.from('templates').insert(make).select();
    if (res.error) { toast(errMsg(res.error)); go.disabled = false; return; }
    closeModal();
    if (send) {
      // 아이들은 새로 온 장부터 풀어요 → 첫 줄을 맨 나중에 보내야 첫 줄부터 풀어요
      const made = res.data || [];
      for (const t of made.slice().reverse()) await send(t);
      if (made.length > 1) toast(`${made.length}장을 보냈어요. 아이들은 첫 줄 문제부터 풀어요`, 4000);
      reload();
      return;
    }
    toast(`${make.length}개를 만들었어요`);
    await reload();
    if (onSaved) onSaved(res.data || []);
  });
  // Ctrl+Enter (또는 ⌘+Enter)로 바로
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !go.disabled) { e.preventDefault(); go.click(); } });
  if (send) help.appendChild(h('span', null, '여러 줄이면 여러 장을 보내요. 아이들은 첫 줄 문제부터 풀어요. Ctrl + Enter로 바로 보내요.'));
  openModal(send ? '바로 내기 · 써서 바로 보내요' : '빠른 만들기', body, [go], 'wide');
  paint();
  setTimeout(() => ta.focus(), 50);
}
