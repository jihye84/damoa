// 다모아 선생님 PC
import { makeClient, h, $, toast, errMsg, STAMPS, stampOf, stampEl, KINDS, joinUrl } from './common.js';
import { renderSheet, isCorrect } from './sheet.js';
import { qrcode } from '../vendor/qrcode.mjs';

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
  channel: null,
  view: 'grid',             // grid | one
  oneId: null,              // 한 명 보기 중인 student_id
  pickStamp: null,
  tickTimer: null,
};

const views = ['v-auth', 'v-home', 'v-live'];
function show(id) {
  for (const v of views) $('#' + v).hidden = v !== id;
  $('#ov-loading').hidden = true;
}

// =====================================================================
// 대화상자
// =====================================================================
function openModal(title, body, buttons) {
  $('#modal-title').textContent = title;
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
  // 열려 있는 수업이 있으면 바로 이어서
  const { data: open } = await sb.from('sessions').select('*').eq('status', 'open')
    .order('created_at', { ascending: false }).limit(1);
  if (open && open[0]) {
    $('#resume-box').hidden = false;
    $('#resume').onclick = () => enterLive(open[0]);
  } else {
    $('#resume-box').hidden = true;
  }
  show('v-home');
}

// =====================================================================
// 홈: 반 · 명렬표 · 템플릿
// =====================================================================
async function loadHome() {
  const [{ data: classes }, { data: templates }] = await Promise.all([
    sb.from('classes').select('*').order('created_at'),
    sb.from('templates').select('id, title, kind, content, answer_key, updated_at').order('updated_at', { ascending: false }),
  ]);
  st.classes = classes || [];
  st.templates = templates || [];
  if (!st.classId || !st.classes.find((c) => c.id === st.classId)) {
    st.classId = st.classes[0] ? st.classes[0].id : null;
  }
  renderClasses();
  renderTemplates();
  await loadRoster();
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
      onclick: async () => { st.classId = c.id; renderClasses(); await loadRoster(); },
    }, h('span', { class: 'tname' }, c.name), h('span', { class: 'meta' }, c.school_year + '년')));
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
function renderTemplates() {
  const box = $('#template-list');
  box.innerHTML = '';
  if (!st.templates.length) {
    box.appendChild(h('div', { class: 'empty' }, '"+ 새 템플릿"으로 4지선다, 빈 답지, 서술형을 만들 수 있어요.'));
    return;
  }
  for (const t of st.templates) {
    box.appendChild(h('button', { type: 'button', class: 'list-item', onclick: () => editTemplate(t) },
      h('span', { class: 'tname' }, t.title), h('span', { class: 'meta' }, KINDS[t.kind] || t.kind)));
  }
}

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
  }).map(([k, [name, desc]]) => h('button', {
    type: 'button', class: 'kind-pick', 'aria-pressed': k === kind ? 'true' : 'false',
    onclick: () => { kind = k; paintKinds(); },
  }, h('b', null, name), h('span', null, desc)));
  const kindKeys = ['choice4', 'blank', 'essay'];
  function paintKinds() {
    kinds.forEach((b, i) => b.setAttribute('aria-pressed', kindKeys[i] === kind ? 'true' : 'false'));
    optBox.hidden = kind !== 'choice4';
    $('#tp-q-label') && ($('#tp-q-label').textContent = kind === 'blank' ? '안내 글 (없어도 돼요)' : '문제');
  }

  const body = h('div', { class: 'col', style: { gap: '14px' } },
    h('div', { class: 'kind-picks' }, ...kinds),
    h('div', { class: 'field' }, h('label', { for: 'tp-title' }, '템플릿 이름 (보관함에 보이는 이름)'), title),
    h('div', { class: 'field' }, h('label', { for: 'tp-q', id: 'tp-q-label' }, '문제'), q),
    optBox);

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
    const row = { title: title.value.trim() || content.question.slice(0, 30) || KINDS[kind], kind, content, answer_key };
    const res = t
      ? await sb.from('templates').update(row).eq('id', t.id).select().single()
      : await sb.from('templates').insert(row).select().single();
    if (res.error) { toast(errMsg(res.error)); return; }
    closeModal();
    await loadHome();
    if (afterSave) afterSave(res.data);
  } }, afterSave ? '저장하고 보내기' : '저장'));

  openModal(t ? '템플릿 고치기' : '새 템플릿', body, buttons);
  paintKinds();
}

