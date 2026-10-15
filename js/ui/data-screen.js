// データ画面: JSON の書き出し・読み込み・全データ初期化・バックアップの注意。事前準備・当日の両方で使える。
import { h } from './dom.js';
import { importJson, exportJson } from '../storage.js';
import { shareFile, readFileText } from './file-actions.js';
import { JSON_MIME } from './settings-logic.js';

// 全体が描き直されても残したいメッセージ（読み込み成功・初期化など）
let pendingNotice = null;

export const screen = {
  id: 'data',
  label: 'データ',
  render(container, ctx) {
    const { state } = ctx;

    // 画面内の通知欄（書き出し / 読み込みの結果）
    const notice = h('p', { class: 'notice', role: 'status' });
    const showNotice = (text, isError = false) => {
      notice.textContent = text;
      notice.classList.toggle('is-error', isError);
    };
    if (pendingNotice) {
      showNotice(pendingNotice.text, pendingNotice.isError);
      pendingNotice = null;
    }

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

    container.append(h('h2', {}, 'データ'), notice, h('div', { class: 'stack' }, data));
  },
};
