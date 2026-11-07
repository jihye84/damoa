// 다모아 학생 태블릿
import { makeClient, h, $, toast, errMsg, stampEl } from './common.js?v=202611071603';
import { renderSheet } from './sheet.js?v=202611071603';

const sb = makeClient('student');
const CLAIM_KEY = 'damoa-claim';
const NAME_COLORS = ['#FFE3C2', '#D6F0E0', '#DCE8FF', '#FBE0EA', '#EDE3FF', '#FFF1B8'];

const st = {
  code: null,
  claim: null,          // {code, sessionId, studentId, name, number}
  session: null,
  assignmentId: undefined, // undefined = 아직 아무 화면도 안 띄움
  loaded: false,
  asgs: new Map(),      // 이 수업에서 받은 장들
  mySubs: new Map(),    // assignment_id → 내가 낸 답
  editing: null,        // '내 답 고치기'로 다시 연 장
  assignment: null,
  submissionId: null,
  sheet: null,
  channel: null,
  beat: null,
  rosterTimer: null,
  sending: false,
};

// ---------------- 화면 전환 ----------------
const screens = ['v-code', 'v-names', 'v-wait', 'v-work', 'v-garden'];
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: 'session_id=eq.' + sid },
      (p) => { if (p.new && p.new.id) onAssignment(p.new, p.eventType); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' },
      (p) => { if (p.new && mySubIds().has(p.new.submission_id)) showFeedback(p.new); })
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
  if (data) await applySession(data);
  await loadQueue(); // 화면이 꺼져 있던 동안 놓친 것 다시 받기
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
  st.loaded = false;
  st.asgs = new Map();
  st.mySubs = new Map();
  st.editing = null;
  stopGarden();
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
  if (!st.loaded) { st.loaded = true; await loadQueue(); }
}

// =====================================================================
// 여러 장 순서 규칙
//  - 새로 온 장이 맨 위 → 전송하면 아직 안 낸 이전 장 → 다 냈으면 꽃밭
//  - 선생님이 마감하면 그 장은 사라지고, 쓰던 것은 자동으로 거둬 가요
// =====================================================================
const draftKey = (aid) => 'damoa-draft-' + aid;
const byNewest = (x, y) => Date.parse(y.sent_at) - Date.parse(x.sent_at);
function mySubIds() { return new Set([...st.mySubs.values()].map((v) => v.id)); }
function pending() {
  return [...st.asgs.values()].filter((a) => a.accepting && !st.mySubs.has(a.id)).sort(byNewest);
}
function readDraft(aid) {
  try { return JSON.parse(localStorage.getItem(draftKey(aid)) || 'null'); } catch (_) { return null; }
}
function answerHasWork(a) {
  if (!a) return false;
  return (a.strokes && a.strokes.length > 0) || typeof a.choice === 'number' || (a.text && a.text.trim().length > 0)
    || (a.fills && Object.keys(a.fills).length > 0);
}

async function loadQueue() {
  if (!st.claim) return;
  const sid = st.claim.sessionId;
  const [{ data: asgs }, { data: subs }] = await Promise.all([
    sb.from('assignments').select('id, title, kind, content, accepting, sent_at, closed_at').eq('session_id', sid).order('sent_at'),
    sb.from('submissions').select('id, assignment_id, answer, updated_at, auto_collected').eq('session_id', sid),
  ]);
  st.asgs = new Map((asgs || []).map((a) => [a.id, a]));
  st.mySubs = new Map((subs || []).map((x) => [x.assignment_id, x]));
  // 화면이 꺼져 있는 동안 마감된 장의 쓰던 것도 거둬 보기 (2분 안이면 받아 줘요)
  for (const a of st.asgs.values()) {
    if (!a.accepting && !st.mySubs.has(a.id) && answerHasWork((readDraft(a.id) || {}).a)) await autoCollect(a.id);
  }
  route();
}

async function onAssignment(row, event) {
  const prev = st.asgs.get(row.id);
  st.asgs.set(row.id, Object.assign({}, prev || {}, row));
  if (event === 'INSERT' || !prev) {
    st.editing = null;               // 새 장이 오면 그걸 먼저
    route();
    return;
  }
  if (prev.accepting && !row.accepting) {
    // 마감! 아직 안 냈으면 쓰던 것을 거둬 가요
    if (!st.mySubs.has(row.id)) {
      const shown = st.assignmentId === row.id && st.sheet;
      const answer = shown ? st.sheet.getAnswer() : (readDraft(row.id) || {}).a;
      if (answerHasWork(answer)) await autoCollect(row.id, answer);
      else if (shown) toast('이 문제는 끝났어요');
    } else if (st.editing === row.id) {
      toast('이 문제는 끝났어요');
    }
    if (st.editing === row.id) st.editing = null;
  }
  route();
}

