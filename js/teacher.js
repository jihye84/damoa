// 다모아 선생님 PC
import { makeClient, h, $, toast, errMsg, STAMPS, stampOf, stampEl, KINDS, MAPS, joinUrl, who } from './common.js?v=202611071758';
import { renderSheet, isCorrect, loadMap } from './sheet.js?v=202611071758';
import { openLibrary } from './library.js?v=202611071758';
import { qrcode } from '../vendor/qrcode.mjs?v=202611071758';

const sb = makeClient('teacher');

const st = {
  user: null,
  teacher: null,
  classes: [],
  classId: null,
  students: [],        // 현재 반 명렬표
  templates: [],
  // 수업 중
  session: null,
  sessionStudents: [],
  participants: new Map(),  // student_id → row
  assignment: null,
  key: null,
  subs: new Map(),          // student_id → submission
  fbs: new Map(),           // submission_id → feedback
  asgList: [],              // 이 수업에서 보낸 장들 (보낸 순서)
  subCounts: new Map(),     // assignment_id → Set(student_id)
  channel: null,
  view: 'grid',             // grid | one
  oneId: null,              // 한 명 보기 중인 student_id
  pickStamp: null,
  tickTimer: null,
  openSessions: [],         // 열려 있는 수업들 (반마다 하나씩 열어 둘 수 있어요)
  joinMode: (() => { try { return localStorage.getItem('damoa-joinmode') || 'roster'; } catch (_) { return 'roster'; } })(),
};
const isOpenMode = () => !!(st.session && st.session.join_mode === 'open');

const views = ['v-auth', 'v-home', 'v-live'];
function show(id) {
  for (const v of views) $('#' + v).hidden = v !== id;
  $('#ov-loading').hidden = true;
}

// =====================================================================
// 대화상자
// =====================================================================
function openModal(title, body, buttons, size) {
  $('#modal-title').textContent = title;
  $('#modal .modal').classList.toggle('wide', size === 'wide');
  const b = $('#modal-body');
  b.innerHTML = '';
  b.appendChild(body);
  const f = $('#modal-foot');
  f.innerHTML = '';
  for (const btn of buttons || []) f.appendChild(btn);
  $('#modal').hidden = false;
  const first = b.querySelector('input, textarea, select, button');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-x').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function confirmBox(title, text, okLabel = '확인') {
  return new Promise((resolve) => {
    const ok = h('button', { type: 'button', class: 'btn primary', onclick: () => { closeModal(); resolve(true); } }, okLabel);
    const no = h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); resolve(false); } }, '취소');
    openModal(title, h('p', { style: { margin: 0, lineHeight: 1.6 } }, text), [no, ok]);
  });
}

// =====================================================================
// 로그인
// =====================================================================
let signupMode = false;
function setAuthMode(signup) {
  signupMode = signup;
  $('#tab-login').setAttribute('aria-selected', signup ? 'false' : 'true');
  $('#tab-signup').setAttribute('aria-selected', signup ? 'true' : 'false');
  $('#name-field').hidden = !signup;
  $('#auth-submit').textContent = signup ? '가입하기' : '로그인';
  $('#auth-pw').autocomplete = signup ? 'new-password' : 'current-password';
  $('#auth-msg').textContent = '';
}
$('#tab-login').addEventListener('click', () => setAuthMode(false));
$('#tab-signup').addEventListener('click', () => setAuthMode(true));

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-pw').value;
  const msg = $('#auth-msg');
  $('#auth-submit').disabled = true;
  msg.textContent = '잠시만요…';
  try {
    if (signupMode) {
      const display_name = $('#auth-name').value.trim();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { display_name }, emailRedirectTo: location.href.split(/[?#]/)[0] },
      });
      if (error) throw error;
      if (!data.session) {
        setAuthMode(false);
        msg.textContent = '인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.';
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    await afterLogin();
  } catch (err) {
    msg.textContent = errMsg(err);
  } finally {
    $('#auth-submit').disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function init() {
  const { data } = await sb.auth.getSession();
  const user = data.session && data.session.user;
  if (!user || user.is_anonymous) { show('v-auth'); return; }
  await afterLogin();
}

async function afterLogin() {
  const { data: { user } } = await sb.auth.getUser();
  st.user = user;
  const { data: t } = await sb.from('teachers').select('*').eq('id', user.id).maybeSingle();
  st.teacher = t;
  $('#me-name').textContent = (t && t.display_name) || user.email;
  await loadHome();
  show('v-home');
}

async function loadOpenSessions() {
  const { data } = await sb.from('sessions').select('*').eq('status', 'open').order('created_at', { ascending: false });
  st.openSessions = data || [];
}
const openSessionOf = (classId) => st.openSessions.find((x) => x.class_id === classId) || null;

// 선택한 반에 열려 있는 수업이 있으면 "이어서 하기"
function paintResume() {
  const s = openSessionOf(st.classId);
  const others = st.openSessions.length - (s ? 1 : 0);
  $('#resume-box').hidden = !s && !others;
  $('#resume-text').textContent = s ? '이 반은 수업 중이에요.' : `열려 있는 수업이 ${others}개 있어요.`;
  $('#resume').textContent = s ? '이어서 하기' : '수업 고르기';
  $('#resume').onclick = () => (s ? enterLive(s) : openClassSwitch());
  $('#start-session').textContent = s ? '이어서 하기' : '수업 시작';
}

// 들어오는 방법 고르기 (홈·입장 화면 공용)
function paintJoinMode(box, mode) {
  box.querySelectorAll('button[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'));
}
$('#join-mode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  st.joinMode = b.dataset.mode;
  try { localStorage.setItem('damoa-joinmode', st.joinMode); } catch (_) {}
  paintJoinMode($('#join-mode'), st.joinMode);
});
paintJoinMode($('#join-mode'), st.joinMode);

// =====================================================================
// 홈: 반 · 명렬표 · 템플릿
// =====================================================================
async function loadHome() {
  const [{ data: classes }, { data: templates }] = await Promise.all([
    sb.from('classes').select('*').order('created_at'),
    sb.from('templates').select('id, title, kind, content, answer_key, updated_at, folder').order('updated_at', { ascending: false }),
  ]);
  st.classes = classes || [];
  st.templates = templates || [];
  await loadOpenSessions();
  if (!st.classId || !st.classes.find((c) => c.id === st.classId)) {
    st.classId = st.classes[0] ? st.classes[0].id : null;
  }
  renderClasses();
  renderTemplates();
  await loadRoster();
  paintResume();
}

function renderClasses() {
  const box = $('#class-list');
  box.innerHTML = '';
  if (!st.classes.length) {
    box.appendChild(h('div', { class: 'empty' }, '먼저 반을 만들어 주세요.'));
    return;
  }
  for (const c of st.classes) {
    box.appendChild(h('button', {
      type: 'button',
      class: 'list-item' + (c.id === st.classId ? ' on' : ''),
      onclick: async () => { st.classId = c.id; renderClasses(); await loadRoster(); paintResume(); },
    }, h('span', { class: 'tname' }, c.name),
      openSessionOf(c.id) ? h('span', { class: 'live-badge' }, '수업 중') : null,
      h('span', { class: 'meta' }, c.school_year + '년')));
  }
}

async function loadRoster() {
  st.students = [];
  if (st.classId) {
    const { data } = await sb.from('students').select('*').eq('class_id', st.classId).eq('active', true).order('number');
    st.students = data || [];
  }
  const box = $('#roster');
  box.innerHTML = '';
  $('#roster-count').textContent = st.students.length ? st.students.length + '명' : '';
  $('#edit-roster').disabled = !st.classId;
  if (!st.classId) return;
  if (!st.students.length) {
    box.style.display = 'block';
    box.appendChild(h('div', { class: 'empty' }, '"고치기"를 눌러 아이들 이름을 넣어 주세요.'));
    return;
  }
  box.style.display = '';
  for (const s of st.students) {
    box.appendChild(h('div', { class: 'roster-chip' }, h('span', { class: 'no' }, s.number + '번'), h('span', { class: 'nm' }, s.name)));
  }
}

$('#add-class').addEventListener('click', () => {
  const input = h('input', { class: 'input', id: 'cls-name', value: '1학년 3반' });
  const save = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    const name = input.value.trim();
    if (!name) return;
    const { data, error } = await sb.from('classes').insert({ name }).select().single();
    if (error) { toast(errMsg(error)); return; }
    closeModal();
    st.classId = data.id;
    await loadHome();
  } }, '만들기');
  openModal('반 만들기', h('div', { class: 'field' }, h('label', { for: 'cls-name' }, '반 이름'), input), [save]);
});

