// 다모아 학생 태블릿
import { makeClient, h, $, toast, errMsg, stampEl } from './common.js?v=202611071223';
import { renderSheet } from './sheet.js?v=202611071223';

const sb = makeClient('student');
const CLAIM_KEY = 'damoa-claim';
const NAME_COLORS = ['#FFE3C2', '#D6F0E0', '#DCE8FF', '#FBE0EA', '#EDE3FF', '#FFF1B8'];

const st = {
  code: null,
  claim: null,          // {code, sessionId, studentId, name, number}
  session: null,
  assignmentId: undefined, // undefined = 아직 아무 화면도 안 띄움
  assignment: null,
  submissionId: null,
  sheet: null,
  channel: null,
  beat: null,
  rosterTimer: null,
  sending: false,
};

// ---------------- 화면 전환 ----------------
const screens = ['v-code', 'v-names', 'v-wait', 'v-work'];
function show(id) {
  for (const s of screens) $('#' + s).hidden = s !== id;
  $('#ov-loading').hidden = true;
  if (id !== 'v-names') stopRosterPolling();
}
function overlay(id, on) { $('#' + id).hidden = !on; }

function loadClaim() {
  try { return JSON.parse(localStorage.getItem(CLAIM_KEY) || 'null'); } catch (_) { return null; }
}
function saveClaim(c) {
  st.claim = c;
  try {
    if (c) localStorage.setItem(CLAIM_KEY, JSON.stringify(c));
    else localStorage.removeItem(CLAIM_KEY);
  } catch (_) {}
}

// ---------------- 시작 ----------------
async function init() {
  const params = new URLSearchParams(location.search);
  const fromUrl = (params.get('c') || '').replace(/\D/g, '');
  const claim = loadClaim();
  st.code = fromUrl || (claim && claim.code) || null;

  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      const { error } = await sb.auth.signInAnonymously();
      if (error) throw error;
    }
  } catch (e) {
    $('#ov-loading').hidden = true;
    toast('연결하지 못했어요. ' + errMsg(e), 6000);
    show('v-code');
    return;
  }

  if (claim && claim.code === st.code && (await enterSession(claim)) === true) return;
  if (claim && claim.code !== st.code) saveClaim(null);

  if (st.code) await showNames(st.code);
  else show('v-code');
}

$('#code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#code-input').value.replace(/\D/g, '');
  if (code.length !== 6) { toast('6자리 숫자를 넣어요'); return; }
  st.code = code;
  history.replaceState(null, '', '?c=' + code);
  await showNames(code);
});

// ---------------- 이름 고르기 ----------------
async function showNames(code) {
  const { data, error } = await sb.rpc('session_roster', { p_code: code });
  if (error) {
    toast(errMsg(error), 5000);
    show('v-code');
    $('#code-input').value = code;
    return;
  }
  renderNames(data || []);
  show('v-names');
  startRosterPolling(code);
}

function renderNames(rows) {
  $('#names-title').textContent = (rows[0] && rows[0].session_title) || '수업에 들어가요';
  const grid = $('#names-grid');
  grid.innerHTML = '';
  const n = rows.length;
  const cols = n > 30 ? 7 : 6;
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  rows.forEach((r, i) => {
    grid.appendChild(h('button', {
      type: 'button',
      class: 'name-btn',
      disabled: r.taken,
      style: { background: NAME_COLORS[i % NAME_COLORS.length] },
      'aria-label': `${r.number}번 ${r.name}${r.taken ? ', 이미 들어왔어요' : ''}`,
      onclick: () => pickName(r),
    }, h('span', { class: 'no' }, r.number + '번'), h('span', { class: 'nm' }, r.name)));
  });
}

function startRosterPolling(code) {
  stopRosterPolling();
  st.rosterTimer = setInterval(async () => {
    const { data, error } = await sb.rpc('session_roster', { p_code: code });
    if (!error && data) renderNames(data);
  }, 4000);
}
function stopRosterPolling() { if (st.rosterTimer) { clearInterval(st.rosterTimer); st.rosterTimer = null; } }

// 들어가지 못했을 때 이유를 화면에 남겨 둬요 (선생님이 보고 알려 줄 수 있게)
function showProblem(friendly, detail) {
  let box = $('#problem');
  if (!box) {
    box = h('div', { id: 'problem', role: 'alert' });
    $('#v-names').appendChild(box);
  }
  box.innerHTML = '';
  box.appendChild(h('b', null, friendly));
  if (detail) box.appendChild(h('div', { class: 'problem-detail' }, detail));
  box.hidden = false;
}

