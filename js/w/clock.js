// 모형 시계: 바늘을 돌려 시각 만들기(set) · 시계를 보고 시각 쓰기(read)
// content: { mode: 'set'|'read', time: '3:30', step: 30|5|1 }
// answer:  set → { minutes } (0~719)   read → { h, m }
import { h } from '../common.js?v=202611072338';
import { s, svgRoot, toSvg, makeState, wrap, num, eul } from './base.js?v=202611072338';

export function parseTime(t) {
  const m = String(t || '').match(/^\s*(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2] || 0);
  if (hh < 1 || hh > 12 || mm > 59) return null;
  return { h: hh, m: mm, minutes: (hh % 12) * 60 + mm };
}
export const timeText = (t) => t ? (t.m ? `${t.h}시 ${t.m}분` : `${t.h}시`) : '';

function face(svg) {
  svg.appendChild(s('circle', { cx: 0, cy: 0, r: 100, class: 'ck-face' }));
  for (let i = 0; i < 60; i++) {
    const a = i * 6 * Math.PI / 180, big = i % 5 === 0;
    const r1 = big ? 86 : 91;
    svg.appendChild(s('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 96, y2: -Math.cos(a) * 96, class: big ? 'ck-tick big' : 'ck-tick' }));
  }
  for (let n = 1; n <= 12; n++) {
    const a = n * 30 * Math.PI / 180;
    svg.appendChild(s('text', { x: Math.sin(a) * 72, y: -Math.cos(a) * 72, class: 'ck-num' }, n));
  }
}

export const clock = {
  name: '모형 시계',
  desc: '바늘 돌리기 · 시각 읽기',
  help: (c) => c.mode === 'read' ? '시계를 보고 + − 를 눌러 시각을 맞춰요' : '긴바늘과 짧은바늘을 끌어서 돌려요',
  mode: '시계 바늘 돌리는 중',
  defaults: { mode: 'set', time: '3:30', step: 30 },
  fields: [
    { k: 'mode', label: '할 일', type: 'select', options: [['set', '바늘을 돌려 시각 만들기'], ['read', '시계를 보고 시각 쓰기']] },
    { k: 'time', label: '시각 (예: 3:30)', type: 'text' },
    { k: 'step', label: '바늘을 놓으면 맞춰지는 눈금', type: 'select', options: [[30, '30분 (몇 시 · 몇 시 30분)'], [5, '5분'], [1, '1분']] },
  ],
  // 문제 글·이름 속 숫자를 함께 바꾸기 위한 낱말들
  tokens(c) { const t = parseTime(c.time); return [t ? timeText(t) : null]; },
  validate(c) { return parseTime(c.time) ? null : '시각을 "3:30"처럼 써 주세요 (1~12시)'; },
  defaultQuestion(c) {
    const t = parseTime(c.time);
    return c.mode === 'read' ? '시계를 보고\n몇 시 몇 분인지 써 보세요.' : `${eul(timeText(t))}\n시계에 나타내 보세요.`;
  },
  grade(ans, key, c) {
    const t = parseTime(c.time);
    if (!t || !ans) return null;
    if (c.mode === 'read') {
      if (ans.h == null || ans.m == null) return null;
      const ok = ans.h === t.h && ans.m === t.m;
      return { ok, short: ok ? '맞았어요' : `${ans.h}시 ${ans.m}분` };
    }
    if (ans.minutes == null || !ans.mine) return null;
    const got = ((Math.round(ans.minutes) % 720) + 720) % 720;
    const ok = got === t.minutes;
    const gh = Math.floor(got / 60) || 12, gm = got % 60;
    return { ok, short: ok ? '맞았어요' : `${gh}시 ${gm}분` };
  },
  render(sheet, c, opt) {
    const box = wrap(sheet, 'wg-clock' + (c.mode === 'read' ? ' read' : ''));
    const t = parseTime(c.time) || { h: 3, m: 0, minutes: 180 };
    // 시각이 눈금에 안 맞으면(예: 30분 눈금인데 2시 15분) 알맞은 눈금으로 바꿔요
    let step = num(c.step, 30);
    if (t.m % step) step = t.m % 5 === 0 ? 5 : 1;
    const a = opt.answer || {};
    const S = makeState(c.mode === 'read' ? { h: a.h ?? null, m: a.m ?? null } : { minutes: a.minutes ?? 0 }, opt, draw);

    const svg = svgRoot('-110 -110 220 220', 'ck');
    face(svg);
    const hour = s('line', { x1: 0, y1: 10, x2: 0, y2: -50, class: 'ck-hour' });
    const minute = s('line', { x1: 0, y1: 12, x2: 0, y2: -80, class: 'ck-min' });
    svg.append(hour, minute, s('circle', { cx: 0, cy: 0, r: 6, class: 'ck-pin' }));
    box.appendChild(svg);

    let readBox = null, hOut = null, mOut = null;
    if (c.mode === 'read') {
      const stepper = (label, get, set) => {
        const out = h('span', { class: 'ck-val' });
        const btn = (d, txt) => h('button', { type: 'button', class: 'ck-btn', disabled: !opt.interactive, 'aria-label': label + (d > 0 ? ' 올리기' : '내리기'), onclick: () => S.set((st) => set(st, d)) }, txt);
        return [out, h('div', { class: 'ck-step' }, btn(-1, '−'), out, btn(1, '+'), h('span', { class: 'ck-unit' }, label))];
      };
      let hs, ms;
      [hOut, hs] = stepper('시', null, (st, d) => { st.h = st.h == null ? (d > 0 ? 1 : 12) : ((st.h - 1 + d + 12) % 12) + 1; });
      const mStep = step >= 30 ? 30 : step;
      [mOut, ms] = stepper('분', null, (st, d) => { st.m = st.m == null ? 0 : (st.m + d * mStep + 60) % 60; });
      readBox = h('div', { class: 'ck-read' }, hs, ms);
      box.appendChild(readBox);
    }

    function draw(st) {
      const mins = c.mode === 'read' ? t.minutes : (((st.minutes % 720) + 720) % 720);
      minute.setAttribute('transform', `rotate(${(mins % 60) * 6})`);
      hour.setAttribute('transform', `rotate(${mins / 2})`);
      if (hOut) { hOut.textContent = st.h == null ? '?' : st.h; mOut.textContent = st.m == null ? '?' : st.m; }
    }
    draw(S.get());

    if (opt.interactive && c.mode !== 'read') {
      let drag = null;
      const angleOf = (p) => ((Math.atan2(p.x, -p.y) * 180 / Math.PI) + 360) % 360;
      svg.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const p = toSvg(svg, e);
        const r = Math.hypot(p.x, p.y);
        if (r > 108) return;
        const ang = angleOf(p);
        const mins = S.get().minutes;
        const dm = Math.abs(((ang - (mins % 60) * 6) + 540) % 360 - 180);
        const dh = Math.abs(((ang - ((mins % 720 + 720) % 720) / 2) + 540) % 360 - 180);
        // 가운데 가까이 잡으면 짧은바늘, 바깥쪽이면 긴바늘을 먼저 골라요
        const which = r < 58 ? (dh <= dm + 25 ? 'h' : 'm') : (dm <= dh + 25 ? 'm' : 'h');
        S.mark();
        drag = which;
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        move(e);
      });
      // 끄는 동안은 바늘이 손가락을 그대로 따라 돌고, 놓으면 가까운 눈금(step분)에 살짝 맞춰져요
      const move = (e) => {
        if (!drag) return;
        e.preventDefault();
        const ang = angleOf(toSvg(svg, e));
        S.set((st) => {
          if (drag === 'm') {
            const cur = ((st.minutes % 60) + 60) % 60;
            let d = ang / 6 - cur;
            if (d > 30) d -= 60;
            if (d < -30) d += 60;
            st.minutes = (st.minutes + d + 720) % 720;
          } else {
            // 짧은바늘: 지금 위치에서 가장 가까운 쪽으로 이어서 돌아요
            const cur = ((st.minutes % 720) + 720) % 720;
            let d = ang * 2 - cur;
            if (d > 360) d -= 720;
            if (d < -360) d += 720;
            st.minutes = (cur + d + 720) % 720;
          }
        }, { record: false });
      };
      svg.addEventListener('pointermove', move);
      let anim = null;
      const end = () => {
        if (!drag) return;
        drag = null;
        const from = S.get().minutes;
        let to = Math.round(from / step) * step;
        const t0 = performance.now();
        cancelAnimationFrame(anim);
        const tick = (now) => {
          const k = Math.min(1, (now - t0) / 140);
          const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
          S.set((st) => { st.minutes = k < 1 ? v : ((to % 720) + 720) % 720; }, { record: false });
          if (k < 1) anim = requestAnimationFrame(tick);
        };
        anim = requestAnimationFrame(tick);
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
    }

    return {
      getAnswer: () => { const a2 = Object.assign({}, S.get(), { mine: S.mine() }); if (a2.minutes != null) a2.minutes = Math.round(a2.minutes) % 720; return a2; },
      hasWork: () => S.mine() > 0,
      undo: () => S.undo(),
    };
  },
};
