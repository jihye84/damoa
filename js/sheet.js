// 템플릿 한 장을 그려요. 학생 태블릿(풀기)과 선생님 화면(보기)이 같은 코드를 써서 똑같이 보여요.
// 모든 템플릿 = 바탕(문제) + 입력 부품(선택지·글쓰기 칸) + 맨 위 필기 층
import { h } from './common.js?v=202611072336';
import { Ink } from './ink.js?v=202611072336';
import { renderShapes, gradeShapes } from './shapes.js?v=202611072336';
import { WIDGETS } from './w/index.js?v=202611072336';
import { renderSong } from './song.js?v=202611072336';

const MARKS = ['①', '②', '③', '④'];

// 지도 파일은 한 번만 받아서 모든 칸이 같이 써요 (분할 보기에 24장이 떠도 한 번만 받기)
const mapCache = new Map();
export function loadMap(id) {
  if (!mapCache.has(id)) {
    mapCache.set(id, fetch(`maps/${id}.json`).then((r) => {
      if (!r.ok) throw new Error('지도를 불러오지 못했어요');
      return r.json();
    }));
  }
  return mapCache.get(id);
}
const SVGNS = 'http://www.w3.org/2000/svg';
const GROUP_HINT = ['#2563EB', '#DC2626', '#16A34A', '#D97706', '#9333EA', '#DB2777'];

