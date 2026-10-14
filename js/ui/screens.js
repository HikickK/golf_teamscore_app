// 5 つの画面の一覧。各画面は { id, label, render(container, ctx) } を持つ。
// 中身は T-9〜T-13 で順に作る。それまでは準備中の表示。

import { h } from './dom.js';

const placeholder = (title, note) => (container) => {
  container.append(
    h('h2', {}, title),
    h('div', { class: 'card' }, h('p', {}, '準備中です。'), h('p', { class: 'muted' }, note)),
  );
};

export const SCREENS = [
  { id: 'settings', label: '設定', render: placeholder('設定', 'パー・配分の向き・同点処理・データの書き出しと読み込み') },
  { id: 'teams', label: 'チーム', render: placeholder('チーム', 'チームと選手（氏名・HDCP）の登録') },
  { id: 'input', label: '入力', render: placeholder('入力', 'ホールごとのスコア入力') },
  { id: 'assign', label: '割当', render: placeholder('割当', '採用ホールの自動割当と手動調整') },
  { id: 'ranking', label: '順位', render: placeholder('順位', 'チーム順位と同点処理の結果') },
];
