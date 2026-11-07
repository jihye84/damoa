import { createClient } from '../vendor/supabase.js?v=202611072148';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202611072148';

// 선생님 PC와 학생 태블릿의 로그인을 따로 보관 (같은 기기에서 둘 다 열어도 섞이지 않게)
export function makeClient(role) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: 'damoa-' + role, persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });
}

// 작은 DOM 도우미: h('div', {class:'x', onclick: fn}, '글자', 자식요소)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, ms = 2600) {
  let box = $('#toast');
  if (!box) {
    box = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('show'), ms);
}

const ERRORS = {
  name_taken: '이미 친구가 쓰는 이름이에요. 다른 이름을 써요.',
  no_session: '열려 있는 수업을 찾지 못했어요.',
  entry_closed: '입장이 마감됐어요. 선생님께 말해요.',
  taken: '이미 친구가 고른 이름이에요.',
  no_student: '명렬표에 없는 이름이에요.',
  wrong_picture: '그림이 달라요. 다시 골라 봐요.',
  not_joined: '먼저 내 이름을 골라요.',
  assignment_closed: '이 문제는 이제 낼 수 없어요.',
  screen_locked: '지금은 화면이 잠겨 있어요.',
  session_ended: '수업이 끝났어요.',
  teacher_only: '선생님만 할 수 있어요.',
  bad_name: '이름은 1~12글자로 써요.',
  roster_only: '이 수업은 명렬표에서 이름을 골라요.',
  'Invalid login credentials': '이메일이나 비밀번호가 맞지 않아요.',
  'Email not confirmed': '이메일 인증을 먼저 해 주세요. 받은편지함을 확인해 주세요.',
  'User already registered': '이미 가입된 이메일이에요. 로그인해 주세요.',
};

export function errMsg(err) {
  const m = (err && (err.message || err.error_description || String(err))) || '알 수 없는 오류';
  for (const [k, v] of Object.entries(ERRORS)) if (m.includes(k)) return v;
  if (/fetch|network/i.test(m)) return '인터넷 연결을 확인해 주세요.';
  return m;
}

export const STAMPS = [
  { key: 'great', short: '참', label: '참 잘했어요', color: '#C2410C' },
  { key: 'best', short: '최고', label: '최고예요', color: '#0F766E' },
  { key: 'effort', short: '힘!', label: '노력했어요', color: '#1D4ED8' },
  { key: 'retry', short: '다시', label: '다시 해 볼까요', color: '#6D28D9' },
];
export const stampOf = (key) => STAMPS.find((s) => s.key === key) || null;

// 도장 모양 (선생님·학생 화면 공용)
export function stampEl(key, cls = 'stamp') {
  const s = stampOf(key);
  if (!s) return null;
  const words = s.label.split(' ');
  const lines = words.length > 1 ? [words[0], words.slice(1).join(' ')] : [s.label];
  return h('div', { class: cls, role: 'img', 'aria-label': '도장: ' + s.label, style: { color: s.color, borderColor: s.color } },
    ...lines.map((l) => h('span', null, l)));
}

// 화면에 보이는 학생 이름: 명렬표 학생은 "3번 다겸", 이름을 쓰고 들어온 학생은 이름만
export function who(s) { return s.number > 0 ? `${s.number}번 ${s.name}` : s.name; }

// 별명 만들어 주기
const NICK_A = ['반짝이는', '용감한', '느긋한', '씩씩한', '졸린', '신나는', '수줍은', '똑똑한', '배고픈', '노래하는',
  '춤추는', '꿈꾸는', '웃는', '날쌘', '튼튼한', '다정한', '호기심 많은', '부지런한', '엉뚱한', '빛나는'];
const NICK_B = ['수달', '판다', '고래', '다람쥐', '펭귄', '여우', '부엉이', '코알라', '햄스터', '거북이', '고슴도치',
  '토끼', '돌고래', '사자', '기린', '해달', '알파카', '참새', '두더지', '물개', '너구리', '오리', '곰', '호랑이'];
export function makeNickname() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (;;) {
    const n = `${pick(NICK_A)} ${pick(NICK_B)}`;
    if (n.length <= 12) return n;
  }
}

export const KINDS = {
  choice4: '4지선다',
  blank: '빈 답지',
  essay: '서술형',
  map: '지도',
  song: '작곡',
  shapes: '모양 그림판',
  clock: '모형 시계',
  tens: '십 배열판 · 수 모형',
  vmath: '세로셈',
  numline: '수직선',
  fraction: '분수 색칠판',
  bargraph: '막대그래프',
  geoboard: '점판',
};

// 백지도 (maps/<id>.json)
export const MAPS = [
  { id: 'jungnang', name: '중랑구' },
  { id: 'seoul', name: '서울특별시' },
  { id: 'korea', name: '대한민국' },
  { id: 'peninsula', name: '한반도' },
  { id: 'asia', name: '아시아' },
  { id: 'world', name: '세계' },
];

export function joinUrl(code) {
  const base = location.href.replace(/[^/]*([?#].*)?$/, '');
  return base + 'join.html?c=' + encodeURIComponent(code);
}
