// 起動処理: 状態の読込 → タブと画面の描画。状態が変わるたびに現在の画面を描き直す。

import { createState } from './state.js';
import { SCREENS } from './ui/screens.js';
import { h, clear } from './ui/dom.js';
import { registerServiceWorker, applyUpdate } from './pwa.js';
import { modeOf, readiness, screensFor, resolveScreen } from './mode.js';

const state = createState();

const $screen = document.getElementById('screen');
const $tabs = document.getElementById('tabs');
const $banner = document.getElementById('banner');
const $status = document.getElementById('save-status');

// 表示する画面: ハッシュがそのモードの画面ならそれ、違えば起動時の画面（AC-41, 44）
const currentId = () => resolveScreen(location.hash, state.competition);

// ヘッダーのモード表示と、点検 NG の項目の欄（画面の描き直しの影響を受けない専用の要素。index.html は変えず、ここで作る）
const $header = document.querySelector('.app-header');
const $modeLabel = h('span', { class: 'mode-label' });
const $modeButton = h('button', { type: 'button', id: 'mode-switch' });
const $modeBar = h('div', { class: 'mode-bar' }, $modeLabel, $modeButton);
$header.append($modeBar);
const $issues = h('section', { class: 'mode-issues', id: 'mode-issues', role: 'alert', hidden: true });
$banner.after($issues);

function navigate(id) {
  // 当日に、準備の画面（チームなど）へ案内されたとき（順位・割当・入力の「②チームへ」など）:
  // そのままでは当日の画面に振り替わって直せないので、準備に戻る確認をしてから、その画面へ移る（AC-41, 42）
  if (modeOf(state.competition) === 'day' && !screensFor('day').includes(id)) {
    if (!confirm('この画面は事前準備のものです。準備に戻って直しますか？（入力済みのスコアは消えません）')) return;
    if (!state.commit((c) => { c.mode = 'prep'; })) return;
  }
  if (location.hash === `#${id}`) renderAll();
  else location.hash = id; // hashchange で描画される
}

// 画面に渡すもの
//   state       : 状態。変更は state.commit() だけが入口
//   ui          : 画面をまたいで覚えておく操作中の情報（保存はしない）。selectedTeamId = ③入力・④割当で選んでいるチーム
//   navigate(id): 画面を切り替える
//   rerender()  : 現在の画面を描き直す
//   commitQuiet : state.commit と同じだが、画面全体の再描画をしない（保存・ヘッダー・お知らせだけ更新）。
//                 入力欄のフォーカスを保ちたいとき（打鍵ごとの保存など）に使い、画面側で必要な部分だけ自分で更新する
let quiet = false;
const ctx = {
  state,
  ui: { selectedTeamId: null },
  navigate,
  rerender: () => renderAll(),
  commitQuiet(mutator) {
    quiet = true;
    try {
      return state.commit(mutator);
    } finally {
      quiet = false;
    }
  },
};

function renderTabs() {
  clear($tabs);
  const cur = currentId();
  for (const id of screensFor(modeOf(state.competition))) {
    const s = SCREENS.find((x) => x.id === id);
    $tabs.append(h('button', { type: 'button', 'aria-current': s.id === cur ? 'page' : null, onclick: () => navigate(s.id) }, s.label));
  }
}

// 点検 NG の項目と「直す画面へ」。切り替えは行わない（AC-43）
function showIssues(issues, message) {
  clear($issues);
  $issues.append(h('h2', {}, '当日を始められません'));
  if (message) $issues.append(h('p', {}, message));
  if (issues.length > 0) {
    $issues.append(h('ul', {}, issues.map((i) => h('li', {},
      h('span', { class: 'issue-text' }, i.message),
      h('button', { type: 'button', class: 'fix-screen', onclick: () => navigate(i.screen) }, `直す画面へ（${SCREENS.find((x) => x.id === i.screen).label}）`),
    ))));
  }
  $issues.hidden = false;
}
function hideIssues() {
  clear($issues);
  $issues.hidden = true;
}

function startDay() {
  const r = readiness(state.competition);
  if (!r.ok) {
    showIssues(r.issues);
    return;
  }
  if (!state.commit((c) => { c.mode = 'day'; })) showIssues([], '保存データが壊れているため、切り替えできません。画面上部の「保存データを初期化して始める」で復旧してください。');
}

function backToPrep() {
  if (!confirm('準備に戻ります。事前準備の画面では、パー・チーム・HDCP などを変更できます。よろしいですか？')) return;
  state.commit((c) => { c.mode = 'prep'; });
}

function renderMode() {
  const day = modeOf(state.competition) === 'day';
  $modeLabel.textContent = day ? '当日' : '事前準備';
  $modeButton.textContent = day ? '準備に戻る' : '当日を始める';
  $modeButton.classList.toggle('primary', !day);
  $modeButton.onclick = day ? backToPrep : startDay;
}

function renderBanner() {
  clear($banner);
  $banner.classList.remove('is-error');
  $banner.hidden = true;

  // 保存データが壊れている: 復旧するまで変更できない
  if (state.loadError && state.locked) {
    $banner.hidden = false;
    $banner.classList.add('is-error');
    $banner.append(
      h('p', {}, `${state.loadError.message}。このままでは保存データを守るため入力できません。`),
      h('button', { type: 'button', class: 'danger', onclick: () => {
        if (confirm('壊れた保存データを消して、新しく始めます。よろしいですか？')) state.reset();
      } }, '保存データを初期化して始める'),
    );
    return;
  }
  const err = state.saveError || state.loadError;
  if (err) {
    $banner.hidden = false;
    $banner.classList.add('is-error');
    $banner.append(h('span', {}, err.message));
  }
}

function renderStatus() {
  $status.classList.toggle('is-error', Boolean(state.saveError));
  if (state.saveError) $status.textContent = '保存できていません';
  else if (state.savedAt) $status.textContent = `保存済み ${new Date(state.savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
  else $status.textContent = '';
}

function renderAll() {
  hideIssues();
  // ハッシュがそのモードの画面でなければ、表示する画面に合わせて直す（履歴は増やさない）
  const id = currentId();
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  renderMode();
  renderTabs();
  renderBanner();
  renderStatus();
  const screen = SCREENS.find((s) => s.id === id);
  clear($screen);
  screen.render($screen, ctx);
}

// 新しい版の通知（画面の描き直しの影響を受けないよう、専用の欄に出す）
const $update = document.getElementById('update-banner');
function showUpdate(reg) {
  clear($update);
  $update.append(
    h('span', {}, '新しい版があります。'),
    ' ',
    h('button', { type: 'button', class: 'primary', onclick: () => applyUpdate(reg) }, '更新する'),
  );
  $update.hidden = false;
}
registerServiceWorker({ onUpdateReady: showUpdate });

window.addEventListener('hashchange', () => {
  renderAll();
  window.scrollTo(0, 0);
});
state.subscribe(() => {
  if (quiet) {
    renderBanner();
    renderStatus();
  } else {
    renderAll();
  }
});
renderAll();