async function autoCollect(aid, answer) {
  answer = answer || (readDraft(aid) || {}).a;
  if (!answerHasWork(answer)) return;
  const { data, error } = await sb.from('submissions').insert({
    assignment_id: aid,
    session_id: st.claim.sessionId,
    student_id: st.claim.studentId,
    answer,
    auto_collected: true,
  }).select('id, assignment_id, answer, updated_at, auto_collected').single();
  if (error) return;
  st.mySubs.set(aid, data);
  try { localStorage.removeItem(draftKey(aid)); } catch (_) {}
  toast('시간이 다 돼서 선생님이 거둬 가셨어요');
}

function route(opts = {}) {
  const list = pending();
  let target = null;
  const ed = st.editing && st.asgs.get(st.editing);
  if (ed && ed.accepting) target = ed.id;
  else { st.editing = null; target = list[0] ? list[0].id : null; }

  // 남은 장 수 (지금 보는 장 빼고)
  const more = list.filter((a) => a.id !== target).length;
  $('#pile').hidden = more === 0;
  $('#pile-n').textContent = more;

  if (target) {
    if (target !== st.assignmentId || !st.sheet) {
      const older = opts.afterSend && list.length > 0;
      openSheet(target);
      if (older) backNotice();
    }
    return;
  }
  if (st.asgs.size === 0) {
    destroySheet();
    st.assignmentId = null;
    show('v-wait');
    return;
  }
  showGarden();
}

function destroySheet() {
  if (st.sheet) { st.sheet.destroy(); st.sheet = null; }
}

function backNotice() {
  const n = $('#back-notice');
  n.hidden = false;
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.hidden = true; }, 2600);
}

function openSheet(aid) {
  stopGarden();
  destroySheet();
  const a = st.asgs.get(aid);
  st.assignmentId = aid;
  st.assignment = a;
  const sub = st.mySubs.get(aid);
  st.submissionId = sub ? sub.id : null;
  $('#sent-badge').hidden = !sub;

  let answer = sub ? sub.answer : null;
  const d = readDraft(aid);
  if (d && (!sub || d.t > Date.parse(sub.updated_at))) answer = d.a;

  show('v-work');
  let saveT = null;
  st.sheet = renderSheet($('#sheet-host'), a.content || {}, {
    interactive: true,
    answer,
    getFill: () => ({ color: tool.color, erase: tool.kind === 'eraser' }),
    onChange: () => {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        if (st.assignmentId !== aid || !st.sheet) return;
        try { localStorage.setItem(draftKey(aid), JSON.stringify({ t: Date.now(), a: st.sheet.getAnswer() })); } catch (_) {}
      }, 300);
    },
  });
  applyTool();
  if (sub) checkFeedback(sub.id);
}

async function checkFeedback(subId) {
  const { data: fb } = await sb.from('feedback').select('*').eq('submission_id', subId).maybeSingle();
  if (fb) showFeedback(fb, true);
}

// =====================================================================
// 우리 반 꽃밭 (다 낸 뒤 기다리는 화면)
// =====================================================================
const PETALS = ['#F9A8D4', '#FCD34D', '#A5B4FC', '#FDBA74', '#86EFAC', '#C4B5FD', '#FCA5A5', '#67E8F9'];
const garden = { timer: null, aid: null, count: -1, bloomed: -1 };

function stopGarden() {
  if (garden.timer) { clearInterval(garden.timer); garden.timer = null; }
}

function showGarden() {
  destroySheet();
  st.assignmentId = null;
  // 가장 최근에 낸 장을 기준으로 숫자를 세요
  const mine = [...st.asgs.values()].filter((a) => st.mySubs.has(a.id)).sort(byNewest)[0]
    || [...st.asgs.values()].sort(byNewest)[0];
  garden.aid = mine ? mine.id : null;
  const canEdit = mine && mine.accepting && st.mySubs.has(mine.id);
  $('#edit-mine').hidden = !canEdit;
  $('#edit-mine').onclick = () => { st.editing = mine.id; route(); };
  show('v-garden');
  stopGarden();
  tickGarden();
  garden.timer = setInterval(tickGarden, 3000);
  // 이 장에 받은 도장이 있으면 보여 주기
  const sub = mine && st.mySubs.get(mine.id);
  if (sub) checkFeedback(sub.id);
}

