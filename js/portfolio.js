// 학생별 포트폴리오 (선생님 화면만)
// 반을 고르고 학생을 누르면, 그 학생이 낸 것이 날짜순으로 나와요. 도장·한마디·자동 채점도 함께.
// ★ 대표작을 달고, 학생 한 명 또는 반 전체를 A4로 인쇄(PDF 저장)할 수 있어요.

import { h, $, toast, errMsg, KINDS, stampOf } from './common.js?v=202611072148';
import { renderSheet, gradeAny } from './sheet.js?v=202611072148';

const PAGE = 500;
const CHUNK = 80;
const dateFmt = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const fullDate = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;

// Supabase는 한 번에 1000줄까지라 나눠 받아요
async function fetchAll(make) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function fetchIn(table, cols, key, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    out.push(...await fetchAll(() => this_sb.from(table).select(cols).in(key, part)));
  }
  return out;
}
let this_sb = null;

export function initPortfolio(ctx) {
  const { sb, openModal, closeModal, show, getClasses, getClassId } = ctx;
  this_sb = sb;
  const P = {
    classId: null, students: [], sessions: new Map(), asgs: new Map(), keys: new Map(),
    subs: [], fbs: new Map(), stars: new Set(), studentId: null,
    period: 'all', kind: 'all', starOnly: false, loadedFor: null,
  };
  let io = null;
  const views = [];

  $('#open-portfolio').addEventListener('click', () => open());
  $('#port-back').addEventListener('click', () => { cleanup(); ctx.back(); });
  $('#port-class').addEventListener('change', async (e) => { P.classId = e.target.value; await loadClass(); });
  $('#port-print-one').addEventListener('click', () => askPrint(false));
  $('#port-print-all').addEventListener('click', () => askPrint(true));
  $('#port-reset').addEventListener('click', () => askReset());

  async function open() {
    const classes = getClasses();
    if (!classes.length) { toast('먼저 반을 만들어 주세요'); return; }
    const sel = $('#port-class');
    sel.innerHTML = '';
    for (const c of classes) sel.appendChild(h('option', { value: c.id }, c.name));
    P.classId = getClassId() || classes[0].id;
    sel.value = P.classId;
    show('v-port');
    await loadClass();
  }

  function cleanup() {
    for (const v of views) v.destroy();
    views.length = 0;
    if (io) io.disconnect();
  }

  // ------------------------------------------------ 반 자료 받기
  async function loadClass() {
    cleanup();
    $('#port-list').innerHTML = '';
    $('#port-cards').innerHTML = '';
    $('#port-cards').appendChild(h('div', { class: 'empty' }, '불러오는 중…'));
    try {
      const [students, sessions] = await Promise.all([
        fetchAll(() => sb.from('students').select('*').eq('class_id', P.classId).eq('active', true).order('number')),
        fetchAll(() => sb.from('sessions').select('id, title, created_at').eq('class_id', P.classId)),
      ]);
      P.students = students.filter((s) => s.number > 0 && !s.guest_session).sort((a, b) => a.number - b.number);
      P.sessions = new Map(sessions.map((s) => [s.id, s]));
      const sids = sessions.map((s) => s.id);
      const asgs = await fetchIn('assignments', 'id, session_id, title, kind, content, sent_at', 'session_id', sids);
      P.asgs = new Map(asgs.map((a) => [a.id, a]));
      const aids = asgs.map((a) => a.id);
      const [keys, subs] = await Promise.all([
        fetchIn('assignment_keys', 'assignment_id, answer_key', 'assignment_id', aids),
        fetchIn('submissions', 'id, assignment_id, session_id, student_id, answer, auto_collected, submitted_at, updated_at', 'session_id', sids),
      ]);
      P.keys = new Map(keys.map((k) => [k.assignment_id, k.answer_key]));
      const ids = new Set(P.students.map((s) => s.id));
      P.subs = subs.filter((s) => ids.has(s.student_id) && P.asgs.has(s.assignment_id));
      const subIds = P.subs.map((s) => s.id);
      const [fbs, stars] = await Promise.all([
        fetchIn('feedback', 'submission_id, stamp, comment', 'submission_id', subIds),
        fetchIn('portfolio_stars', 'submission_id', 'submission_id', subIds).catch(() => {
          toast('대표작 별표를 쓰려면 06_portfolio.sql을 실행해 주세요', 6000);
          return [];
        }),
      ]);
      P.fbs = new Map(fbs.map((f) => [f.submission_id, f]));
      P.stars = new Set(stars.map((s) => s.submission_id));
    } catch (e) {
      $('#port-cards').innerHTML = '';
      $('#port-cards').appendChild(h('div', { class: 'empty' }, errMsg(e)));
      return;
    }
    if (!P.students.some((s) => s.id === P.studentId)) P.studentId = P.students[0] ? P.students[0].id : null;
    paintFilters();
    paintList();
    paintCards();
  }

  // ------------------------------------------------ 거르기
  function periodRange(key) {
    const cls = getClasses().find((c) => c.id === P.classId) || {};
    const y = cls.school_year || new Date().getFullYear();
    const now = new Date();
    if (key === 'h1') return [new Date(y, 2, 1), new Date(y, 8, 1)];
    if (key === 'h2') return [new Date(y, 8, 1), new Date(y + 1, 2, 1)];
    if (key === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    return null;
  }
  function itemsOf(studentId, opt = {}) {
    const r = periodRange(P.period);
    return P.subs
      .filter((s) => s.student_id === studentId)
      .filter((s) => !r || (new Date(s.updated_at) >= r[0] && new Date(s.updated_at) < r[1]))
      .filter((s) => P.kind === 'all' || P.asgs.get(s.assignment_id).kind === P.kind)
      .filter((s) => !(opt.starOnly ?? P.starOnly) || P.stars.has(s.id))
      .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  }
  function paintFilters() {
    const box = $('#port-filters');
    box.innerHTML = '';
    const seg = (label, key, opts) => {
      const g = h('div', { class: 'seg small', role: 'group', 'aria-label': label });
      for (const [v, t] of opts) {
        g.appendChild(h('button', { type: 'button', 'aria-pressed': P[key] === v ? 'true' : 'false',
          onclick: () => { P[key] = v; paintFilters(); paintList(); paintCards(); } }, t));
      }
      return g;
    };
    const kinds = [...new Set(P.subs.map((s) => P.asgs.get(s.assignment_id).kind))];
    box.append(
      seg('기간', 'period', [['all', '전체'], ['h1', '1학기'], ['h2', '2학기'], ['month', '이번 달']]),
      seg('종류', 'kind', [['all', '모든 종류'], ...kinds.map((k) => [k, KINDS[k] || k])]),
      h('button', { type: 'button', class: 'btn star-only' + (P.starOnly ? ' on' : ''), 'aria-pressed': P.starOnly ? 'true' : 'false',
        onclick: () => { P.starOnly = !P.starOnly; paintFilters(); paintList(); paintCards(); } }, '★ 대표작만'));
  }
  function paintList() {
    const box = $('#port-list');
    box.innerHTML = '';
    if (!P.students.length) { box.appendChild(h('div', { class: 'empty' }, '명렬표가 비어 있어요.')); return; }
    for (const s of P.students) {
      const n = itemsOf(s.id).length;
      const stars = P.subs.filter((x) => x.student_id === s.id && P.stars.has(x.id)).length;
      box.appendChild(h('button', {
        type: 'button', class: 'list-item port-stu' + (s.id === P.studentId ? ' on' : ''), 'data-id': s.id,
        onclick: () => { P.studentId = s.id; paintList(); paintCards(); },
      }, h('span', { class: 'no' }, s.number), h('span', { class: 'tname' }, s.name),
        stars ? h('span', { class: 'port-star-n' }, '★' + stars) : null,
        h('span', { class: 'meta' }, n + '개')));
    }
  }

  // ------------------------------------------------ 카드
  function gradeText(sub, a) {
    const g = gradeAny(a.kind, sub.answer, P.keys.get(a.id), a.content);
    return g ? [g.ok, g.short] : null;
  }
  function card(sub, { forPrint = false } = {}) {
    const a = P.asgs.get(sub.assignment_id);
    const sess = P.sessions.get(sub.session_id) || {};
    const fb = P.fbs.get(sub.id);
    const st = fb && fb.stamp ? stampOf(fb.stamp) : null;
    const g = gradeText(sub, a);
    const starred = P.stars.has(sub.id);
    const host = h('div', { class: 'port-sheet' });
    const starBtn = forPrint ? (starred ? h('span', { class: 'port-star on' }, '★') : null)
      : h('button', { type: 'button', class: 'port-star' + (starred ? ' on' : ''), 'aria-pressed': starred ? 'true' : 'false',
        'aria-label': starred ? '대표작 빼기' : '대표작으로', onclick: (e) => toggleStar(sub, e.currentTarget) }, '★');
    const el = h('article', { class: 'port-card' + (starred ? ' starred' : '') },
      h('div', { class: 'port-card-head' },
        h('span', { class: 'port-date' }, dateFmt(sub.updated_at)),
        h('span', { class: 'port-title' }, a.title),
        starBtn),
      host,
      h('div', { class: 'port-card-foot' },
        h('span', { class: 'port-kind' }, (KINDS[a.kind] || a.kind) + (sess.title ? ' · ' + sess.title : '')),
        g ? h('span', { class: 'port-grade ' + (g[0] ? 'ok' : 'no') }, g[1]) : null,
        sub.auto_collected ? h('span', { class: 'port-grade late' }, '마감 때 거둠') : null,
        st ? h('span', { class: 'port-stamp', style: { color: st.color, borderColor: st.color } }, st.label) : null),
      fb && fb.comment ? h('div', { class: 'port-comment' }, fb.comment) : null);
    el._render = () => {
      if (el._view) return;
      const k = P.keys.get(a.id);
      el._view = renderSheet(host, a.content || {}, {
        answer: sub.answer, compact: true,
        correctIndex: k && typeof k.correct === 'number' ? k.correct : null,
        mapKey: k && (k.targets || k.groups) ? k : null,
      });
      views.push(el._view);
    };
    return el;
  }
  function paintCards() {
    cleanup();
    const box = $('#port-cards');
    box.innerHTML = '';
    const s = P.students.find((x) => x.id === P.studentId);
    $('#port-who').textContent = s ? `${s.number}번 ${s.name}` : '';
    if (!s) return;
    const items = itemsOf(s.id);
    const all = P.subs.filter((x) => x.student_id === s.id);
    $('#port-sum').textContent = `낸 것 ${all.length}개 · 대표작 ★${all.filter((x) => P.stars.has(x.id)).length}개` + (items.length !== all.length ? ` · 지금 ${items.length}개 보는 중` : '');
    if (!items.length) {
      box.appendChild(h('div', { class: 'empty' }, P.starOnly ? '아직 대표작이 없어요.\n카드의 ★을 누르면 대표작이 돼요.' : '이 기간에 낸 것이 없어요.'));
      return;
    }
    // 화면에 보일 때만 그려요 (1년 치가 쌓여도 가볍게)
    io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { e.target._render(); io.unobserve(e.target); }
    }, { root: box, rootMargin: '300px' });
    for (const sub of items.slice().reverse()) {   // 화면에서는 최근 것이 위에
      const el = card(sub);
      box.appendChild(el);
      io.observe(el);
    }
    box.scrollTop = 0;
  }

  async function toggleStar(sub, btn) {
    const on = !P.stars.has(sub.id);
    const res = on
      ? await sb.from('portfolio_stars').insert({ submission_id: sub.id })
      : await sb.from('portfolio_stars').delete().eq('submission_id', sub.id);
    if (res.error) { toast(/portfolio_stars/.test(res.error.message || '') ? '06_portfolio.sql을 먼저 실행해 주세요' : errMsg(res.error)); return; }
    if (on) P.stars.add(sub.id); else P.stars.delete(sub.id);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.closest('.port-card').classList.toggle('starred', on);
    paintList();
    const s = P.students.find((x) => x.id === P.studentId);
    const all = P.subs.filter((x) => x.student_id === s.id);
    $('#port-sum').textContent = `낸 것 ${all.length}개 · 대표작 ★${all.filter((x) => P.stars.has(x.id)).length}개`;
    if (P.starOnly && !on) paintCards();
  }

  // ------------------------------------------------ 초기화
  function askReset() {
    const s = P.students.find((x) => x.id === P.studentId);
    const clsName = $('#port-class').selectedOptions[0].textContent;
    const periodName = { all: '전체 기간', h1: '1학기', h2: '2학기', month: '이번 달' }[P.period];
    const radio = (name, v, label, checked) => {
      const i = h('input', { type: 'radio', name, value: v, id: `rs-${name}-${v}`, checked });
      return [i, h('label', { class: 'row', for: i.id, style: { gap: '8px' } }, i, label)];
    };
    const [rOne, lOne] = radio('who', 'one', s ? `${s.number}번 ${s.name}만` : '이 학생만', !!s);
    const [rAll, lAll] = radio('who', 'all', `${clsName} 학생 모두`, !s);
    if (!s) rOne.disabled = true;
    const [pAll, lpAll] = radio('when', 'all', '모든 기간', true);
    const [pCur, lpCur] = radio('when', 'cur', `지금 고른 기간만 (${periodName})`, false);
    if (P.period === 'all') pCur.disabled = true;
    const keepStar = h('input', { type: 'checkbox', id: 'rs-keep' });
    const typed = h('input', { class: 'input', id: 'rs-typed', placeholder: '지우기', autocomplete: 'off' });
    const n = h('span', { class: 'reset-n' });
    const go = h('button', { type: 'button', class: 'btn danger', disabled: true }, '지우기');

    const targets = () => {
      const ids = rAll.checked ? new Set(P.students.map((x) => x.id)) : new Set([P.studentId]);
      const r = pCur.checked ? periodRange(P.period) : null;
      return P.subs.filter((x) => ids.has(x.student_id))
        .filter((x) => !r || (new Date(x.updated_at) >= r[0] && new Date(x.updated_at) < r[1]))
        .filter((x) => !(keepStar.checked && P.stars.has(x.id)));
    };
    const sync = () => {
      const k = targets().length;
      n.textContent = `${k}개`;
      go.disabled = !k || typed.value.trim() !== '지우기';
    };
    for (const el of [rOne, rAll, pAll, pCur, keepStar]) el.addEventListener('change', sync);
    typed.addEventListener('input', sync);

    const body = h('div', { class: 'col', style: { gap: '12px' } },
      h('div', { class: 'field' }, h('label', null, '누구를'), h('div', { class: 'col', style: { gap: '6px' } }, lOne, lAll)),
      h('div', { class: 'field' }, h('label', null, '언제 것을'), h('div', { class: 'col', style: { gap: '6px' } }, lpAll, lpCur)),
      h('label', { class: 'row', for: 'rs-keep', style: { gap: '8px' } }, keepStar, '★ 대표작은 남기기'),
      h('p', { class: 'reset-warn' }, '낸 답과 받은 도장·한마디가 ', n, ' 지워져요. 지운 것은 되돌릴 수 없어요. 필요하면 먼저 인쇄해서 "PDF로 저장"해 두세요.'),
      h('div', { class: 'field' }, h('label', { for: 'rs-typed' }, '정말 지우려면 아래 칸에 "지우기"라고 써 주세요'), typed));
    const pdf = h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); askPrint(rAll.checked); } }, '먼저 PDF로 저장');
    go.addEventListener('click', async () => {
      const list = targets();
      if (!list.length || typed.value.trim() !== '지우기') return;
      go.disabled = true;
      go.textContent = '지우는 중…';
      const ids = list.map((x) => x.id);
      try {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { error } = await sb.from('submissions').delete().in('id', ids.slice(i, i + CHUNK));
          if (error) throw error;
        }
      } catch (e) {
        toast(errMsg(e));
        closeModal();
        await loadClass();
        return;
      }
      closeModal();
      toast(`${ids.length}개를 지웠어요`);
      await loadClass();
    });
    openModal('포트폴리오 초기화', body, [pdf, go]);
    sync();
  }

  // ------------------------------------------------ 인쇄
  function askPrint(all) {
    const s = P.students.find((x) => x.id === P.studentId);
    if (!all && !s) return;
    const starOnly = h('input', { type: 'checkbox', id: 'pp-star', checked: P.starOnly });
    const withFb = h('input', { type: 'checkbox', id: 'pp-fb', checked: true });
    const per = h('select', { class: 'input', id: 'pp-per' }, h('option', { value: '6', selected: true }, '한 쪽에 6장'), h('option', { value: '2' }, '한 쪽에 2장 (크게)'));
    const periodName = { all: '전체 기간', h1: '1학기', h2: '2학기', month: '이번 달' }[P.period];
    const kindName = P.kind === 'all' ? '모든 종류' : (KINDS[P.kind] || P.kind);
    const body = h('div', { class: 'col', style: { gap: '12px' } },
      h('p', { style: { margin: 0, lineHeight: 1.6 } }, all ? `${$('#port-class').selectedOptions[0].textContent} 학생 ${P.students.length}명을 한 번에 인쇄해요. 학생마다 새 쪽에서 시작해요.` : `${s.number}번 ${s.name}의 포트폴리오를 인쇄해요.`),
      h('p', { class: 'muted', style: { margin: 0 } }, `범위: ${periodName} · ${kindName}`),
      h('label', { class: 'row', for: 'pp-star', style: { gap: '8px' } }, starOnly, '★ 대표작만'),
      h('label', { class: 'row', for: 'pp-fb', style: { gap: '8px' } }, withFb, '도장과 한마디도 함께'),
      h('div', { class: 'field' }, h('label', { for: 'pp-per' }, '크기'), per),
      h('p', { class: 'muted small-note', style: { margin: 0 } }, '인쇄 창에서 "PDF로 저장"을 고르면 파일로 저장돼요.'));
    const go = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
      closeModal();
      await printNow(all ? P.students : [s], { starOnly: starOnly.checked, withFb: withFb.checked, per: +per.value });
    } }, '인쇄하기');
    openModal(all ? '반 전체 인쇄' : '이 학생 인쇄', body, [go]);
  }

  async function printNow(students, o) {
    const root = $('#print-root');
    root.innerHTML = '';
    root.dataset.per = o.per;
    root.classList.toggle('no-fb', !o.withFb);
    const cls = getClasses().find((c) => c.id === P.classId) || {};
    const periodName = { all: '', h1: '1학기', h2: '2학기', month: '이번 달' }[P.period];
    let count = 0;
    const cards = [];
    for (const s of students) {
      const items = itemsOf(s.id, { starOnly: o.starOnly });
      if (!items.length) continue;
      const all = P.subs.filter((x) => x.student_id === s.id);
      const tally = new Map();
      for (const x of all) { const f = P.fbs.get(x.id); if (f && f.stamp) tally.set(f.stamp, (tally.get(f.stamp) || 0) + 1); }
      const first = new Date(items[0].updated_at), last = new Date(items[items.length - 1].updated_at);
      const sec = h('section', { class: 'pr-student' },
        h('header', { class: 'pr-head' },
          h('div', { class: 'pr-kicker' }, `${cls.name || ''} 포트폴리오${periodName ? ' · ' + periodName : ''}${o.starOnly ? ' · 대표작' : ''}`),
          h('h1', null, `${s.number}번 ${s.name}`),
          h('div', { class: 'pr-meta' },
            h('span', null, `${fullDate(first)} ~ ${fullDate(last)}`),
            h('span', null, `모은 것 ${items.length}개`),
            h('span', null, `대표작 ★${all.filter((x) => P.stars.has(x.id)).length}개`),
            ...[...tally].map(([k, n]) => { const t = stampOf(k); return t ? h('span', { style: { color: t.color } }, `${t.label} ${n}`) : null; }))));
      const grid = h('div', { class: 'pr-grid' });
      for (const sub of items) { const el = card(sub, { forPrint: true }); grid.appendChild(el); cards.push(el); count++; }
      sec.appendChild(grid);
      root.appendChild(sec);
    }
    if (!count) { toast(o.starOnly ? '인쇄할 대표작이 없어요' : '인쇄할 것이 없어요'); return; }
    $('#ov-loading').hidden = false;
    // 화면 밖에 A4 너비로 먼저 그려 두고 (필기·지도 이름 자리가 맞게) 인쇄해요
    for (let i = 0; i < cards.length; i++) {
      cards[i]._render();
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 600));
    $('#ov-loading').hidden = true;
    document.body.classList.add('printing');
    const done = () => {
      document.body.classList.remove('printing');
      for (const c of cards) if (c._view) c._view.destroy();
      root.innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    // 인쇄 창을 닫았는데 afterprint가 안 오는 브라우저도 있어서
    setTimeout(() => { if (document.body.classList.contains('printing') && !window.__KEEP_PRINT) done(); }, 120000);
  }
}
