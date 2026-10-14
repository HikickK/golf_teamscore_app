// アプリの状態（コンペのデータ）と保存・再描画の仕組み。DOM に依存しない。
//   状態を変更 → updatedAt を更新 → 端末内に保存 → 購読者（画面）に通知、の一方向。

import { createCompetition } from './model.js';
import * as defaultStorage from './storage.js';

// storage は { load, save, clear } を持つオブジェクト（テストで差し替える）
export function createState(storage = defaultStorage) {
  const listeners = new Set();
  let competition;
  let fresh;
  let loadError = null; // 起動時の読込エラー
  let saveError = null; // 直近の保存エラー（成功すると null に戻る）
  let savedAt = null; // 直近に保存できた時刻（ISO）
  let locked = false; // 保存データが壊れている間は、上書きを防ぐため変更を受け付けない

  const loaded = storage.load();
  if (loaded.ok) {
    competition = loaded.competition;
    fresh = loaded.fresh;
  } else {
    competition = createCompetition();
    fresh = true;
    loadError = loaded.error;
    locked = loaded.error.code === 'INVALID_STORED';
  }

  const notify = () => listeners.forEach((fn) => fn());

  function persist() {
    const r = storage.save(competition);
    if (r.ok) {
      saveError = null;
      savedAt = new Date().toISOString();
    } else {
      saveError = r.error;
    }
  }

  return {
    get competition() { return competition; },
    get fresh() { return fresh; },
    get loadError() { return loadError; },
    get saveError() { return saveError; },
    get savedAt() { return savedAt; },
    get locked() { return locked; },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // 変更を加える。mutator は competition を直接書き換える関数。受け付けたら true
    commit(mutator) {
      if (locked) return false;
      mutator(competition);
      competition.updatedAt = new Date().toISOString();
      fresh = false;
      persist();
      notify();
      return true;
    },

    // コンペ全体を置き換える（JSON の読み込み後に使う。確認ダイアログは呼び出し側）
    replace(next) {
      competition = next;
      fresh = false;
      locked = false;
      loadError = null;
      persist();
      notify();
    },

    // 全データ初期化（確認ダイアログは呼び出し側）。壊れた保存データの復旧にも使う
    reset() {
      const r = storage.clear();
      competition = createCompetition();
      fresh = true;
      locked = false;
      loadError = null;
      saveError = r.ok ? null : r.error;
      if (r.ok) persist();
      notify();
    },
  };
}
