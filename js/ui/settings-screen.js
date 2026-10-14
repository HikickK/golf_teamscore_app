// 設定画面（①）: コンペ名・開催日・パー・配分の向き・同点処理・データ管理。
import { h } from './dom.js';
import { importJson, exportJson } from '../storage.js';
import { shareFile, readFileText } from './file-actions.js';
import { parseParInput, FRONT_HOLES, BACK_HOLES, DIRECTION_OPTIONS, TIE_BREAK_OPTIONS, JSON_MIME } from './settings-logic.js';

const LOCKED_MESSAGE = '保存データが壊れているため、変更できません。画面上部の「保存データを初期化して始める」で復旧してください。';

// 全体が描き直されても残したいメッセージ（読み込み成功・初期化など）
let pendingNotice = null;

export const screen = {
  id: 'settings',
  label: '設定',
  render(container, ctx) {
    const { state } = ctx;
    const comp = state.competition;

    // 画面内の通知欄（保存できなかったとき・書き出し / 読み込みの結果）
    const notice = h('p', { class: 'notice', role: 'status' });
    const showNotice = (text, isError = false) => {
      notice.textContent = text;
      notice.classList.toggle('is-error', isError);
    };
    if (pendingNotice) {
      showNotice(pendingNotice.text, pendingNotice.isError);
      pendingNotice = null;
    }
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

    // ---- データ管理 ----
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        let text;
        try {
          text = await readFileText(file);
        } catch {
          showNotice('ファイルを読み込めませんでした。現在のデータは変更していません。', true);
          return;
        }
        const r = importJson(text);
        if (!r.ok) {
          showNotice(`読み込めませんでした: ${r.error.message}。現在のデータは変更していません。`, true);
          return;
        }
        if (!confirm('現在のデータを、読み込んだファイルの内容で置き換えます。よろしいですか？')) {
          showNotice('読み込みを取りやめました。現在のデータは変更していません。');
          return;
        }
        pendingNotice = { text: `読み込みました（チーム ${r.competition.teams.length} 件）。`, isError: false };
        state.replace(r.competition); // 通知で画面が描き直され、pendingNotice が表示される
      } finally {
        fileInput.value = ''; // 同じファイルを再選択できるようにする
      }
    });

    const exportBtn = h('button', { type: 'button', class: 'primary', id: 'export-json' }, 'JSON を書き出す');
    exportBtn.addEventListener('click', () => {
      // iOS の共有はユーザー操作の直後でないと失敗するため、ファイルは同期で作って即呼ぶ
      const { filename, text } = exportJson(state.competition);
      shareFile({ filename, mime: JSON_MIME, content: text }).then((r) => {
        if (r.ok) showNotice(r.method === 'share' ? '書き出しました。' : 'ダウンロードしました。ファイルアプリなどに保存されます。');
        else if (r.cancelled) showNotice('書き出しを取りやめました。');
        else showNotice(`書き出せませんでした: ${(r.error && r.error.message) || '不明なエラー'}`, true);
      });
    });
    const importBtn = h('button', { type: 'button', id: 'import-json', onclick: () => fileInput.click() }, 'JSON を読み込む');
    const resetBtn = h('button', { type: 'button', class: 'danger', id: 'reset-all' }, '全データを初期化する');
    resetBtn.addEventListener('click', () => {
      if (!confirm('すべてのデータ（コンペ名・パー・チーム・スコア）を削除します。元に戻せません。よろしいですか？')) return;
      pendingNotice = { text: '全データを初期化しました。', isError: false };
      state.reset();
    });

    const data = h('section', { class: 'card stack' },
      h('h3', {}, 'データ管理'),
      h('p', { class: 'hint' }, '端末のデータは、Safari の設定やストレージの整理で消えることがあります。コンペの前後に「JSON を書き出す」で保管してください。'),
      h('div', { class: 'data-actions' }, exportBtn, importBtn, fileInput),
      h('hr', {}),
      h('div', { class: 'data-actions' }, resetBtn),
    );

    container.append(h('h2', {}, '設定'), notice, h('div', { class: 'stack' }, basic, pars, direction, tie, data));
  },
};