$('#edit-roster').addEventListener('click', () => {
  const ta = h('textarea', { class: 'textarea', id: 'roster-text', rows: '14', style: { minHeight: '320px' } });
  ta.value = st.students.map((s) => `${s.number} ${s.name}`).join('\n');
  const help = h('p', { class: 'muted', style: { margin: 0, lineHeight: 1.6, fontSize: '14px' } },
    '한 줄에 한 명씩 "번호 이름"으로 써 주세요. 번호 없이 이름만 쓰면 위에서부터 1번이에요.',
    h('br'), '성은 빼고 이름만 쓰기를 권해요. 지운 학생은 명렬표에서 숨겨지고, 지난 기록은 남아요.');
  const save = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    const rows = parseRoster(ta.value);
    if (rows === null) return;
    save.disabled = true;
    const keep = new Set(rows.map((r) => r.number));
    const up = rows.map((r) => ({ class_id: st.classId, number: r.number, name: r.name, active: true }));
    let error = null;
    if (up.length) ({ error } = await sb.from('students').upsert(up, { onConflict: 'class_id,number' }));
    if (!error) {
      const gone = st.students.filter((s) => !keep.has(s.number)).map((s) => s.id);
      if (gone.length) ({ error } = await sb.from('students').update({ active: false }).in('id', gone));
    }
    save.disabled = false;
    if (error) { toast(errMsg(error)); return; }
    closeModal();
    await loadRoster();
    toast('명렬표를 저장했어요');
  } }, '저장');
  openModal('명렬표 고치기', h('div', { class: 'col' }, help, h('label', { for: 'roster-text', class: 'muted' }, '명렬표'), ta), [save]);
});

function parseRoster(text) {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  const used = new Set();
  let auto = 1;
  for (const l of lines) {
    const m = l.match(/^(\d+)\s*[.)번]?\s*(.+)$/);
    let number, name;
    if (m) { number = parseInt(m[1], 10); name = m[2].trim(); }
    else { while (used.has(auto)) auto++; number = auto; name = l; }
    if (used.has(number)) { toast(number + '번이 두 번 있어요'); return null; }
    if (name.length > 20) { toast('이름이 너무 길어요: ' + name); return null; }
    used.add(number);
    out.push({ number, name });
  }
  return out;
}

// ---------- 템플릿 ----------
// 보관함은 묶음(폴더)별로 접었다 펼 수 있어요
const MINE = '내가 만든 템플릿';
const openFolders = new Set([MINE]);

function foldersOf(list) {
  const map = new Map();
  for (const t of list) {
    const f = t.folder || MINE;
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(t);
  }
  // 내가 만든 것이 맨 위, 나머지는 이름 순
  return [...map.entries()].sort((x, y) => (x[0] === MINE ? -1 : y[0] === MINE ? 1 : x[0].localeCompare(y[0], 'ko', { numeric: true })));
}