async function pickName(r) {
  // 첫 터치에 전체 화면으로 (주소창이 사라져서 더 넓게 써요)
  try { if (!document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_) {}
  if ($('#problem')) $('#problem').hidden = true;
  let step = '이름 고르기';
  try {
    const { data, error } = await sb.rpc('claim_student', { p_code: st.code, p_student: r.student_id });
    if (error) {
      showProblem(errMsg(error), `[${step}] ${error.code || ''} ${error.message || ''}`);
      showNames(st.code);
      return;
    }
    step = '수업 불러오기';
    const claim = { code: st.code, sessionId: data, studentId: r.student_id, name: r.name, number: r.number };
    saveClaim(claim);
    const why = await enterSession(claim);
    if (why !== true) {
      showProblem('수업에 들어가지 못했어요. 이 글자를 선생님께 보여 주세요.', `[${step}] ${why}`);
      saveClaim(null);
      showNames(st.code);
    }
  } catch (e) {
    showProblem('수업에 들어가지 못했어요. 이 글자를 선생님께 보여 주세요.', `[${step}] ${e && (e.stack || e.message || e)}`);
  }
}

// ---------------- 수업 안 ----------------
// 성공하면 true, 실패하면 그 이유(글자)를 돌려줘요
async function enterSession(claim) {
  const { data: s, error } = await sb.from('sessions').select('*').eq('id', claim.sessionId).maybeSingle();
  if (error) return 'sessions: ' + (error.code || '') + ' ' + error.message;
  if (!s) return 'sessions: 수업이 안 보여요 (id ' + claim.sessionId + ')';
  st.claim = claim;
  if (!(await stillJoined())) { st.claim = null; return 'participants: 내 입장 기록이 안 보여요'; }

  const label = `${claim.number}번 ${claim.name}`;
  $('#wait-name').textContent = label;
  $('#work-name').textContent = label;

  subscribe(claim.sessionId);
  startHeartbeat();
  await applySession(s);
  return true;
}

async function stillJoined() {
  const { data, error } = await sb.from('session_participants')
    .select('student_id').eq('session_id', st.claim.sessionId).maybeSingle();
  if (error) return true; // 잠깐 끊긴 것일 수 있으니 그대로 둠
  return !!data;
}

function subscribe(sid) {
  if (st.channel) sb.removeChannel(st.channel);
  st.channel = sb.channel('stu-' + sid)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: 'id=eq.' + sid },
      (p) => applySession(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' },
      (p) => { if (p.new && p.new.submission_id === st.submissionId) showFeedback(p.new); })
    .subscribe();
}

function startHeartbeat() {
  if (st.beat) clearInterval(st.beat);
  const beat = async () => {
    if (!st.claim) return;
    await sb.rpc('heartbeat', { p_session: st.claim.sessionId, p_in_app: !document.hidden });
    if (!(await stillJoined())) kicked();
  };
  st.beat = setInterval(beat, 8000);
  beat();
}

document.addEventListener('visibilitychange', () => {
  if (!st.claim) return;
  sb.rpc('heartbeat', { p_session: st.claim.sessionId, p_in_app: !document.hidden });
  if (!document.hidden) refreshSession();
});

async function refreshSession() {
  if (!st.claim) return;
  const { data } = await sb.from('sessions').select('*').eq('id', st.claim.sessionId).maybeSingle();
  if (data) applySession(data);
}

function kicked() {
  cleanup();
  saveClaim(null);
  toast('선생님이 이름을 다시 고르라고 하셨어요');
  showNames(st.code);
}

function cleanup() {
  if (st.beat) clearInterval(st.beat);
  st.beat = null;
  if (st.channel) sb.removeChannel(st.channel);
  st.channel = null;
  if (st.sheet) st.sheet.destroy();
  st.sheet = null;
  st.assignmentId = undefined;
  overlay('ov-front', false);
  overlay('ov-lock', false);
  overlay('ov-feedback', false);
}

async function applySession(s) {
  st.session = s;
  if (s.status === 'ended') {
    cleanup();
    saveClaim(null);
    overlay('ov-ended', true);
    $('#ov-loading').hidden = true;
    return;
  }
  overlay('ov-front', s.screen_mode === 'look_front');
  overlay('ov-lock', s.screen_mode === 'locked');

  if (s.current_assignment_id !== st.assignmentId) {
    await loadAssignment(s.current_assignment_id);
  }
}

// ---------------- 문제 한 장 ----------------
const draftKey = (aid) => 'damoa-draft-' + aid;