// =====================================================================
// 수업 시작
// =====================================================================
$('#start-session').addEventListener('click', async () => {
  if (!st.classId) { toast('먼저 반을 만들어 주세요'); return; }
  if (!st.students.length) { toast('먼저 명렬표를 넣어 주세요'); return; }
  const { data, error } = await sb.rpc('start_session', { p_class: st.classId, p_title: $('#session-title').value.trim() });
  if (error) { toast(errMsg(error)); return; }
  await enterLive(data);
});

async function enterLive(session) {
  st.session = session;
  st.classId = session.class_id;
  const cls = st.classes.find((c) => c.id === session.class_id);
  $('#live-class').textContent = cls ? cls.name : '';
  $('#live-title').textContent = session.title || '';

  const { data: students } = await sb.from('students').select('*').eq('class_id', session.class_id).eq('active', true).order('number');
  st.sessionStudents = students || [];

  await reloadParticipants();
  subscribeLive();
  renderQR();
  paintControls();

  if (session.current_assignment_id) await loadAssignment(session.current_assignment_id);
  else { st.assignment = null; showLobby(true); }

  if (st.tickTimer) clearInterval(st.tickTimer);
  st.tickTimer = setInterval(() => { renderJoin(); if (st.view === 'grid') renderTiles(); }, 5000);
  show('v-live');
}

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
      (p) => { st.participants.set(p.new.student_id, p.new); renderJoin(); renderTile(p.new.student_id); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_participants', filter: 'session_id=eq.' + sid },
      (p) => { st.participants.set(p.new.student_id, p.new); renderJoin(); renderTile(p.new.student_id); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'session_participants' },
      () => reloadParticipants())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions', filter: 'session_id=eq.' + sid },
      (p) => {
        const s = p.new;
        if (!s || !st.assignment || s.assignment_id !== st.assignment.id) return;
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
  const n = st.sessionStudents.length;
  const cols = n > 30 ? 7 : 6;
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  let joined = 0;
  for (const s of st.sessionStudents) {
    const p = st.participants.get(s.id);
    if (p) joined++;
    const cls = p ? (isAway(p) ? 'join-chip out' : 'join-chip in') : 'join-chip';
    grid.appendChild(h('button', {
      type: 'button', class: cls,
      'aria-label': `${s.number}번 ${s.name}, ${p ? (isAway(p) ? '다른 앱으로 나감' : '들어왔어요') : '아직이에요'}`,
      onclick: () => p && kick(s),
    }, h('span', { class: 'no' }, s.number + '번'), h('span', { class: 'nm' }, s.name)));
  }
  $('#join-n').textContent = joined;
  $('#join-total').textContent = ` / ${n}명`;
}

async function kick(s) {
  if (!(await confirmBox('내보내기', `${s.number}번 ${s.name}을(를) 내보낼까요? 그 태블릿은 이름 고르기 화면으로 돌아가요.`, '내보내기'))) return;
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
    if (st.channel) sb.removeChannel(st.channel);
    if (st.tickTimer) clearInterval(st.tickTimer);
    st.session = null;
    await afterLogin();
    toast('수업을 끝냈어요. 수고하셨어요!');
  }
});