function renderTemplates() {
  const box = $('#template-list');
  box.innerHTML = '';
  if (!st.templates.length) {
    box.appendChild(h('div', { class: 'empty' }, '"+ 새 템플릿"으로 직접 만들거나,\n"꺼내 오기"로 수학 단원별 묶음과\n생각하기 질문을 가져올 수 있어요.'));
    return;
  }
  for (const [folder, items] of foldersOf(st.templates)) {
    const open = openFolders.has(folder);
    const head = h('div', { class: 'folder-head' },
      h('button', {
        type: 'button', class: 'folder-btn', 'aria-expanded': open ? 'true' : 'false',
        onclick: () => { if (open) openFolders.delete(folder); else openFolders.add(folder); renderTemplates(); },
      },
        h('span', { class: 'folder-caret', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
        h('span', { class: 'tname' }, folder),
        h('span', { class: 'meta' }, items.length + '개')),
      folder === MINE ? null : h('button', {
        type: 'button', class: 'btn icon folder-del', 'aria-label': `${folder} 묶음 지우기`,
        onclick: () => deleteFolder(folder, items.length),
      }, h('span', { 'aria-hidden': 'true', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>' })));
    box.appendChild(head);
    if (!open) continue;
    for (const t of items) {
      box.appendChild(h('button', { type: 'button', class: 'list-item in-folder', onclick: () => openViewer(t) },
        h('span', { class: 'tname' }, t.title), h('span', { class: 'meta' }, KINDS[t.kind] || t.kind)));
    }
  }
}

async function deleteFolder(folder, n) {
  if (!(await confirmBox('묶음 지우기', `"${folder}" 묶음의 템플릿 ${n}개를 보관함에서 지울까요? 이미 보낸 수업 기록은 남아요.`, '지우기'))) return;
  const { error } = await sb.from('templates').delete().eq('folder', folder);
  if (error) { toast(errMsg(error)); return; }
  openFolders.delete(folder);
  await loadHome();
  toast('묶음을 지웠어요');
}

$('#open-library').addEventListener('click', () => openLibrary({
  sb,
  openModal,
  closeModal,
  existingFolders: new Set(st.templates.map((t) => t.folder).filter(Boolean)),
  onImported: async (folder) => { openFolders.add(folder); await loadHome(); },
}));

$('#add-template').addEventListener('click', () => editTemplate(null));

function editTemplate(t, afterSave) {
  const c = (t && t.content) || {};
  let kind = (t && t.kind) || 'choice4';
  const title = h('input', { class: 'input', id: 'tp-title', value: (t && t.title) || '' , placeholder: '예: 8 + 5' });
  const q = h('textarea', { class: 'textarea', id: 'tp-q', rows: '2', placeholder: '예: 8 + 5는 얼마일까요?' });
  q.value = c.question || '';
  const opts = [0, 1, 2, 3].map((i) => h('input', { class: 'input', 'aria-label': (i + 1) + '번 선택지', value: (c.options && c.options[i]) || '' }));
  const correct = (t && t.answer_key && typeof t.answer_key.correct === 'number') ? t.answer_key.correct : 0;
  const radios = [0, 1, 2, 3].map((i) => h('input', { type: 'radio', name: 'tp-correct', value: String(i), checked: i === correct }));
  const optBox = h('div', { class: 'col' }, h('div', { class: 'side-h', style: { margin: 0 } }, '선택지와 정답'),
    ...opts.map((o, i) => h('div', { class: 'opt-row' }, h('span', { class: 'mk' }, '①②③④'[i]), o, h('label', null, radios[i], '정답'))));

  const kinds = Object.entries({
    choice4: ['4지선다', '문제 + 선택지 4개, 자동 채점'],
    blank: ['빈 답지', '골든벨처럼 펜으로 쓰기'],
    essay: ['서술형', '타자로 쓰기 + 펜'],
    map: ['지도', '백지도에 톡 눌러 색칠'],
  }).map(([k, [name, desc]]) => h('button', {
    type: 'button', class: 'kind-pick', 'aria-pressed': k === kind ? 'true' : 'false',
    onclick: () => { kind = k; paintKinds(); },
  }, h('b', null, name), h('span', null, desc)));
  const kindKeys = ['choice4', 'blank', 'essay', 'map'];

  // 지도: 어떤 지도인지, 이름 보이기, 정답 지역(있으면 자동 채점)
  const mapSel = h('select', { class: 'input', id: 'tp-map' },
    ...MAPS.map((m) => h('option', { value: m.id, selected: (c.map || 'korea') === m.id }, m.name)));
  const mapLabels = h('input', { type: 'checkbox', id: 'tp-map-labels', checked: !!c.labels });
  const mapTargets = h('input', { class: 'input', id: 'tp-map-targets', placeholder: '예: 서울특별시, 부산광역시 (비우면 자유 색칠)' });
  const prevTargets = (t && t.answer_key && Array.isArray(t.answer_key.targets)) ? t.answer_key.targets : [];
  if (prevTargets.length) {
    loadMap(c.map || 'korea').then((m) => {
      mapTargets.value = prevTargets.map((id) => (m.regions.find((r) => r.id === id) || { name: id }).name).join(', ');
    }).catch(() => {});
  }
  const mapBox = h('div', { class: 'col' },
    h('div', { class: 'field' }, h('label', { for: 'tp-map' }, '지도'), mapSel),
    h('label', { class: 'row', style: { gap: '8px' } }, mapLabels, '지역 이름을 지도에 보여 주기'),
    h('div', { class: 'field' }, h('label', { for: 'tp-map-targets' }, '찾아 칠할 곳 (쉼표로 나눠 쓰기)'), mapTargets));

  function paintKinds() {
    kinds.forEach((b, i) => b.setAttribute('aria-pressed', kindKeys[i] === kind ? 'true' : 'false'));
    optBox.hidden = kind !== 'choice4';
    mapBox.hidden = kind !== 'map';
    $('#tp-q-label') && ($('#tp-q-label').textContent = kind === 'blank' ? '안내 글 (없어도 돼요)' : '문제');
  }

  const form = h('div', { class: 'col te-form', style: { gap: '14px' } },
    h('div', { class: 'kind-picks' }, ...kinds),
    h('div', { class: 'field' }, h('label', { for: 'tp-title' }, '템플릿 이름 (보관함에 보이는 이름)'), title),
    h('div', { class: 'field' }, h('label', { for: 'tp-q', id: 'tp-q-label' }, '문제'), q),
    optBox, mapBox);

  // 오른쪽: 고치는 대로 학생 화면이 바로 바뀌어요
  const stage = h('div', { class: 'tv-stage' });
  const body = h('div', { class: 'te' }, form,
    h('div', { class: 'tv-main' }, h('div', { class: 'tv-label' }, '학생 태블릿에 이렇게 보여요'), stage));
  let pv = null;
  let pvT = null;
  async function paintPreview() {
    const content = { kind, question: q.value.trim() };
    let key = null;
    if (kind === 'choice4') {
      content.options = opts.map((o, i) => o.value.trim() || '(' + (i + 1) + '번)');
      key = { correct: parseInt(radios.find((r) => r.checked).value, 10) };
    }
    if (kind === 'map') {
      content.map = mapSel.value;
      content.labels = mapLabels.checked;
      const names = mapTargets.value.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
      if (names.length) {
        try {
          const m = await loadMap(content.map);
          const norm = (x) => x.replace(/\s/g, '');
          key = { targets: names.map((n) => (m.regions.find((r) => norm(r.name) === norm(n)) || m.regions.find((r) => norm(r.name).startsWith(norm(n))) || {}).id).filter(Boolean) };
        } catch (_) {}
      }
    }
    if (pv) pv.destroy();
    pv = previewSheet(stage, content, key);
  }
  const schedule = () => { clearTimeout(pvT); pvT = setTimeout(paintPreview, 120); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('click', (e) => { if (e.target.closest('.kind-pick')) schedule(); });

  const buttons = [];
  if (t) {
    buttons.push(h('button', { type: 'button', class: 'btn', onclick: async () => {
      if (!(await confirmBox('템플릿 지우기', `"${t.title}"을(를) 지울까요? 이미 보낸 수업 기록은 남아요.`, '지우기'))) return;
      const { error } = await sb.from('templates').delete().eq('id', t.id);
      if (error) { toast(errMsg(error)); return; }
      await loadHome();
    } }, '지우기'));
  }
  buttons.push(h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    const content = { kind, question: q.value.trim() };
    let answer_key = null;
    if (kind === 'choice4') {
      content.options = opts.map((o) => o.value.trim());
      if (content.options.some((o) => !o)) { toast('선택지 4개를 모두 써 주세요'); return; }
      if (!content.question) { toast('문제를 써 주세요'); return; }
      answer_key = { correct: parseInt(radios.find((r) => r.checked).value, 10) };
    }
    if (kind === 'essay' && !content.question) { toast('질문을 써 주세요'); return; }
    if (kind === 'map') {
      content.map = mapSel.value;
      content.labels = mapLabels.checked;
      const names = mapTargets.value.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
      if (names.length) {
        let m;
        try { m = await loadMap(content.map); } catch (e) { toast(e.message); return; }
        const norm = (x) => x.replace(/\s/g, '');
        const ids = [];
        for (const n of names) {
          const r = m.regions.find((r) => norm(r.name) === norm(n))
            || m.regions.find((r) => norm(r.name).startsWith(norm(n)));
          if (!r) { toast(`"${n}"을(를) 지도에서 찾지 못했어요`); return; }
          if (!ids.includes(r.id)) ids.push(r.id);
        }
        answer_key = { targets: ids };
      }
    }
    const row = { title: title.value.trim() || content.question.slice(0, 30) || (kind === 'map' ? MAPS.find((m) => m.id === content.map).name + ' 백지도' : KINDS[kind]), kind, content, answer_key };
    const res = t
      ? await sb.from('templates').update(row).eq('id', t.id).select().single()
      : await sb.from('templates').insert(row).select().single();
    if (res.error) { toast(errMsg(res.error)); return; }
    closeModal();
    await loadHome();
    if (afterSave) afterSave(res.data);
  } }, afterSave ? '저장하고 보내기' : '저장'));

  openModal(t ? '템플릿 고치기' : '새 템플릿', body, buttons, 'wide');
  paintKinds();
  paintPreview();
}


// =====================================================================
// 템플릿 미리 보기: 학생 태블릿에 뜨는 화면 그대로
// =====================================================================
function previewSheet(host, content, key) {
  return renderSheet(host, content || {}, {
    correctIndex: key && typeof key.correct === 'number' ? key.correct : null,
    mapTargets: key && Array.isArray(key.targets) ? key.targets : null,
  });
}

function answerNote(t) {
  const k = t.answer_key;
  if (t.kind === 'choice4' && k && typeof k.correct === 'number') return `정답: ${'①②③④'[k.correct]} ${(t.content.options || [])[k.correct] || ''} (초록 테두리, 학생에게는 안 보여요)`;
  if (t.kind === 'map') return k && k.targets && k.targets.length ? `찾아 칠할 곳 ${k.targets.length}곳 (초록 테두리, 학생에게는 안 보여요)` : '자유 색칠 (정답 없음)';
  if (t.kind === 'essay') return '타자나 펜으로 답을 써요';
  return '펜으로 자유롭게 써요';
}

function openViewer(startT, { sending = false } = {}) {
  let cur = startT || null;
  let view = null;
  const search = h('input', { class: 'input', type: 'search', placeholder: '찾기: 예) 받아올림, 중랑구, 행복', 'aria-label': '템플릿 찾기' });
  const list = h('div', { class: 'pick-list tv-list', role: 'listbox', 'aria-label': '템플릿' });
  const stage = h('div', { class: 'tv-stage' });
  const capTitle = h('b', null);
  const capNote = h('span', { class: 'muted' });
  const cap = h('div', { class: 'tv-cap' }, h('div', { class: 'tv-cap-text' }, capTitle, capNote));
  const prevB = h('button', { type: 'button', class: 'btn icon', 'aria-label': '앞 템플릿', onclick: () => step(-1) }, '‹');
  const nextB = h('button', { type: 'button', class: 'btn icon', 'aria-label': '다음 템플릿', onclick: () => step(1) }, '›');
  cap.appendChild(h('div', { class: 'row', style: { gap: '6px' } }, prevB, nextB));
  const body = h('div', { class: 'tv' },
    h('div', { class: 'tv-side' }, search, list),
    h('div', { class: 'tv-main' }, h('div', { class: 'tv-label' }, '학생 태블릿에 이렇게 보여요'), stage, cap));

  let shown = [];
  const paintList = () => {
    list.innerHTML = '';
    const q = search.value.trim();
    shown = st.templates.filter((t) => !q || t.title.includes(q) || (t.folder || '').includes(q) || (t.content && (t.content.question || '').includes(q)));
    if (!st.templates.length) { list.appendChild(h('div', { class: 'empty' }, '보관함이 비어 있어요.')); return; }
    if (!shown.length) { list.appendChild(h('div', { class: 'empty' }, '찾는 템플릿이 없어요.')); return; }
    const ordered = [];
    for (const [folder, items] of foldersOf(shown)) {
      list.appendChild(h('div', { class: 'pick-folder' }, folder));
      for (const t of items) {
        ordered.push(t);
        list.appendChild(h('button', {
          type: 'button', role: 'option', class: 'list-item' + (cur && cur.id === t.id ? ' on' : ''),
          'aria-selected': cur && cur.id === t.id ? 'true' : 'false', 'data-id': t.id,
          onclick: () => show(t),
          ondblclick: () => { if (sending) { closeModal(); sendTemplate(t); } },
        }, h('span', { class: 'tname' }, t.title), h('span', { class: 'meta' }, KINDS[t.kind] || t.kind)));
      }
    }
    shown = ordered;
  };

  const sendB = h('button', { type: 'button', class: 'btn primary', onclick: () => { if (cur) { closeModal(); sendTemplate(cur); } } }, '이 템플릿 보내기');
  const editB = h('button', { type: 'button', class: 'btn', onclick: () => cur && editTemplate(cur, sending ? (t) => sendTemplate(t) : null) }, '고치기');
  const newB = h('button', { type: 'button', class: 'btn', onclick: () => editTemplate(null, sending ? (t) => sendTemplate(t) : null) }, '+ 새로 만들기');
  const buttons = sending ? [newB, editB, sendB] : [newB, editB];

  function show(t) {
    cur = t;
    if (view) view.destroy();
    view = null;
    stage.innerHTML = '';
    [...list.querySelectorAll('.list-item')].forEach((b) => {
      const on = !!t && b.dataset.id === t.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) b.scrollIntoView({ block: 'nearest' });
    });
    editB.disabled = !t; sendB.disabled = !t;
    const i = t ? shown.findIndex((x) => x.id === t.id) : -1;
    prevB.disabled = i <= 0; nextB.disabled = i < 0 || i >= shown.length - 1;
    if (!t) {
      stage.appendChild(h('div', { class: 'empty tv-empty' }, '왼쪽에서 템플릿을 고르면\n학생 화면 그대로 보여 드려요.'));
      capTitle.textContent = ''; capNote.textContent = '';
      return;
    }
    view = previewSheet(stage, t.content, t.answer_key);
    capTitle.textContent = t.title;
    capNote.textContent = `${KINDS[t.kind] || t.kind} · ${answerNote(t)}`;
  }
  function step(d) {
    const i = cur ? shown.findIndex((x) => x.id === cur.id) : -1;
    const n = shown[Math.max(0, Math.min(shown.length - 1, i + d))];
    if (n) show(n);
  }
  body.addEventListener('keydown', (e) => {
    if (e.target === search) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  search.addEventListener('input', () => { paintList(); show(cur && shown.some((x) => x.id === cur.id) ? cur : shown[0] || null); });

  openModal(sending ? '어떤 템플릿을 보낼까요?' : '템플릿 미리 보기', body, buttons, 'wide');
  paintList();
  show(cur || shown[0] || null);
  if (!sending && cur) setTimeout(() => list.querySelector('.list-item.on') && list.querySelector('.list-item.on').focus(), 40);
}

// =====================================================================
// 수업 시작
// =====================================================================
$('#start-session').addEventListener('click', async () => {
  const open = openSessionOf(st.classId);
  if (open) { await enterLive(open); return; }
  if (!st.classId && st.joinMode === 'open') {
    // 반이 없어도 "누구나 들어오기" 수업은 열 수 있게 반 하나를 만들어 둬요
    const { data, error } = await sb.from('classes').insert({ name: '누구나 수업' }).select().single();
    if (error) { toast(errMsg(error)); return; }
    st.classId = data.id;
    st.classes.push(data);
  }
  if (!st.classId) { toast('먼저 반을 만들어 주세요'); return; }
  if (st.joinMode === 'roster' && !st.students.length) {
    toast('명렬표가 비어 있어요. 이름을 넣거나 "누구나 들어오기"로 시작해요', 4500);
    return;
  }
  const session = await startSessionFor(st.classId, $('#session-title').value.trim(), st.joinMode);
  if (session) await enterLive(session);
});

async function startSessionFor(classId, title, mode) {
  const { data, error } = await sb.rpc('start_session', { p_class: classId, p_title: title || '' });
  if (error) { toast(errMsg(error)); return null; }
  if (mode === 'open') {
    const r = await sb.from('sessions').update({ join_mode: 'open' }).eq('id', data.id).select().single();
    if (r.error) { toast('누구나 들어오기를 켜지 못했어요. 05_open_join.sql을 실행했는지 확인해 주세요.', 6000); return data; }
    return r.data;
  }
  return data;
}

// ---------- 반 바꾸기 (여러 반을 가르치는 교과 선생님) ----------
async function openClassSwitch() {
  await loadOpenSessions();
  const cur = st.session;
  const endCur = h('input', { type: 'checkbox', id: 'sw-end', checked: true });
  const list = h('div', { class: 'pick-list' });
  for (const c of st.classes) {
    const open = openSessionOf(c.id);
    const here = cur && cur.class_id === c.id;
    list.appendChild(h('button', {
      type: 'button', class: 'list-item' + (here ? ' on' : ''), disabled: here,
      onclick: () => switchTo(c, endCur.checked && !!cur),
    }, h('span', { class: 'tname' }, c.name),
      here ? h('span', { class: 'meta' }, '지금 이 반') : open ? h('span', { class: 'live-badge' }, '수업 중 · 이어서') : h('span', { class: 'meta' }, '새로 시작')));
  }
  if (!st.classes.length) list.appendChild(h('div', { class: 'empty' }, '반이 없어요. 홈에서 반을 만들어 주세요.'));
  const body = h('div', { class: 'col' },
    h('p', { class: 'muted', style: { margin: 0 } }, '옮겨 갈 반을 누르세요. 그 반에 열려 있는 수업이 있으면 이어서 하고, 없으면 새 QR로 시작해요.'),
    list,
    cur ? h('label', { class: 'row', for: 'sw-end', style: { gap: '8px' } }, endCur,
      `지금 수업(${(st.classes.find((c) => c.id === cur.class_id) || {}).name || ''})은 끝내고 옮겨요`) : null);
  openModal('반 바꾸기', body, []);
}

async function switchTo(c, endCurrent) {
  closeModal();
  const cur = st.session;
  if (cur && endCurrent) {
    await sb.from('sessions').update({ status: 'ended', entry_open: false, screen_mode: 'normal', ended_at: new Date().toISOString() }).eq('id', cur.id);
  }
  leaveLive();
  await loadOpenSessions();
  let target = openSessionOf(c.id);
  if (!target) {
    st.classId = c.id;
    const mode = cur ? cur.join_mode : st.joinMode;
    const { count } = await sb.from('students').select('id', { count: 'exact', head: true }).eq('class_id', c.id).eq('active', true);
    const useMode = mode === 'roster' && !count ? 'open' : mode;
    if (useMode !== mode) toast(`${c.name}은(는) 명렬표가 비어 있어서 누구나 들어오기로 시작했어요`, 4500);
    target = await startSessionFor(c.id, cur ? cur.title : $('#session-title').value.trim(), useMode);
    if (!target) { await afterLogin(); return; }
  }
  await enterLive(target);
  toast(`${c.name} 수업으로 옮겼어요`);
}

function leaveLive() {
  if (st.channel) sb.removeChannel(st.channel);
  st.channel = null;
  if (st.tickTimer) clearInterval(st.tickTimer);
  st.tickTimer = null;
  st.session = null;
  st.assignment = null;
  st.view = 'grid';
}

async function enterLive(session) {
  st.session = session;
  st.classId = session.class_id;
  const cls = st.classes.find((c) => c.id === session.class_id);
  $('#live-class').textContent = cls ? cls.name : '';
  $('#live-title').textContent = session.title || '';

  await loadSessionStudents();
  paintJoinMode($('#live-join-mode'), session.join_mode || 'roster');

  await reloadParticipants();
  subscribeLive();
  renderQR();
  paintControls();

  await loadSessionAssignments();
  if (session.current_assignment_id) await loadAssignment(session.current_assignment_id);
  else { st.assignment = null; showLobby(true); }

  if (st.tickTimer) clearInterval(st.tickTimer);
  st.tickTimer = setInterval(() => { renderJoin(); if (st.view === 'grid') renderTiles(); }, 5000);
  show('v-live');
}

// 이 수업의 학생: 명렬표 학생(명렬표 모드) + 이름을 쓰고 들어온 학생
async function loadSessionStudents() {
  const session = st.session;
  const [roster, guests] = await Promise.all([
    isOpenMode() ? Promise.resolve({ data: [] })
      : sb.from('students').select('*').eq('class_id', session.class_id).eq('active', true).order('number'),
    sb.from('students').select('*').eq('guest_session', session.id).order('created_at'),
  ]);
  st.sessionStudents = [...(roster.data || []), ...(guests.error ? [] : guests.data || [])];
}

// 답안판에 보일 학생: 누구나 들어오기면 들어와 있거나 답을 낸 학생만
function boardStudents() {
  if (!isOpenMode()) return st.sessionStudents;
  const sent = new Set();
  for (const set of st.subCounts.values()) for (const id of set) sent.add(id);
  return st.sessionStudents.filter((s) => s.number > 0 || st.participants.has(s.id) || sent.has(s.id));
}

// 처음 보는 학생이 들어오면 (이름을 쓰고 들어온 학생) 이름을 받아 와요
async function ensureStudent(id) {
  const old = st.sessionStudents.find((x) => x.id === id);
  if (old && !old.guest_session) return;
  const { data } = await sb.from('students').select('*').eq('id', id).maybeSingle();
  if (!data) return;
  if (old) {
    Object.assign(old, data);   // 이름을 바꿨을 수도 있어요
    const nm = document.querySelector('#tile-' + id + ' .tile-name');
    if (nm) nm.textContent = data.name;
  }
  else st.sessionStudents.push(data);
  renderJoin();
  renderTiles();
  renderTabs();
}

$('#live-join-mode').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b || !st.session || b.dataset.mode === st.session.join_mode) return;
  if (!(await updateSession({ join_mode: b.dataset.mode }))) return;
  paintJoinMode($('#live-join-mode'), st.session.join_mode);
  await loadSessionStudents();
  renderJoin();
  renderTiles();
  renderTabs();
  toast(isOpenMode() ? 'QR이 있는 누구나 이름을 쓰고 들어올 수 있어요' : '명렬표에서 이름을 골라 들어와요');
});
$('#live-class').addEventListener('click', openClassSwitch);

async function reloadParticipants() {
  const { data } = await sb.from('session_participants').select('*').eq('session_id', st.session.id);
  st.participants = new Map((data || []).map((p) => [p.student_id, p]));
  renderJoin();
  renderTiles();
}

function subscribeLive() {
  if (st.channel) sb.removeChannel(st.channel);
  const sid = st.session.id;
  st.channel = sb.channel('tch-' + sid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_participants', filter: 'session_id=eq.' + sid },
      (p) => { st.participants.set(p.new.student_id, p.new); renderJoin(); renderTile(p.new.student_id); ensureStudent(p.new.student_id); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_participants', filter: 'session_id=eq.' + sid },
      (p) => {
        const before = st.participants.get(p.new.student_id);
        st.participants.set(p.new.student_id, p.new); renderJoin(); renderTile(p.new.student_id);
        if (!before || !st.sessionStudents.some((x) => x.id === p.new.student_id)) ensureStudent(p.new.student_id);
      })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'session_participants' },
      () => reloadParticipants())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions', filter: 'session_id=eq.' + sid },
      (p) => {
        const s = p.new;
        if (!s || !s.assignment_id) return;
        countSub(s);
        renderTabs();
        if (!st.assignment || s.assignment_id !== st.assignment.id) return;
        st.subs.set(s.student_id, s);
        renderTile(s.student_id);
        renderStats();
        if (st.view === 'one' && st.oneId === s.student_id) renderOne();
      })
    .subscribe();
}

