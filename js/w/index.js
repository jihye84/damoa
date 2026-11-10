// 수학 도구 템플릿 모음 (종류 이름 → 부품)
import { clock } from './clock.js?v=202611080717';
import { tens } from './tens.js?v=202611080717';
import { vmath } from './vmath.js?v=202611080717';
import { numline } from './numline.js?v=202611080717';
import { fraction } from './fraction.js?v=202611080717';
import { bargraph } from './bargraph.js?v=202611080717';
import { geoboard } from './geoboard.js?v=202611080717';
import { eul } from './base.js?v=202611080717';
import { link } from './link.js?v=202611080717';

export const WIDGETS = { clock, tens, vmath, numline, fraction, bargraph, geoboard, link };

// 편집기 칸 값 → 템플릿 내용 / 정답
export function cleanKey(w, raw) {
  if (!w.keyFields) return null;
  const k = {};
  for (const f of w.keyFields) {
    const v = raw[f.k];
    if (v === undefined || v === null || v === '' || (f.type === 'select' && (v === 'any' || v === ''))) continue;
    k[f.k] = f.type === 'number' ? Number(v) : f.type === 'check' ? !!v : (f.type === 'select' && /^\d+$/.test(String(v)) ? Number(v) : v);
  }
  return Object.keys(k).length ? k : null;
}

// 선생님이 칸 값을 바꾸면 문제 글·이름 속 같은 낱말도 함께 바꿔요
//  예) 시각 3:30 → 2:15 : "3시 30분을 시계에…" → "2시 15분을 시계에…" (을/를도 맞춰요)
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
export function syncText(text, before, after) {
  let out = String(text || '');
  const swaps = [];
  before.forEach((old, i) => {
    const nw = after[i];
    if (old == null || nw == null || old === '' || String(old) === String(nw)) return;
    const o = String(old);
    const edge = /^[0-9]/.test(o) ? '(?<![0-9./])' : '';
    const tail = /[0-9]$/.test(o) ? '(?![0-9./])' : '';
    const re = new RegExp(edge + esc(o) + tail + '(을\\(를\\)|을|를)?', 'g');
    // 한꺼번에 바꾸려고 먼저 표시만 해 둬요 (3→5, 5→7이 겹쳐 바뀌지 않게)
    const at = swaps.push(String(nw)) - 1;
    out = out.replace(re, (m, p) => `\u0000${at}:${p ? 1 : 0}\u0000`);
  });
  return out.replace(/\u0000(\d+):(\d)\u0000/g, (m, i, p) => (p === '1' ? eul(swaps[+i]) : swaps[+i]));
}