async function tickGarden() {
  if (!st.claim || !garden.aid) return;
  const { data, error } = await sb.rpc('session_progress', { p_session: st.claim.sessionId, p_assignment: garden.aid });
  if (error || !data) return;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return;
  drawGarden(Math.max(row.joined, row.submitted, 1), Math.max(row.submitted, 1));
}

function flowerSvg(color, i) {
  const petals = [0, 60, 120, 180, 240, 300].map((deg) =>
    `<ellipse cx="0" cy="-15" rx="8.5" ry="13" fill="${color}" transform="rotate(${deg})"/>`).join('');
  const lean = ((i * 37) % 9) - 4;
  return `<svg viewBox="-40 -50 80 130" aria-hidden="true">
    <path d="M0 6 C ${lean} 30, ${-lean} 55, 0 78" stroke="#4D9A53" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M0 50 C -14 40, -22 46, -24 52 C -14 56, -6 54, 0 50 Z" fill="#6BBF59"/>
    <path d="M0 40 C 14 30, 22 36, 24 42 C 14 46, 6 44, 0 40 Z" fill="#6BBF59"/>
    <g class="bud"><ellipse cx="0" cy="-2" rx="9" ry="13" fill="#7CC36B"/><path d="M-6 -4 Q0 -18 6 -4" fill="${color}" opacity="0.7"/></g>
    <g class="bloom">${petals}<circle r="9" fill="#FDE68A" stroke="#F59E0B" stroke-width="2"/></g>
  </svg>`;
}

function drawGarden(total, bloomed) {
  const bed = $('#garden-bed');
  if (garden.count !== total) {
    garden.count = total;
    garden.bloomed = -1;
    bed.innerHTML = '';
    const rows = total <= 8 ? 1 : total <= 20 ? 2 : 3;
    const cols = Math.max(4, Math.ceil(total / rows));
    bed.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    bed.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
    // 줄마다 반 칸씩 엇갈리게 심어요
    bed.dataset.rows = rows;
    for (let i = 0; i < total; i++) {
      const f = h('div', { class: 'flower' + (i === 0 ? ' mine' : ''), html: flowerSvg(PETALS[i % PETALS.length], i) });
      const row = Math.floor(i / Math.max(4, Math.ceil(total / (total <= 8 ? 1 : total <= 20 ? 2 : 3))));
      f.style.setProperty('--dx', ((row % 2 ? 22 : 0) + ((i * 53) % 9) - 4) + '%');
      f.style.setProperty('--delay', ((i * 0.37) % 2).toFixed(2) + 's');
      if (i === 0) f.appendChild(h('span', { class: 'flower-tag' }, '내 꽃'));
      bed.appendChild(f);
    }
  }
  if (garden.bloomed !== bloomed) {
    garden.bloomed = bloomed;
    [...bed.children].forEach((f, i) => f.classList.toggle('open', i < bloomed));
  }
  const all = bloomed >= total;
  $('#garden-count').textContent = `${total}명 중 ${Math.min(bloomed, total)}명이 보냈어요`;
  $('#garden-title').textContent = all ? '우리 반 생각이 다 모였어요!' : '선생님께 보냈어요!';
  $('#v-garden').classList.toggle('all', all);
}

// ---------------- 펜 도구 ----------------
let fingerSaved = false;
try { fingerSaved = localStorage.getItem('damoa-finger') === '1'; } catch (_) {}
const tool = { kind: 'pen', color: '#1D4ED8', finger: fingerSaved };
function applyTool() {
  if (!st.sheet) return;
  st.sheet.ink.setTool(tool.kind);
  st.sheet.ink.color = tool.color;
  st.sheet.ink.allowFinger = tool.finger;
  $('#kbd').hidden = !st.sheet.textarea;
  $('#v-work').classList.toggle('is-map', st.sheet.kind === 'map');
  if (st.sheet.kind === 'map') $('#foot-help').textContent = '펜이나 손가락으로 톡 누르면 색칠돼요';
  else $('#foot-help').textContent = tool.finger ? '손가락으로도 써져요. 선택지는 톡 눌러요' : '펜으로 쓰고, 손가락으로 골라요';
  paintMode();
}