function isAway(p) {
  if (!p) return false;
  return !p.in_app || (Date.now() - Date.parse(p.last_seen)) > 30000;
}

// ---------- 입장 화면 ----------
function renderQR() {
  const url = joinUrl(st.session.join_code);
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  $('#join-code').textContent = st.session.join_code;
  $('#join-url').textContent = url;
}

function renderJoin() {
  if (!st.session) return;
  const grid = $('#join-grid');
  grid.innerHTML = '';
  const open = isOpenMode();
  // 누구나 들어오기: 들어온 학생만 보여요
  const list = open ? st.sessionStudents.filter((s) => st.participants.has(s.id)) : st.sessionStudents;
  const n = list.length;
  const cols = n > 30 ? 7 : 6;
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  // 몇 명 없을 때 이름 칸이 너무 커지지 않게 줄 수를 최소 6줄로
  grid.style.gridTemplateRows = `repeat(${Math.max(6, Math.ceil(n / cols))}, minmax(0, 1fr))`;
  let joined = 0;
  for (const s of list) {
    const p = st.participants.get(s.id);
    if (p) joined++;
    const cls = p ? (isAway(p) ? 'join-chip out' : 'join-chip in') : 'join-chip';
    grid.appendChild(h('button', {
      type: 'button', class: cls + (s.number > 0 ? '' : ' guest'),
      'aria-label': `${who(s)}, ${p ? (isAway(p) ? '다른 앱으로 나감' : '들어왔어요') : '아직이에요'}`,
      onclick: () => p && kick(s),
    }, s.number > 0 ? h('span', { class: 'no' }, s.number + '번') : null, h('span', { class: 'nm' }, s.name)));
  }
  if (open && !n) {
    grid.appendChild(h('div', { class: 'empty join-empty' }, '아이들이 QR을 찍고\n이름이나 별명을 쓰면\n여기에 나타나요.'));
  }
  $('#join-n').textContent = joined;
  $('#join-total').textContent = open ? '명 들어왔어요' : ` / ${n}명`;
}

