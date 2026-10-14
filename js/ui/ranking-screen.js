// 順位画面。担当タスクで実装する（それまでは準備中の表示）。
import { h } from './dom.js';

export const screen = {
  id: 'ranking',
  label: '順位',
  // container: 画面の描画先（毎回空にして渡される）。ctx: { state, ui, navigate, rerender, commitQuiet }
  render(container, ctx) {
    container.append(
      h('h2', {}, '順位'),
      h('div', { class: 'card' }, h('p', {}, '準備中です。'), h('p', { class: 'muted' }, 'チーム順位と同点処理の結果')),
    );
  },
};
