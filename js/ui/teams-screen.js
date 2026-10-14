// チーム画面。担当タスクで実装する（それまでは準備中の表示）。
import { h } from './dom.js';

export const screen = {
  id: 'teams',
  label: 'チーム',
  // container: 画面の描画先（毎回空にして渡される）。ctx: { state, ui, navigate, rerender, commitQuiet }
  render(container, ctx) {
    container.append(
      h('h2', {}, 'チーム'),
      h('div', { class: 'card' }, h('p', {}, '準備中です。'), h('p', { class: 'muted' }, 'チームと選手（氏名・HDCP）の登録')),
    );
  },
};
