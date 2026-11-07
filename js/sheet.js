// 템플릿 한 장을 그려요. 학생 태블릿(풀기)과 선생님 화면(보기)이 같은 코드를 써서 똑같이 보여요.
// 모든 템플릿 = 바탕(문제) + 입력 부품(선택지·글쓰기 칸) + 맨 위 필기 층
import { h } from './common.js?v=202611071603';
import { Ink } from './ink.js?v=202611071603';

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
  } else {
    sheet.appendChild(h('div', { class: 'sheet-blank' }));
  }

  function paintFills() {
    if (!mapSvg) return;
    mapSvg.querySelectorAll('.map-region').forEach((p) => {
      const id = p.dataset.id;
      p.style.fill = fills[id] || '';
      p.classList.toggle('is-filled', !!fills[id]);
      const isTarget = opt.mapTargets && opt.mapTargets.includes(id);
      p.classList.toggle('is-target', !!isTarget);
    });
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
    readonly: !interactive,
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
      return a;
    },
    hasWork() {
      return ink.strokes.length > 0 || choice !== null || (textarea && textarea.value.trim().length > 0)
        || Object.keys(fills).length > 0;
    },
    kind: content.kind,
    destroy() { ink.destroy(); host.innerHTML = ''; },
  };
}

// 객관식이면 맞았는지 계산 (정답은 선생님 쪽에만 있음)
export function isCorrect(kind, answer, key) {
  if (kind === 'map') {
    // 찾아 칠하기: 칠한 곳이 정답 지역과 꼭 같으면 맞음 (색은 상관없어요)
    if (!key || !Array.isArray(key.targets) || !answer) return null;
    const got = Object.keys(answer.fills || {}).sort();
    const want = [...key.targets].sort();
    if (!got.length) return null;
    return got.length === want.length && got.every((v, i) => v === want[i]);
  }
  if (kind !== 'choice4' || !key || typeof key.correct !== 'number') return null;
  if (!answer || typeof answer.choice !== 'number') return null;
  return answer.choice === key.correct;
}