// 지역 이름: 큰 곳부터 놓고, 겹치면 위·아래·옆으로 비켜 보고, 그래도 겹치면 숨겨요
function placeLabels(svg, g, m, vbW) {
  const lg = document.createElementNS(SVGNS, 'g');
  lg.setAttribute('class', 'map-labels');
  lg.setAttribute('aria-hidden', 'true');
  svg.appendChild(lg);
  const n = m.regions.length;
  const vb = m.viewBox.split(' ').map(Number);
  const fs = Math.max(vb[2], vb[3]) / (n > 60 ? 95 : n > 20 ? 52 : 40);
  const paths = new Map([...g.children].map((p) => [p.dataset.id, p]));
  const area = (r) => { try { const b = paths.get(r.id).getBBox(); return b.width * b.height; } catch (_) { return 0; } };
  const order = m.regions.map((r) => [r, area(r)]).sort((a, b) => b[1] - a[1]);
  const placed = [];
  const hit = (a) => placed.some((b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height);
  for (const [r] of order) {
    const tx = document.createElementNS(SVGNS, 'text');
    tx.setAttribute('font-size', fs);
    tx.textContent = r.name;
    lg.appendChild(tx);
    const tries = [[0, 0], [0, -1.1], [0, 1.1], [-0.6, 0], [0.6, 0], [0, -2], [0, 2]];
    let ok = false;
    for (const [dx, dy] of tries) {
      tx.setAttribute('x', r.lx);
      tx.setAttribute('y', r.ly);
      let bb;
      try { bb = tx.getBBox(); } catch (_) { ok = true; break; }
      if (!bb.width) { ok = true; break; }   // 화면에 안 보이는 중: 그대로 둬요
      const x = r.lx + dx * bb.width, y = r.ly + dy * bb.height;
      tx.setAttribute('x', x);
      tx.setAttribute('y', y);
      const box = { x: bb.x + dx * bb.width - fs * 0.15, y: bb.y + dy * bb.height, width: bb.width + fs * 0.3, height: bb.height };
      if (!hit(box)) { placed.push(box); ok = true; break; }
    }
    if (!ok) tx.remove();
  }
}

/**
 * @param host    이 안에 꽉 차게 16:10 종이를 그림
 * @param content 템플릿 내용 {kind, question, options}
 * @param opt     {interactive, answer, correctIndex, allowFinger, onChange}
 */
export function renderSheet(host, content, opt = {}) {
  host.innerHTML = '';
  const answer = opt.answer || {};
  const interactive = !!opt.interactive;
  let choice = typeof answer.choice === 'number' ? answer.choice : null;

  const fit = h('div', { class: 'sheet-fit' });
  const sheet = h('div', { class: 'sheet kind-' + (content.kind || 'blank') + (interactive ? ' is-live' : '') });
  fit.appendChild(sheet);
  host.appendChild(fit);

  const changed = () => { if (opt.onChange) opt.onChange(); };

  if (content.question) {
    sheet.appendChild(h('div', { class: 'sheet-q' }, content.question));
  }

  let textarea = null;
  const optButtons = [];
  const fills = Object.assign({}, answer.fills || {});   // 지역 id → 색
  let mapSvg = null;
  let lastTap = 0;
  let song = null;

  if (content.kind === 'choice4') {
    const grid = h('div', { class: 'sheet-opts' });
    (content.options || []).slice(0, 4).forEach((label, i) => {
      const b = h('button', {
        type: 'button',
        class: 'sheet-opt',
        'aria-pressed': choice === i ? 'true' : 'false',
        disabled: interactive ? null : true,
        onclick: () => {
          if (!interactive) return;
          choice = choice === i ? null : i;
          paint();
          changed();
        },
      }, h('span', { class: 'mark' }, MARKS[i]), h('span', { class: 'val' }, label));
      optButtons.push(b);
      grid.appendChild(b);
    });
    sheet.appendChild(grid);
  } else if (content.kind === 'essay') {
    textarea = h('textarea', {
      class: 'sheet-essay',
      'aria-label': '내 생각 쓰기',
      placeholder: interactive ? '여기에 타자로 써도 되고, 펜으로 써도 돼요' : '',
      readonly: interactive ? null : true,
      oninput: changed,
    });
    textarea.value = answer.text || '';
    sheet.appendChild(textarea);
  } else if (content.kind === 'map') {
    const box = h('div', { class: 'sheet-map' }, h('div', { class: 'map-loading' }, '지도를 불러오는 중…'));
    sheet.appendChild(box);
    loadMap(content.map).then((m) => {
      if (!box.isConnected) return;
      box.innerHTML = '';
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', m.viewBox);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', m.desc + ' 백지도');
      svg.classList.add('map-svg');
      const vbW = parseFloat(m.viewBox.split(' ')[2]);
      // 지도가 작아도 경계선 굵기가 비슷하게 보이도록
      svg.style.setProperty('--map-stroke', String(vbW / 900));
      const g = document.createElementNS(SVGNS, 'g');
      for (const r of m.regions) {
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', r.d);
        path.setAttribute('class', 'map-region');
        path.dataset.id = r.id;
        const t = document.createElementNS(SVGNS, 'title');
        t.textContent = r.name;
        path.appendChild(t);
        g.appendChild(path);
      }
      svg.appendChild(g);
      box.appendChild(svg);
      if (content.labels) placeLabels(svg, g, m, vbW);
      box.appendChild(h('div', { class: 'map-credit' }, m.credit));
      mapSvg = svg;
      paintFills();
    }).catch((e) => { box.innerHTML = ''; box.appendChild(h('div', { class: 'map-loading' }, e.message)); });

    // 손가락으로 톡: 색칠 (펜·마우스로 톡은 아래 onTap에서 처리)
    if (interactive) {
      box.addEventListener('click', (e) => {
        if (performance.now() - lastTap < 400) return;   // 손가락 필기 켠 채 톡: 방금 onTap으로 칠했어요
        const r = e.target.closest && e.target.closest('.map-region');
        if (r) tapRegion(r.dataset.id);
      });
    }
  } else if (content.kind === 'shapes') {
    song = renderShapes(sheet, content, { interactive, answer: opt.answer, onChange: changed });
  } else if (WIDGETS[content.kind]) {
    song = Object.assign({ stop() {}, destroy() {} }, WIDGETS[content.kind].render(sheet, content, { interactive, answer: opt.answer, onChange: changed }));
  } else if (content.kind === 'song') {
    song = renderSong(sheet, content, {
      interactive, answer: opt.answer, onChange: changed, compact: !!opt.compact,
      editGiven: !!opt.editGiven, givenCols: opt.givenCols,
    });
  } else {
    sheet.appendChild(h('div', { class: 'sheet-blank' }));
  }

  // 정답: 선생님 화면에서만 넘겨받아요 (학생 화면에는 절대 없음)
  const mapKey = interactive ? null : (opt.mapKey || (opt.mapTargets ? { targets: opt.mapTargets } : null));
  const reviewing = !!(opt.answer && opt.answer.fills);   // 학생 답을 보는 중이면 채점 표시

  function paintFills() {
    if (!mapSvg) return;
    const g = mapKey && reviewing ? gradeMap(content.kind, { fills }, mapKey) : null;
    const groupOf = new Map();
    if (mapKey && !reviewing && Array.isArray(mapKey.groups)) {
      mapKey.groups.forEach((gr, i) => (gr.ids || []).forEach((id) => groupOf.set(id, i)));
    }
    const top = [];
    mapSvg.querySelectorAll('.map-region').forEach((p) => {
      const id = p.dataset.id;
      p.style.fill = fills[id] || '';
      p.classList.toggle('is-filled', !!fills[id]);
      // 미리 보기: 찾을 곳은 초록 테두리, 묶음은 묶음마다 다른 색 점선
      p.classList.toggle('is-target', !reviewing && !!(mapKey && mapKey.targets && mapKey.targets.includes(id)));
      const gi = groupOf.get(id);
      p.classList.toggle('is-group', gi !== undefined);
      p.style.stroke = gi !== undefined ? GROUP_HINT[gi % GROUP_HINT.length] : '';
      // 채점: 맞게 칠함 / 잘못 칠함 / 빠뜨림
      const m = g ? g.marks[id] : null;
      p.classList.toggle('mark-hit', m === 'hit');
      p.classList.toggle('mark-wrong', m === 'wrong');
      p.classList.toggle('mark-miss', m === 'miss');
      if (m || gi !== undefined) top.push(p);
    });
    // 표시한 곳은 맨 위로 (테두리가 이웃에 가려지지 않게)
    const layer = mapSvg.querySelector('g');
    for (const p of top) layer.appendChild(p);
    const legend = mapSvg.parentNode && mapSvg.parentNode.querySelector('.map-legend');
    if (legend) legend.remove();
    if (g && g.ok !== null && mapSvg.parentNode) {
      mapSvg.parentNode.appendChild(h('div', { class: 'map-legend' },
        h('span', { class: 'lg hit' }, '맞게 칠함'),
        g.wrong ? h('span', { class: 'lg wrong' }, '잘못 칠함') : null,
        g.miss ? h('span', { class: 'lg miss' }, '빠뜨림') : null,
        h('b', null, g.label)));
    }
  }

  function tapRegion(id) {
    if (!interactive || !id) return;
    const f = opt.getFill ? opt.getFill() : { color: '#1D4ED8', erase: false };
    if (f.erase || fills[id] === f.color) delete fills[id];
    else fills[id] = f.color;
    paintFills();
    changed();
  }

  function paint() {
    optButtons.forEach((b, i) => {
      b.setAttribute('aria-pressed', choice === i ? 'true' : 'false');
      b.classList.toggle('is-correct', opt.correctIndex === i);
      b.classList.toggle('is-wrong', opt.correctIndex != null && choice === i && choice !== opt.correctIndex);
    });
  }
  paint();

  const ink = new Ink(sheet, {
    readonly: !interactive || content.kind === 'song' || content.kind === 'shapes' || !!WIDGETS[content.kind],   // 작곡 칸은 펜 필기 대신 칸 누르기
    strokes: answer.strokes || [],
    allowFinger: !!opt.allowFinger,
    onChange: changed,
    // 펜·마우스로 지도를 톡 치면 점을 찍지 않고 색칠해요
    onTap: content.kind === 'map' ? (x, y, type) => {
      const el = document.elementFromPoint(x, y);
      const r = el && el.closest && el.closest('.map-region');
      if (r && sheet.contains(r)) { if (type === 'touch') lastTap = performance.now(); tapRegion(r.dataset.id); return true; }
      return false;
    } : null,
  });

  return {
    sheet,
    ink,
    textarea,
    getAnswer() {
      const a = { strokes: ink.toJSON() };
      if (content.kind === 'choice4') a.choice = choice;
      if (textarea) a.text = textarea.value;
      if (content.kind === 'map') a.fills = Object.assign({}, fills);
      if (song) Object.assign(a, song.getAnswer());
      return a;
    },
    hasWork() {
      return ink.strokes.length > 0 || choice !== null || (textarea && textarea.value.trim().length > 0)
        || Object.keys(fills).length > 0 || (song ? song.hasWork() : false);
    },
    undo() { if (song) song.undo(); else ink.undo(); },
    song,
    kind: content.kind,
    destroy() { if (song) song.destroy(); ink.destroy(); host.innerHTML = ''; },
  };
}