// ---------- 지금 무엇으로 쓰는 중인지 ----------
function typing() {
  return !!(st.sheet && st.sheet.textarea && document.activeElement === st.sheet.textarea);
}
function paintMode() {
  const m = typing() ? 'kbd' : (tool.kind === 'eraser' ? 'eraser' : 'pen');
  const box = $('#mode');
  const isMap = !!(st.sheet && st.sheet.kind === 'map');
  box.className = 'mode mode-' + (isMap && m === 'pen' ? 'paint' : m);
  const pen = isMap ? '톡 눌러 색칠하는 중' : tool.finger ? '펜·손가락으로 쓰는 중' : '펜으로 쓰는 중';
  $('#mode-text').textContent = m === 'kbd' ? '키보드로 쓰는 중' : m === 'eraser' ? (isMap ? '톡 눌러 지우는 중' : '지우개로 지우는 중') : pen;
  $('#kbd').classList.toggle('on', m === 'kbd');
  $('#kbd').setAttribute('aria-pressed', m === 'kbd' ? 'true' : 'false');
  document.querySelectorAll('.tool[data-tool]').forEach((x) => {
    const on = m !== 'kbd' && x.dataset.tool === tool.kind;
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (st.sheet) st.sheet.sheet.classList.toggle('is-typing', m === 'kbd');
}
function leaveKeyboard() {
  if (typing()) st.sheet.textarea.blur();
}
$('#kbd').addEventListener('click', () => {
  if (!st.sheet || !st.sheet.textarea) return;
  if (typing()) { leaveKeyboard(); return; }
  const ta = st.sheet.textarea;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
});
// 글쓰기 칸에 들어가고 나올 때 표시를 바꿔요
$('#sheet-host').addEventListener('focusin', paintMode);
$('#sheet-host').addEventListener('focusout', () => setTimeout(paintMode, 0));
// 키보드로 쓰다가 펜을 대면 키보드를 내리고 펜으로 바꿔요
$('#sheet-host').addEventListener('pointerdown', (e) => {
  const inkable = e.pointerType === 'pen' || (tool.finger && e.pointerType === 'touch' && !e.target.closest('textarea, button'));
  if (inkable && typing()) { leaveKeyboard(); }
}, true);
// 손가락으로도 쓰기: S펜이 없거나 고무 펜(손가락처럼 인식됨)을 쓸 때 켜요
function paintFinger() {
  const b = $('#finger');
  b.classList.toggle('on', tool.finger);
  b.setAttribute('aria-pressed', tool.finger ? 'true' : 'false');
  $('#foot-help').textContent = tool.finger ? '손가락으로도 써져요. 선택지는 톡 눌러요' : '펜으로 쓰고, 손가락으로 골라요';
}
paintFinger();
$('#finger').addEventListener('click', () => {
  tool.finger = !tool.finger;
  try { localStorage.setItem('damoa-finger', tool.finger ? '1' : '0'); } catch (_) {}
  paintFinger();
  applyTool();
  paintMode();
  toast(tool.finger ? '이제 손가락으로도 써져요' : '이제 펜으로만 써져요');
});
document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => {
  tool.kind = b.dataset.tool;
  leaveKeyboard();
  document.querySelectorAll('.tool[data-tool]').forEach((x) => {
    x.classList.toggle('on', x === b);
    x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
  });
  applyTool();
}));
document.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
  tool.color = b.dataset.color;
  leaveKeyboard();
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
  }, { onConflict: 'assignment_id,student_id' }).select('id, assignment_id, answer, updated_at, auto_collected').single();
  st.sending = false;
  $('#send').disabled = false;
  if (error) { toast(errMsg(error)); return; }
  st.mySubs.set(aid, data);
  st.submissionId = data.id;
  try { localStorage.removeItem(draftKey(aid)); } catch (_) {}
  st.editing = null;
  toast('선생님께 보냈어요!');
  route({ afterSend: true });
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
  const mine = [...st.mySubs.values()].find((x) => x.id === fb.submission_id);
  const asg = mine && st.asgs.get(mine.assignment_id);
  if (asg) {
    const { data: sub } = await sb.from('submissions').select('answer').eq('id', fb.submission_id).maybeSingle();
    const answer = sub ? sub.answer : mine.answer;
    if (!$('#ov-feedback').hidden) fbSheet = renderSheet($('#fb-sheet'), asg.content || {}, { answer });
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
