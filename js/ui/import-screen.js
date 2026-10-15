// 取込画面（仮置き）: スコアのテキスト取り込み。本体は T-21 が作る。
import { h } from './dom.js';

export const screen = {
  id: 'import',
  label: '取込',
  render(container) {
    container.append(h('h2', {}, '取込'), h('p', { class: 'hint' }, '準備中です。'));
  },
};