async function kick(s) {
  if (!(await confirmBox('내보내기', `${who(s)}을(를) 내보낼까요? 그 태블릿은 이름 고르기 화면으로 돌아가요.`, '내보내기'))) return;
  const { error } = await sb.from('session_participants').delete().eq('session_id', st.session.id).eq('student_id', s.id);
  if (error) toast(errMsg(error));
  await reloadParticipants();
}

function showLobby(on) {
  $('#lobby').hidden = !on;
  $('#board').hidden = on;
  $('#btn-lobby').textContent = on ? (st.assignment ? '답안 보기' : '입장 QR') : '입장 QR';
  $('#btn-lobby').disabled = on && !st.assignment;
}
$('#btn-lobby').addEventListener('click', () => {
  showLobby($('#lobby').hidden);
  if (!$('#board').hidden) paintView();
});

// ---------- 화면 제어 ----------
function paintControls() {
  const s = st.session;
  const lock = s.screen_mode === 'locked';
  const front = s.screen_mode === 'look_front';
  $('#btn-lock').setAttribute('aria-pressed', lock ? 'true' : 'false');
  $('#btn-lock').querySelector('span').textContent = lock ? '잠금 풀기' : '화면 잠금';
  $('#btn-front').setAttribute('aria-pressed', front ? 'true' : 'false');
  $('#btn-front').querySelector('span').textContent = front ? '다시 하던 것 하기' : '모두 앞을 보세요';
  $('#btn-entry').textContent = s.entry_open ? '입장 마감' : '입장 다시 열기';
  $('#btn-entry').classList.toggle('primary', !s.entry_open);
}