// ---------- 템플릿 보내기 ----------
$('#btn-send').addEventListener('click', () => {
  const list = h('div', { class: 'pick-list' });
  if (!st.templates.length) list.appendChild(h('div', { class: 'empty' }, '보관함이 비어 있어요. 아래에서 새로 만들어 보내세요.'));
  for (const t of st.templates) {
    list.appendChild(h('button', { type: 'button', class: 'list-item', onclick: () => { closeModal(); sendTemplate(t); } },
      h('span', { class: 'tname' }, t.title), h('span', { class: 'meta' }, KINDS[t.kind] || t.kind)));
  }
  const make = h('button', { type: 'button', class: 'btn', onclick: () => editTemplate(null, (t) => sendTemplate(t)) }, '+ 새로 만들어 보내기');
  openModal('어떤 템플릿을 보낼까요?', list, [make]);
});

async function sendTemplate(t) {
  const prev = st.assignment;
  const { data: a, error } = await sb.from('assignments').insert({
    session_id: st.session.id, template_id: t.id, title: t.title, kind: t.kind, content: t.content,
  }).select().single();
  if (error) { toast(errMsg(error)); return; }
  if (t.answer_key) await sb.from('assignment_keys').insert({ assignment_id: a.id, answer_key: t.answer_key });
  if (prev) await sb.from('assignments').update({ accepting: false }).eq('id', prev.id);
  await updateSession({ current_assignment_id: a.id, screen_mode: 'normal' });
  await loadAssignment(a.id);
  toast('아이들 태블릿에 보냈어요');
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
});

// =====================================================================
// 분할 보기
// =====================================================================
const tileSheets = new Map(); // student_id → {sheet, sig}

function tileState(s) {
  const p = st.participants.get(s.id);
  const sub = st.subs.get(s.id);
  if (sub) {
    const ok = isCorrect(st.assignment.kind, sub.answer, st.key);
    if (ok === true) return { cls: 'ok', badge: '맞았어요' };
    if (ok === false) return { cls: 'no', badge: '다시 볼까요' };
    return { cls: 'done', badge: '냈어요' };
  }
  if (!p) return { cls: 'absent', badge: '안 들어옴' };
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
  const list = st.sessionStudents;
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
        h('div', { class: 'tile-head' }, h('span', { class: 'tile-name' }, `${s.number}. ${s.name}`), h('span', { class: 'badge' })),
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
  el.setAttribute('aria-label', `${s.number}번 ${s.name}, ${t.badge}`);
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
      const sheet = renderSheet(host, st.assignment.content, { answer: sub.answer, correctIndex: st.key ? st.key.correct : null });
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
  let ok = 0, no = 0, done = 0, wip = 0, away = 0;
  for (const s of st.sessionStudents) {
    const t = tileState(s).cls;
    if (t === 'ok') ok++; else if (t === 'no') no++; else if (t === 'done') done++;
    else if (t === 'wip') wip++; else if (t === 'away') away++;
  }
  const sent = ok + no + done;
  const box = $('#board-stats');
  box.innerHTML = '';
  box.appendChild(h('span', null, h('b', { style: { fontSize: '20px', color: 'var(--teal)' } }, sent), ` / ${st.sessionStudents.length}명 냈어요`));
  const item = (color, label, n, ring) => h('span', null,
    h('span', { class: 'dot', style: ring ? { border: '2px solid #A9A392' } : { background: color } }), `${label} ${n}`);
  if (st.key) { box.appendChild(item('var(--teal)', '맞았어요', ok)); box.appendChild(item('var(--orange)', '다시 볼까요', no)); }
  box.appendChild(item(null, '푸는 중', wip, true));
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
  $('#one-name').textContent = `${s.number}번 ${s.name}`;
  const time = new Date(sub.updated_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  $('#one-sub').textContent = `${time}에 냈어요 · ${list.length}명 중 ${list.indexOf(s) + 1}번째`;
  oneSheet = renderSheet($('#one-sheet'), st.assignment.content, { answer: sub.answer, correctIndex: st.key ? st.key.correct : null });

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
