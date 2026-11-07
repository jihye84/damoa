// 템플릿 꺼내 오기: 다모아가 미리 만들어 둔 묶음(수학 1~6학년, 생각하기)을 골라 보관함에 넣어요.
import { h, toast, errMsg, KINDS } from './common.js?v=202611071854';

import { renderSheet } from './sheet.js?v=202611071854';

const SOURCES = [
  { key: 'math', label: '수학', file: 'library/math.json' },
  { key: 'think', label: '생각하기', file: 'library/think.json' },
  { key: 'maps', label: '지도', file: 'library/maps.json' },
];
const cache = {};

async function load(src) {
  if (!cache[src.key]) {
    const res = await fetch(src.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error('묶음을 불러오지 못했어요');
    cache[src.key] = await res.json();
  }
  return cache[src.key];
}

/**
 * @param ctx { sb, openModal, closeModal, existingFolders: Set, onImported: fn }
 */
export async function openLibrary(ctx) {
  const ui = { source: SOURCES[0], grade: 0, bundle: null, picked: new Set() };

  const srcSeg = h('div', { class: 'seg small', role: 'tablist', 'aria-label': '과목' });
  const gradeRow = h('div', { class: 'lib-grades', role: 'group', 'aria-label': '학년' });
  const list = h('div', { class: 'lib-list', role: 'listbox', 'aria-label': '묶음' });
  const detail = h('div', { class: 'lib-detail' });
  const note = h('p', { class: 'lib-note muted' });
  const body = h('div', { class: 'lib' },
    h('div', { class: 'lib-top' }, srcSeg, gradeRow),
    h('div', { class: 'lib-main' }, list, detail),
    note);

  const addBtn = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: doImport }, '보관함에 넣기');
  ctx.openModal('템플릿 꺼내 오기', body, [addBtn], 'wide');

  for (const src of SOURCES) {
    srcSeg.appendChild(h('button', {
      type: 'button', role: 'tab', 'aria-selected': src === ui.source ? 'true' : 'false',
      onclick: async () => { ui.source = src; ui.grade = 0; ui.bundle = null; await paintAll(); },
    }, src.label));
  }

  async function paintAll() {
    [...srcSeg.children].forEach((b, i) => b.setAttribute('aria-selected', SOURCES[i] === ui.source ? 'true' : 'false'));
    list.innerHTML = '';
    list.appendChild(h('div', { class: 'empty' }, '불러오는 중…'));
    let data;
    try { data = await load(ui.source); } catch (e) { list.innerHTML = ''; list.appendChild(h('div', { class: 'empty' }, errMsg(e))); return; }
    note.textContent = data.source ? `출처: ${data.source}` : '';
    paintGrades(data);
    paintList(data);
  }

  function paintGrades(data) {
    gradeRow.innerHTML = '';
    const grades = [...new Set(data.bundles.map((b) => b.grade))].filter((g) => g > 0).sort();
    gradeRow.hidden = grades.length === 0;
    const mk = (g, label) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': ui.grade === g ? 'true' : 'false',
      onclick: () => { ui.grade = g; ui.bundle = null; paintGrades(data); paintList(data); },
    }, label);
    gradeRow.appendChild(mk(0, '전체'));
    for (const g of grades) gradeRow.appendChild(mk(g, `${g}학년`));
  }

  function paintList(data) {
    list.innerHTML = '';
    const rows = data.bundles.filter((b) => !ui.grade || b.grade === ui.grade);
    let lastTerm = null;
    for (const b of rows) {
      const termKey = `${b.grade}-${b.term}`;
      if (b.grade && termKey !== lastTerm) {
        lastTerm = termKey;
        list.appendChild(h('div', { class: 'lib-term' }, `${b.grade}학년 ${b.term}학기`));
      }
      const have = ctx.existingFolders.has(b.title);
      list.appendChild(h('button', {
        type: 'button', role: 'option', class: 'lib-bundle' + (ui.bundle === b ? ' on' : ''),
        'aria-selected': ui.bundle === b ? 'true' : 'false',
        onclick: () => { ui.bundle = b; ui.picked = new Set(b.items.map((_, i) => i)); paintList(data); paintDetail(); },
      },
        h('span', { class: 'tname' }, b.unit),
        h('span', { class: 'meta' }, have ? '넣었어요 · ' : '', `${b.items.length}개`)));
    }
    if (!ui.bundle) paintDetail();
  }

  function paintDetail() {
    detail.innerHTML = '';
    const b = ui.bundle;
    if (!b) {
      detail.appendChild(h('div', { class: 'empty' }, '왼쪽에서 묶음을 고르면 문제를 미리 볼 수 있어요.'));
      addBtn.disabled = true;
      addBtn.textContent = '보관함에 넣기';
      return;
    }
    const all = h('input', { type: 'checkbox', id: 'lib-all', checked: ui.picked.size === b.items.length });
    all.addEventListener('change', () => {
      ui.picked = all.checked ? new Set(b.items.map((_, i) => i)) : new Set();
      paintDetail();
    });
    detail.appendChild(h('div', { class: 'lib-detail-head' },
      h('div', null, h('b', null, b.title), b.note ? h('div', { class: 'muted small-note' }, b.note) : null),
      h('label', { for: 'lib-all', class: 'row lib-all' }, all, '모두 고르기')));
    const ul = h('div', { class: 'lib-items' });
    b.items.forEach((it, i) => {
      const cb = h('input', { type: 'checkbox', id: 'lib-it-' + i, checked: ui.picked.has(i) });
      cb.addEventListener('change', () => { if (cb.checked) ui.picked.add(i); else ui.picked.delete(i); syncBtn(); all.checked = ui.picked.size === b.items.length; });
      const opts = it.content.options
        ? h('div', { class: 'lib-opts' }, ...it.content.options.map((o, j) =>
          h('span', { class: 'lib-opt' + (it.answer_key && it.answer_key.correct === j ? ' ans' : '') }, '①②③④'[j] + ' ' + o)))
        : null;
      const thumb = h('div', { class: 'lib-thumb', 'aria-hidden': 'true' });
      ul.appendChild(h('label', { for: 'lib-it-' + i, class: 'lib-item' },
        cb, thumb,
        h('div', { class: 'lib-item-body' },
          h('div', { class: 'lib-q' }, it.content.question),
          opts,
          h('span', { class: 'lib-kind' }, KINDS[it.kind] || it.kind))));
    });
    detail.appendChild(ul);
    // 학생 화면 그대로 작게 그려 보여 줘요
    [...ul.querySelectorAll('.lib-thumb')].forEach((th, i) => {
      const it = b.items[i];
      const k = it.answer_key || {};
      renderSheet(th, it.content, { correctIndex: typeof k.correct === 'number' ? k.correct : null, mapTargets: k.targets || null });
    });
    syncBtn();
  }

  function syncBtn() {
    addBtn.disabled = ui.picked.size === 0;
    addBtn.textContent = ui.picked.size ? `보관함에 넣기 (${ui.picked.size}개)` : '보관함에 넣기';
  }

  async function doImport() {
    const b = ui.bundle;
    if (!b || !ui.picked.size) return;
    if (ctx.existingFolders.has(b.title) && !confirm(`"${b.title}" 묶음이 이미 보관함에 있어요. 한 번 더 넣을까요?`)) return;
    addBtn.disabled = true;
    const rows = [...ui.picked].sort((x, y) => x - y).map((i) => {
      const it = b.items[i];
      return { title: it.title, kind: it.kind, content: it.content, answer_key: it.answer_key, folder: b.title };
    });
    const { error } = await ctx.sb.from('templates').insert(rows);
    addBtn.disabled = false;
    if (error) { toast(errMsg(error)); return; }
    ctx.existingFolders.add(b.title);
    toast(`${rows.length}개를 보관함에 넣었어요`);
    await ctx.onImported(b.title);
    paintList(await load(ui.source));
  }

  await paintAll();
}
