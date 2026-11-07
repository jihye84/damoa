// 링크 보내기: 선생님이 고른 사이트를 학생 태블릿에서 열어요
//  · 유튜브 · 구글 문서/슬라이드/설문은 다모아 화면 안에서 바로 (아이들이 앱 밖으로 나가지 않게)
//  · 그 밖의 사이트는 큰 "열어 보기" 단추 → 새 탭 (다 보면 다모아 탭으로 돌아와 "다 했어요")
// content: { url, open: 'auto'|'new' }      answer: { opened: true }
import { h } from '../common.js?v=202611080707';
import { makeState, wrap } from './base.js?v=202611080707';

export function cleanUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (/^www\./i.test(u) || (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(u) && !/^https?:/i.test(u))) u = 'https://' + u;
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;   // javascript: 같은 건 안 돼요
    return x.href;
  } catch (_) { return null; }
}

// 화면 안에 넣을 수 있는 주소로 바꿔요 (안 되면 null)
export function embedUrl(url) {
  let x;
  try { x = new URL(url); } catch (_) { return null; }
  const host = x.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (x.pathname === '/watch') id = x.searchParams.get('v');
    else { const m = x.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/); if (m) id = m[2]; }
  }
  if (id && /^[\w-]{6,}$/.test(id)) {
    const t = x.searchParams.get('t') || x.searchParams.get('start');
    const sec = t ? parseInt(String(t).replace(/s$/, ''), 10) : 0;
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${sec ? '&start=' + sec : ''}`;
  }
  if (host === 'docs.google.com') {
    const m = x.pathname.match(/^\/(document|presentation|spreadsheets|forms)\/d\/(e\/)?([\w-]+)/);
    if (m) {
      if (m[1] === 'forms') return `https://docs.google.com/forms/d/${m[2] || ''}${m[3]}/viewform?embedded=true`;
      return `https://docs.google.com/${m[1]}/d/${m[3]}/preview`;
    }
  }
  return null;
}
const siteName = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; } };
const kindOf = (url) => /youtu/.test(siteName(url)) ? '영상' : /docs\.google/.test(siteName(url)) ? '문서' : '사이트';

export const link = {
  name: '링크',
  desc: '사이트 · 영상 보내기',
  help: (c) => (embedUrl(cleanUrl(c.url) || '') && c.open !== 'new') ? '화면 안에서 보고, 다 보면 전송을 눌러요' : '열어 보기를 누르고, 다 하면 이 화면으로 돌아와 전송을 눌러요',
  mode: '링크 보는 중',
  defaults: { url: '', open: 'auto' },
  fields: [
    { k: 'url', label: '사이트 주소 (붙여 넣기)', type: 'text' },
    { k: 'open', label: '여는 방법', type: 'select', options: [['auto', '유튜브·구글 문서는 화면 안에서, 나머지는 새 탭'], ['new', '언제나 새 탭으로']] },
  ],
  validate(c) { return cleanUrl(c.url) ? null : '사이트 주소를 붙여 넣어 주세요 (https://…)'; },
  tokens() { return []; },
  defaultQuestion(c) {
    const u = cleanUrl(c.url);
    return u ? `${kindOf(u) === '영상' ? '영상을 보고' : kindOf(u) === '문서' ? '문서를 읽고' : '사이트를 열어 보고'}\n다 하면 전송을 눌러요.` : '링크를 열어 보세요.';
  },
  grade() { return null; },
  render(sheet, c, opt) {
    const url = cleanUrl(c.url);
    const box = wrap(sheet, 'wg-link');
    const a = opt.answer || {};
    const S = makeState({ opened: !!a.opened }, opt, draw);
    const emb = url && c.open !== 'new' ? embedUrl(url) : null;
    let mark = null;
    if (!url) {
      box.appendChild(h('div', { class: 'lk-card' }, h('div', { class: 'lk-site' }, '주소가 없어요')));
    } else if (emb && opt.interactive) {
      // 화면 안에서 (영상·문서)
      const fr = h('iframe', { class: 'lk-frame', src: emb, title: '링크', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' });
      fr.addEventListener('load', () => { if (!S.get().opened) S.set((st) => { st.opened = true; }, { record: false }); });
      box.appendChild(fr);
    } else {
      const open = h('a', { class: 'lk-open', href: url, target: '_blank', rel: 'noopener noreferrer',
        onclick: (e) => { if (!opt.interactive) { e.preventDefault(); return; } S.set((st) => { st.opened = true; }, { record: false }); } },
      '열어 보기 ', h('span', { 'aria-hidden': 'true' }, '↗'));
      mark = h('div', { class: 'lk-done' });
      box.appendChild(h('div', { class: 'lk-card' },
        h('div', { class: 'lk-kind' }, emb ? '영상 · 문서 (선생님 화면에서는 미리 보기만)' : kindOf(url)),
        h('div', { class: 'lk-site' }, siteName(url)),
        h('div', { class: 'lk-url' }, url.length > 70 ? url.slice(0, 67) + '…' : url),
        open, mark));
    }
    function draw(st) { if (mark) mark.textContent = st.opened ? '열어 봤어요 ✓' : ''; }
    draw(S.get());
    return { getAnswer: () => ({ opened: S.get().opened, mine: S.mine() || (S.get().opened ? 1 : 0) }), hasWork: () => S.get().opened, undo: () => {} };
  },
};