async function loadAssignment(aid) {
  if (st.sheet) { st.sheet.destroy(); st.sheet = null; }
  st.assignmentId = aid;
  st.assignment = null;
  st.submissionId = null;
  $('#sent-badge').hidden = true;
  overlay('ov-feedback', false);

  if (!aid) { show('v-wait'); return; }

  const { data: a, error } = await sb.from('assignments').select('id, title, kind, content, accepting').eq('id', aid).maybeSingle();
  if (error || !a) { show('v-wait'); return; }
  if (st.assignmentId !== aid) return; // 그새 다른 문제가 옴
  st.assignment = a;

  // 이미 낸 답안이 있으면 이어서
  const { data: sub } = await sb.from('submissions').select('id, answer, updated_at')
    .eq('assignment_id', aid).maybeSingle();
  let answer = sub ? sub.answer : null;
  if (sub) { st.submissionId = sub.id; $('#sent-badge').hidden = false; }

  // 아직 안 낸 그림·글은 태블릿에 임시 저장해 둔 것으로
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(aid)) || 'null');
    if (d && (!sub || d.t > Date.parse(sub.updated_at))) answer = d.a;
  } catch (_) {}

  show('v-work');
  let saveT = null;
  st.sheet = renderSheet($('#sheet-host'), a.content || {}, {
    interactive: true,
    answer,
    onChange: () => {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        try { localStorage.setItem(draftKey(aid), JSON.stringify({ t: Date.now(), a: st.sheet.getAnswer() })); } catch (_) {}
      }, 400);
    },
  });
  applyTool();

  if (st.submissionId) {
    const { data: fb } = await sb.from('feedback').select('*').eq('submission_id', st.submissionId).maybeSingle();
    if (fb) showFeedback(fb, true);
  }
}

// ---------------- 펜 도구 ----------------
const tool = { kind: 'pen', color: '#1D4ED8' };
function applyTool() {
  if (!st.sheet) return;
  st.sheet.ink.setTool(tool.kind);
  st.sheet.ink.color = tool.color;
}
document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => {
  tool.kind = b.dataset.tool;
  document.querySelectorAll('.tool[data-tool]').forEach((x) => {
    x.classList.toggle('on', x === b);
    x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
  });
  applyTool();
}));
document.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
  tool.color = b.dataset.color;
  tool.kind = 'pen';
  document.querySelectorAll('.swatch').forEach((x) => {
    x.classList.toggle('on', x === b);
    x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
  });
  document.querySelectorAll('.tool[data-tool]').forEach((x) => {
    const on = x.dataset.tool === 'pen';
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  applyTool();
}));
$('#undo').addEventListener('click', () => { if (st.sheet) st.sheet.ink.undo(); });

// ---------------- 전송 ----------------
$('#send').addEventListener('click', async () => {
  if (!st.sheet || !st.assignment || st.sending) return;
  if (!st.sheet.hasWork()) { toast('아직 아무것도 안 했어요'); return; }
  st.sending = true;
  $('#send').disabled = true;
  const aid = st.assignment.id;
  const { data, error } = await sb.from('submissions').upsert({
    assignment_id: aid,
    session_id: st.claim.sessionId,
    student_id: st.claim.studentId,
    answer: st.sheet.getAnswer(),
  }, { onConflict: 'assignment_id,student_id' }).select('id').single();
  st.sending = false;
  $('#send').disabled = false;
  if (error) { toast(errMsg(error)); return; }
  st.submissionId = data.id;
  try { localStorage.removeItem(draftKey(aid)); } catch (_) {}
  $('#sent-badge').hidden = false;
  toast('선생님께 보냈어요!');
});

// ---------------- 도장 받기 ----------------
const seenKey = 'damoa-fb-seen';
let fbSheet = null;
async function showFeedback(fb, onlyIfNew) {
  if (!fb || (!fb.stamp && !fb.comment)) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(seenKey) || '{}'); } catch (_) {}
  if (onlyIfNew && seen[fb.id] === fb.updated_at) return;

  // 도장
  const holder = $('#fb-stamp');
  holder.innerHTML = '';
  const s = fb.stamp ? stampEl(fb.stamp) : null;
  if (s) holder.appendChild(s);
  $('.fb-title').textContent = s ? '선생님이 도장을 찍어 주셨어요!' : '선생님이 한마디 남기셨어요!';

  // 한마디
  $('#fb-comment').textContent = fb.comment || '';
  $('#fb-comment-wrap').hidden = !fb.comment;

  // 내가 보낸 답 (선생님께 간 그대로)
  if (fbSheet) { fbSheet.destroy(); fbSheet = null; }
  overlay('ov-feedback', true);
  if (st.assignment) {
    const { data: sub } = await sb.from('submissions').select('answer').eq('id', fb.submission_id).maybeSingle();
    const answer = sub ? sub.answer : (st.sheet ? st.sheet.getAnswer() : {});
    if (!$('#ov-feedback').hidden) fbSheet = renderSheet($('#fb-sheet'), st.assignment.content || {}, { answer });
  }

  $('#fb-ok').onclick = () => {
    seen[fb.id] = fb.updated_at;
    try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch (_) {}
    overlay('ov-feedback', false);
    if (fbSheet) { fbSheet.destroy(); fbSheet = null; }
  };
}

$('#not-me').addEventListener('click', async () => {
  if (st.claim) await sb.rpc('leave_session', { p_session: st.claim.sessionId });
  cleanup();
  saveClaim(null);
  showNames(st.code);
});

init();
