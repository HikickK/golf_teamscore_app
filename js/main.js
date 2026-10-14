// 起動処理: 状態の読込 → タブと画面の描画。状態が変わるたびに現在の画面を描き直す。

import { createState } from './state.js';
import { SCREENS } from './ui/screens.js';
import { h, clear } from './ui/dom.js';

const state = createState();

const $screen = document.getElementById('screen');
const $tabs = document.getElementById('tabs');
const $banner = document.getElementById('banner');
const $status = document.getElementById('save-status');

// 保存データが無い間は ① 設定から、あれば ③ 入力から始める
const initialId = () => (state.fresh || state.competition.teams.length === 0 ? 'settings' : 'input');
const currentId = () => {
  const id = location.hash.replace('#', '');
  return SCREENS.some((s) => s.id === id) ? id : initialId();
};

function navigate(id) {
  if (location.hash === `#${id}`) renderAll();
  else location.hash = id; // hashchange で描画される
}

const ctx = { state, navigate, rerender: () => renderAll() };

function renderTabs() {
  clear($tabs);
  const cur = currentId();
  for (const s of SCREENS) {
    $tabs.append(h('button', { type: 'button', 'aria-current': s.id === cur ? 'page' : null, onclick: () => navigate(s.id) }, s.label));
  }
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
  renderTabs();
  renderBanner();
  renderStatus();
  const screen = SCREENS.find((s) => s.id === currentId());
  clear($screen);
  screen.render($screen, ctx);
}

window.addEventListener('hashchange', () => {
  renderAll();
  window.scrollTo(0, 0);
});
state.subscribe(renderAll);
renderAll();