async function updateSession(patch) {
  const { data, error } = await sb.from('sessions').update(patch).eq('id', st.session.id).select().single();
  if (error) { toast(errMsg(error)); return false; }
  st.session = data;
  paintControls();
  return true;
}

$('#btn-lock').addEventListener('click', () =>
  updateSession({ screen_mode: st.session.screen_mode === 'locked' ? 'normal' : 'locked' }));
$('#btn-front').addEventListener('click', () =>
  updateSession({ screen_mode: st.session.screen_mode === 'look_front' ? 'normal' : 'look_front' }));
$('#btn-entry').addEventListener('click', () => updateSession({ entry_open: !st.session.entry_open }));

$('#btn-end').addEventListener('click', async () => {
  if (!(await confirmBox('수업 끝내기', '수업을 끝낼까요? 아이들 화면에 "수업이 끝났어요"가 뜨고 QR은 더 이상 쓸 수 없어요. 낸 답안은 그대로 남아요.', '끝내기'))) return;
  if (await updateSession({ status: 'ended', entry_open: false, screen_mode: 'normal', ended_at: new Date().toISOString() })) {
    leaveLive();
    await afterLogin();
    toast('수업을 끝냈어요. 수고하셨어요!');
  }
});

// ---------- 템플릿 보내기 ----------
$('#btn-send').addEventListener('click', () => openViewer(null, { sending: true }));

async function sendTemplate(t) {
  const { data: a, error } = await sb.from('assignments').insert({
    session_id: st.session.id, template_id: t.id, title: t.title, kind: t.kind, content: t.content,
  }).select().single();
  if (error) { toast(errMsg(error)); return; }
  if (t.answer_key) await sb.from('assignment_keys').insert({ assignment_id: a.id, answer_key: t.answer_key });
  // 이전 장은 닫지 않아요: 아이들은 새 장을 먼저 하고, 내면 이전 장이 다시 나와요
  st.asgList.push(a);
  await updateSession({ current_assignment_id: a.id, screen_mode: 'normal' });
  await loadAssignment(a.id);
  toast('아이들 태블릿에 보냈어요');
}

