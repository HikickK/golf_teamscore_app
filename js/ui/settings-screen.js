// 設定画面。担当タスクで実装する（それまでは準備中の表示）。
import { h } from './dom.js';

export const screen = {
  id: 'settings',
  label: '設定',
  // container: 画面の描画先（毎回空にして渡される）。ctx: { state, ui, navigate, rerender, commitQuiet }
  render(container, ctx) {
    container.append(
      h('h2', {}, '設定'),
      h('div', { class: 'card' }, h('p', {}, '準備中です。'), h('p', { class: 'muted' }, 'パー・配分の向き・同点処理・データの書き出しと読み込み')),
    );
  },
};
