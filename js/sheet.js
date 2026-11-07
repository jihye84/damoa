// 템플릿 한 장을 그려요. 학생 태블릿(풀기)과 선생님 화면(보기)이 같은 코드를 써서 똑같이 보여요.
// 모든 템플릿 = 바탕(문제) + 입력 부품(선택지·글쓰기 칸) + 맨 위 필기 층
import { h } from './common.js';
import { Ink } from './ink.js';

const MARKS = ['①', '②', '③', '④'];

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
  } else {
    sheet.appendChild(h('div', { class: 'sheet-blank' }));
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
  });

  return {
    sheet,
    ink,
    getAnswer() {
      const a = { strokes: ink.toJSON() };
      if (content.kind === 'choice4') a.choice = choice;
      if (textarea) a.text = textarea.value;
      return a;
    },
    hasWork() {
      return ink.strokes.length > 0 || choice !== null || (textarea && textarea.value.trim().length > 0);
    },
    destroy() { ink.destroy(); host.innerHTML = ''; },
  };
}

// 객관식이면 맞았는지 계산 (정답은 선생님 쪽에만 있음)
export function isCorrect(kind, answer, key) {
  if (kind !== 'choice4' || !key || typeof key.correct !== 'number') return null;
  if (!answer || typeof answer.choice !== 'number') return null;
  return answer.choice === key.correct;
}