async function loadSessionAssignments() {
  const sid = st.session.id;
  const [{ data: asgs }, { data: subs }] = await Promise.all([
    sb.from('assignments').select('id, title, kind, accepting, sent_at, closed_at').eq('session_id', sid).order('sent_at'),
    sb.from('submissions').select('assignment_id, student_id').eq('session_id', sid),
  ]);
  st.asgList = asgs || [];
  st.subCounts = new Map();
  for (const x of subs || []) countSub(x);
  renderTabs();
}

function countSub(x) {
  if (!st.subCounts.has(x.assignment_id)) st.subCounts.set(x.assignment_id, new Set());
  st.subCounts.get(x.assignment_id).add(x.student_id);
}

function renderTabs() {
  const box = $('#asg-tabs');
  box.innerHTML = '';
  box.hidden = st.asgList.length < 2;
  const total = boardStudents().length;
  st.asgList.forEach((a, i) => {
    const on = st.assignment && st.assignment.id === a.id;
    const n = (st.subCounts.get(a.id) || new Set()).size;
    box.appendChild(h('button', {
      type: 'button', role: 'tab', class: 'asg-tab' + (a.accepting ? '' : ' closed'),
      'aria-selected': on ? 'true' : 'false',
      onclick: () => { if (!on) loadAssignment(a.id); },
    },
      h('span', { class: 'asg-no' }, i + 1),
      h('span', { class: 'asg-name' }, a.title),
      h('span', { class: 'asg-count' }, `${n}/${total}`),
      a.accepting ? null : h('span', { class: 'asg-closed' }, '마감')));
  });
}

async function loadAssignment(aid) {
  const [{ data: a }, { data: key }, { data: subs }] = await Promise.all([
    sb.from('assignments').select('*').eq('id', aid).single(),
    sb.from('assignment_keys').select('answer_key').eq('assignment_id', aid).maybeSingle(),
    sb.from('submissions').select('*').eq('assignment_id', aid),
  ]);
  st.assignment = a;
  st.key = key ? key.answer_key : null;
  st.subs = new Map((subs || []).map((s) => [s.student_id, s]));
  st.fbs = new Map();
  const ids = (subs || []).map((s) => s.id);
  if (ids.length) {
    const { data: fbs } = await sb.from('feedback').select('*').in('submission_id', ids);
    for (const f of fbs || []) st.fbs.set(f.submission_id, f);
  }
  $('#board-title').textContent = `${KINDS[a.kind] || ''} · ${a.title}`;
  $('#btn-close-asg').textContent = a.accepting ? '제출 마감' : '제출 다시 받기';
  if (!st.asgList.find((x) => x.id === a.id)) st.asgList.push(a);
  renderTabs();
  st.view = 'grid';
  showLobby(false);
  paintView();
}

$('#btn-close-asg').addEventListener('click', async () => {
  if (!st.assignment) return;
  const { data, error } = await sb.from('assignments').update({ accepting: !st.assignment.accepting }).eq('id', st.assignment.id).select().single();
  if (error) { toast(errMsg(error)); return; }
  st.assignment = data;
  $('#btn-close-asg').textContent = data.accepting ? '제출 마감' : '제출 다시 받기';
  const i = st.asgList.findIndex((x) => x.id === data.id);
  if (i >= 0) st.asgList[i] = data;
  renderTabs();
  renderTiles();
  if (!data.accepting) toast('마감했어요. 쓰던 답은 잠시 뒤 "마감 때 거둠"으로 들어와요');
});

// =====================================================================
// 분할 보기
// =====================================================================
const tileSheets = new Map(); // student_id → {sheet, sig}

function tileState(s) {
  const p = st.participants.get(s.id);
  const sub = st.subs.get(s.id);
  if (sub && sub.auto_collected) return { cls: 'late', badge: '마감 때 거둠' };
  if (sub) {
    const ok = isCorrect(st.assignment.kind, sub.answer, st.key);
    if (ok === true) return { cls: 'ok', badge: '맞았어요' };
    if (ok === false) return { cls: 'no', badge: '다시 볼까요' };
    return { cls: 'done', badge: '냈어요' };
  }
  if (!p) return { cls: 'absent', badge: '안 들어옴' };
  if (!st.assignment.accepting) return { cls: 'absent', badge: '안 냈어요' };
  if (isAway(p)) return { cls: 'away', badge: '나갔어요' };
  return { cls: 'wip', badge: '푸는 중' };
}

function gridShape(n) {
  const W = $('#tiles').clientWidth || 1200, H = $('#tiles').clientHeight || 600;
  let best = { cols: 6, score: 0 };
  for (let cols = 2; cols <= 10; cols++) {
    const rows = Math.ceil(n / cols);
    const tw = W / cols, th = H / rows;
    const sw = Math.min(tw, (th - 28) * 1.6);
    if (sw > best.score) best = { cols, rows, score: sw };
  }
  return best;
}

function renderTiles() {
  if (!st.session || !st.assignment || $('#board').hidden || st.view !== 'grid') return;
  const box = $('#tiles');
  const list = boardStudents();
  const shape = gridShape(list.length);
  box.style.gridTemplateColumns = `repeat(${shape.cols}, minmax(0, 1fr))`;
  box.style.gridTemplateRows = `repeat(${shape.rows}, minmax(0, 1fr))`;
  if (box.children.length !== list.length || box.dataset.aid !== st.assignment.id) {
    for (const v of tileSheets.values()) v.sheet.destroy();
    tileSheets.clear();
    box.innerHTML = '';
    box.dataset.aid = st.assignment.id;
    for (const s of list) {
      box.appendChild(h('button', { type: 'button', class: 'tile', id: 'tile-' + s.id, onclick: () => openOne(s.id) },
        h('div', { class: 'tile-head' }, h('span', { class: 'tile-name' }, s.number > 0 ? `${s.number}. ${s.name}` : s.name), h('span', { class: 'badge' })),
        h('div', { class: 'tile-body' })));
    }
  }
  for (const s of list) renderTile(s.id);
  renderStats();
}

function renderTile(studentId) {
  if (!st.assignment || st.view !== 'grid') return;
  const el = document.getElementById('tile-' + studentId);
  const s = st.sessionStudents.find((x) => x.id === studentId);
  if (!el || !s) return;
  const t = tileState(s);
  el.className = 'tile ' + t.cls;
  el.querySelector('.badge').textContent = t.badge;
  el.setAttribute('aria-label', `${who(s)}, ${t.badge}`);
  const body = el.querySelector('.tile-body');
  const sub = st.subs.get(studentId);
  const sig = sub ? sub.updated_at : '';
  const cur = tileSheets.get(studentId);
  if (sub) {
    if (!cur || cur.sig !== sig) {
      if (cur) cur.sheet.destroy();
      body.innerHTML = '';
      const host = h('div', { style: { position: 'absolute', inset: '0' } });
      body.appendChild(host);
      const sheet = renderSheet(host, st.assignment.content, { answer: sub.answer, correctIndex: st.key ? st.key.correct : null, mapTargets: st.key ? st.key.targets : null });
      tileSheets.set(studentId, { sheet, sig });
    }
    const fb = st.fbs.get(sub.id);
    let mark = body.querySelector('.tile-stamp');
    if (mark) mark.remove();
    if (fb && fb.stamp) body.appendChild(h('div', { class: 'tile-stamp' }, stampEl(fb.stamp)));
  } else {
    if (cur) { cur.sheet.destroy(); tileSheets.delete(studentId); }
    body.innerHTML = '';
    body.appendChild(h('span', null, t.cls === 'absent' ? '' : t.cls === 'away' ? '다른 앱으로 나갔어요' : '…'));
  }
}