// 객관식이면 맞았는지 계산 (정답은 선생님 쪽에만 있음)
/**
 * 지도 채점
 * - targets: 찾아 칠하기. 칠한 곳이 정답 지역과 꼭 같으면 맞음 (색은 상관없어요)
 * - groups:  같은 색끼리 묶기. 묶음 안은 같은 색, 묶음끼리는 다른 색이면 맞음
 *            need: 'all' 이면 묶음의 모든 곳을 칠해야 하고, 'some' 이면 묶음마다 한 곳 이상
 * @returns {ok, hit, total, wrong, miss, marks: {id: 'hit'|'wrong'|'miss'}, label, short}
 */
export function gradeMap(kind, answer, key) {
  if (kind !== 'map' || !key || !answer) return null;
  const fills = answer.fills || {};
  const filled = Object.keys(fills);
  const marks = {};
  if (Array.isArray(key.targets) && key.targets.length) {
    const want = new Set(key.targets);
    let hit = 0, wrong = 0, miss = 0;
    for (const id of filled) { if (want.has(id)) { hit++; marks[id] = 'hit'; } else { wrong++; marks[id] = 'wrong'; } }
    for (const id of want) if (!fills[id]) { miss++; marks[id] = 'miss'; }
    const total = want.size;
    const ok = filled.length ? (wrong === 0 && miss === 0) : null;
    return { ok, hit, total, wrong, miss, marks,
      short: ok ? '다 찾았어요' : `${hit}/${total}곳` + (wrong ? ` · ${wrong}곳 틀림` : ''),
      label: ok ? `${total}곳 모두 찾았어요` : `${total}곳 중 ${hit}곳 찾음` + (wrong ? `, ${wrong}곳 잘못 칠함` : '') };
  }
  if (Array.isArray(key.groups) && key.groups.length) {
    const needAll = key.need !== 'some';
    let wrong = 0, miss = 0;
    // 묶음마다 가장 많이 쓴 색이 그 묶음의 색
    const main = key.groups.map((gr) => {
      const cnt = new Map();
      for (const id of gr.ids || []) if (fills[id]) cnt.set(fills[id], (cnt.get(fills[id]) || 0) + 1);
      let best = null, n = 0;
      for (const [c, k] of cnt) if (k > n) { best = c; n = k; }
      return { color: best, n };
    });
    // 두 묶음이 같은 색이면 칠한 곳이 적은 쪽이 틀렸어요
    const clash = new Set();
    for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) {
      if (main[i].color && main[i].color === main[j].color) clash.add(main[i].n >= main[j].n ? j : i);
    }
    let goodGroups = 0;
    key.groups.forEach((gr, i) => {
      let bad = false, filledHere = 0;
      for (const id of gr.ids || []) {
        if (!fills[id]) { if (needAll) { marks[id] = 'miss'; miss++; bad = true; } continue; }
        filledHere++;
        if (clash.has(i) || fills[id] !== main[i].color) { marks[id] = 'wrong'; wrong++; bad = true; }
        else marks[id] = 'hit';
      }
      if (!filledHere) bad = true;
      if (!bad) goodGroups++;
    });
    const total = key.groups.length;
    const ok = filled.length ? goodGroups === total : null;
    return { ok, hit: goodGroups, total, wrong, miss, marks,
      short: ok ? '맞았어요' : `${goodGroups}/${total}묶음` + (wrong ? ` · ${wrong}곳 색 다름` : ''),
      label: ok ? '묶음마다 색을 잘 나눠 칠했어요' : `${total}묶음 중 ${goodGroups}묶음 맞음` + (wrong ? `, ${wrong}곳 색이 달라요` : '') + (miss ? `, ${miss}곳 안 칠함` : '') };
  }
  return null;
}

export { gradeShapes, WIDGETS };

// 어떤 종류든 채점: { ok, short } 또는 null (채점 안 함 · 아직 안 함)
export function gradeAny(kind, answer, key, content) {
  if (!answer) return null;
  let g = null;
  if (kind === 'map') g = gradeMap('map', answer, key);
  else if (kind === 'shapes') g = gradeShapes(answer, key);
  else if (WIDGETS[kind]) g = WIDGETS[kind].grade(answer, key || null, content || {});
  else {
    const ok = isCorrect(kind, answer, key);
    g = ok === null ? null : { ok, short: ok ? '맞았어요' : '다시 볼까요' };
  }
  return g && g.ok !== null && g.ok !== undefined ? g : null;
}
export function isCorrect(kind, answer, key) {
  if (kind === 'map') { const g = gradeMap(kind, answer, key); return g ? g.ok : null; }
  if (kind === 'shapes') { const g = gradeShapes(answer, key); return g ? g.ok : null; }
  if (WIDGETS[kind]) return null;   // 수학 도구는 gradeAny로 (내용이 필요해요)
  if (kind !== 'choice4' || !key || typeof key.correct !== 'number') return null;
  if (!answer || typeof answer.choice !== 'number') return null;
  return answer.choice === key.correct;
}
