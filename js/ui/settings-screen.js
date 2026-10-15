// 設定画面（①）: コンペ名・開催日・パー・配分の向き・同点処理。
import { h } from './dom.js';
import { parseParInput, FRONT_HOLES, BACK_HOLES, DIRECTION_OPTIONS, TIE_BREAK_OPTIONS } from './settings-logic.js';

const LOCKED_MESSAGE = '保存データが壊れているため、変更できません。画面上部の「保存データを初期化して始める」で復旧してください。';

export const screen = {
  id: 'settings',
  label: '設定',
  render(container, ctx) {
    const { state } = ctx;
    const comp = state.competition;

    // 画面内の通知欄（保存できなかったとき）
    const notice = h('p', { class: 'notice', role: 'status' });
    const showNotice = (text, isError = false) => {
      notice.textContent = text;
      notice.classList.toggle('is-error', isError);
    };
    const quiet = (mutator) => {
      const ok = ctx.commitQuiet(mutator);
      if (!ok) showNotice(LOCKED_MESSAGE, true);
      return ok;
    };

    // ---- コンペ名・開催日 ----
    const nameInput = h('input', { id: 'comp-name', type: 'text', value: comp.name, autocomplete: 'off', enterkeyhint: 'done' });
    nameInput.addEventListener('input', () => quiet((c) => { c.name = nameInput.value; }));
    const dateInput = h('input', { id: 'comp-date', type: 'date', value: comp.date });
    dateInput.addEventListener('input', () => quiet((c) => { c.date = dateInput.value; }));
    const basic = h('section', { class: 'card stack' },
      h('h3', {}, 'コンペ'),
      h('div', { class: 'field' }, h('label', { for: 'comp-name' }, 'コンペ名（任意）'), nameInput),
      h('div', { class: 'field' }, h('label', { for: 'comp-date' }, '開催日（任意）'), dateInput),
    );

    // ---- パー ----
    const parCell = (hole) => {
      const i = hole - 1;
      const err = h('span', { class: 'error-text', role: 'alert' });
      const input = h('input', { id: `par-${hole}`, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', value: comp.pars[i], autocomplete: 'off', 'aria-label': `${hole}番ホールのパー` });
      const cell = h('div', { class: 'par-cell' }, h('label', { for: `par-${hole}` }, `${hole}番`), input, err);
      input.addEventListener('input', () => {
        const r = parseParInput(input.value);
        cell.classList.toggle('is-invalid', !r.ok);
        err.textContent = r.ok ? '' : `✕ ${r.message}`;
        input.setAttribute('aria-invalid', r.ok ? 'false' : 'true');
        if (r.ok) quiet((c) => { c.pars[i] = r.value; });
      });
      return cell;
    };
    const parGroup = (title, holes) => h('div', { class: 'par-group' }, h('span', { class: 'label' }, title), h('div', { class: 'par-grid' }, holes.map(parCell)));
    const pars = h('section', { class: 'card stack' },
      h('h3', {}, '各ホールのパー'),
      h('p', { class: 'hint' }, 'パーは 3〜6 の整数です。イーグル・バーディ・ボギーなどの判定に使います。'),
      parGroup('前半（1〜9番）', FRONT_HOLES),
      parGroup('後半（10〜18番）', BACK_HOLES),
    );

    // ---- ラジオ ----
    const radioGroup = (legend, name, options, current, onPick) => h('fieldset', { class: 'option-list' },
      h('legend', {}, legend),
      options.map((o) => {
        const input = h('input', { type: 'radio', name, value: o.value, checked: o.value === current });
        input.addEventListener('change', () => { if (input.checked) onPick(o.value); });
        return h('label', { class: 'option' }, input,
          h('span', { class: 'option-body' },
            h('span', {}, o.label + (o.note ? `（${o.note}）` : '')),
            o.desc ? h('span', { class: 'option-desc' }, o.desc) : null));
      }),
    );
    const direction = h('section', { class: 'card stack' },
      h('h3', {}, '採用ホール数の配分の向き'),
      h('p', { class: 'hint' }, 'チーム内の HDCP 順に、採用ホール数が 4名チーム = 6・5・4・3、3名チーム = 7・6・5 と配分されます。どちらの人に多く配るかを選びます。'),
      radioGroup('配分の向き', 'direction', DIRECTION_OPTIONS, comp.settings.allocationDirection, (v) => quiet((c) => { c.settings.allocationDirection = v; })),
    );
    const tie = h('section', { class: 'card stack' },
      h('h3', {}, '同点処理'),
      h('p', { class: 'hint' }, 'チーム合計が同点のときの順位の決め方です。'),
      radioGroup('同点処理', 'tiebreak', TIE_BREAK_OPTIONS, comp.settings.tieBreak, (v) => quiet((c) => { c.settings.tieBreak = v; })),
    );

    container.append(h('h2', {}, '設定'), notice, h('div', { class: 'stack' }, basic, pars, direction, tie));
  },
};