function renderStats() {
  if (!st.assignment) return;
  let ok = 0, no = 0, done = 0, wip = 0, away = 0, late = 0;
  for (const s of boardStudents()) {
    const t = tileState(s).cls;
    if (t === 'ok') ok++; else if (t === 'no') no++; else if (t === 'done') done++;
    else if (t === 'wip') wip++; else if (t === 'away') away++; else if (t === 'late') late++;
  }
  const sent = ok + no + done;
  const box = $('#board-stats');
  box.innerHTML = '';
  box.appendChild(h('span', null, h('b', { style: { fontSize: '20px', color: 'var(--teal)' } }, sent), ` / ${boardStudents().length}명 냈어요`));
  const item = (color, label, n, ring) => h('span', null,
    h('span', { class: 'dot', style: ring ? { border: '2px solid #A9A392' } : { background: color } }), `${label} ${n}`);
  if (st.key) { box.appendChild(item('var(--teal)', '맞았어요', ok)); box.appendChild(item('var(--orange)', '다시 볼까요', no)); }
  if (st.assignment.accepting) box.appendChild(item(null, '푸는 중', wip, true));
  if (late) box.appendChild(item('#64748B', '마감 때 거둠', late));
  if (away) box.appendChild(item('var(--red)', '나갔어요', away));
}

function paintView() {
  $('#view-grid').setAttribute('aria-pressed', st.view === 'grid' ? 'true' : 'false');
  $('#view-one').setAttribute('aria-pressed', st.view === 'one' ? 'true' : 'false');
  $('#tiles').hidden = st.view !== 'grid';
  $('#one').hidden = st.view !== 'one';
  if (st.view === 'grid') { $('#tiles').dataset.aid = ''; renderTiles(); }
  else renderOne();
}
$('#view-grid').addEventListener('click', () => { st.view = 'grid'; paintView(); });
$('#view-one').addEventListener('click', () => {
  st.view = 'one';
  if (!st.oneId || !st.subs.has(st.oneId)) st.oneId = firstSubmitted();
  paintView();
});
window.addEventListener('resize', () => { if (st.view === 'grid') renderTiles(); });

// =====================================================================
// 한 명 보기 · 도장 · 한마디
// =====================================================================
function submittedOrder() { return st.sessionStudents.filter((s) => st.subs.has(s.id)); }
function firstSubmitted() { const l = submittedOrder(); return l[0] ? l[0].id : null; }

function openOne(studentId) {
  if (!st.subs.has(studentId)) { toast('아직 안 냈어요'); return; }
  st.oneId = studentId;
  st.view = 'one';
  paintView();
}

let oneSheet = null;
function renderOne() {
  if (oneSheet) { oneSheet.destroy(); oneSheet = null; }
  const list = submittedOrder();
  const s = st.sessionStudents.find((x) => x.id === st.oneId);
  const sub = s && st.subs.get(s.id);
  $('#one-prev').disabled = list.length < 2;
  $('#one-next').disabled = list.length < 2;
  if (!s || !sub) {
    $('#one-name').textContent = '아직 낸 학생이 없어요';
    $('#one-sub').textContent = '';
    $('#one-stamp').innerHTML = '';
    $('#fb-send').disabled = true;
    return;
  }
  $('#fb-send').disabled = false;
  $('#one-name').textContent = who(s);
  const time = new Date(sub.updated_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  $('#one-sub').textContent = `${time}에 냈어요 · ${list.length}명 중 ${list.indexOf(s) + 1}번째`;
  oneSheet = renderSheet($('#one-sheet'), st.assignment.content, { answer: sub.answer, correctIndex: st.key ? st.key.correct : null, mapTargets: st.key ? st.key.targets : null });

  const fb = st.fbs.get(sub.id);
  st.pickStamp = fb ? fb.stamp : null;
  $('#fb-text').value = fb ? (fb.comment || '') : '';
  $('#fb-send').textContent = `${s.name}에게 돌려주기`;
  paintStamps();
}

function paintStamps() {
  const box = $('#stamp-picks');
  box.innerHTML = '';
  for (const sp of STAMPS) {
    const on = st.pickStamp === sp.key;
    box.appendChild(h('button', {
      type: 'button', class: 'stamp-pick', 'aria-pressed': on ? 'true' : 'false',
      style: on ? { borderColor: sp.color } : null,
      onclick: () => { st.pickStamp = on ? null : sp.key; paintStamps(); },
    }, h('span', { class: 'ring', style: { color: sp.color } }, sp.short), h('span', { class: 'lb' }, sp.label)));
  }
  const holder = $('#one-stamp');
  holder.innerHTML = '';
  if (st.pickStamp) holder.appendChild(stampEl(st.pickStamp));
}

function stepOne(dir) {
  const list = submittedOrder();
  if (!list.length) return;
  let i = list.findIndex((s) => s.id === st.oneId);
  i = (i + dir + list.length) % list.length;
  st.oneId = list[i].id;
  renderOne();
}
$('#one-prev').addEventListener('click', () => stepOne(-1));
$('#one-next').addEventListener('click', () => stepOne(1));
document.addEventListener('keydown', (e) => {
  if (st.view !== 'one' || $('#v-live').hidden || !$('#modal').hidden) return;
  if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') stepOne(-1);
  if (e.key === 'ArrowRight') stepOne(1);
});

$('#fb-send').addEventListener('click', async () => {
  const sub = st.subs.get(st.oneId);
  if (!sub) return;
  const comment = $('#fb-text').value.trim();
  if (!st.pickStamp && !comment) { toast('도장이나 한마디를 골라 주세요'); return; }
  const { data, error } = await sb.from('feedback').upsert({
    submission_id: sub.id, stamp: st.pickStamp, comment: comment || null,
  }, { onConflict: 'submission_id' }).select().single();
  if (error) { toast(errMsg(error)); return; }
  st.fbs.set(sub.id, data);
  toast('돌려줬어요');
  // 다음 학생으로
  const list = submittedOrder();
  const i = list.findIndex((s) => s.id === st.oneId);
  if (i < list.length - 1) { st.oneId = list[i + 1].id; renderOne(); }
});

$('#one-tv').addEventListener('click', () => {
  const el = $('#one-sheet-wrap');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen();
});

init().catch((e) => { show('v-auth'); toast(errMsg(e)); });
