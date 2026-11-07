// 수학 도구 템플릿 모음 (종류 이름 → 부품)
import { clock } from './clock.js?v=202611072119';
import { tens } from './tens.js?v=202611072119';
import { vmath } from './vmath.js?v=202611072119';
import { numline } from './numline.js?v=202611072119';
import { fraction } from './fraction.js?v=202611072119';
import { bargraph } from './bargraph.js?v=202611072119';
import { geoboard } from './geoboard.js?v=202611072119';

export const WIDGETS = { clock, tens, vmath, numline, fraction, bargraph, geoboard };

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
