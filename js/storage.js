// 端末内保存（localStorage）と JSON の書き出し / 読み込み。
// store 引数は localStorage 互換のオブジェクト（getItem / setItem / removeItem）。省略時は localStorage。
// テストでは差し替える。ここでは DOM やダイアログを扱わない（確認ダイアログは画面側）。

import { createCompetition, validateCompetition } from './model.js';

export const STORAGE_KEY = 'golf_teamscore.v1';
export const EXPORT_FILENAME = 'golf_teamscore.json';

const fail = (code, message, extra = {}) => ({ ok: false, error: { code, message, ...extra } });

// Safari のプライベートモード等では localStorage へのアクセス自体が例外になることがある
function getStore(store) {
  if (store) return store;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// 起動時の読込。
// 成功: { ok: true, competition, fresh }（fresh = 保存データが無く新規作成した）
// 失敗: { ok: false, error: { code: 'STORAGE_FAILED' | 'INVALID_STORED', message } }
//   INVALID_STORED のときは保存データを上書きしない（呼び出し側が確認のうえ初期化する）
export function load(store) {
  const s = getStore(store);
  if (!s) return fail('STORAGE_FAILED', 'この端末では保存機能を使えません');

  let raw;
  try {
    raw = s.getItem(STORAGE_KEY);
  } catch (e) {
    return fail('STORAGE_FAILED', `保存データを読み込めませんでした: ${e.message}`);
  }
  if (raw === null || raw === undefined) return { ok: true, competition: createCompetition(), fresh: true };

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return fail('INVALID_STORED', '保存されているデータが壊れています');
  }
  const v = validateCompetition(obj);
  if (!v.ok) return fail('INVALID_STORED', '保存されているデータの形式が正しくありません', { details: v.errors });
  return { ok: true, competition: obj, fresh: false };
}

// 変更のたびに呼ぶ保存。検証を通らないデータは保存しない（保存データが常に読み込める状態を保つ）
// 成功: { ok: true } / 失敗: { ok: false, error: { code: 'INVALID_DATA' | 'STORAGE_FAILED', message } }
export function save(competition, store) {
  const v = validateCompetition(competition);
  if (!v.ok) return fail('INVALID_DATA', '保存しようとしたデータの形式が正しくありません', { details: v.errors });

  const s = getStore(store);
  if (!s) return fail('STORAGE_FAILED', 'この端末では保存機能を使えません');
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(competition));
  } catch (e) {
    return fail('STORAGE_FAILED', `保存できませんでした。JSON を書き出してください（${e.message}）`);
  }
  return { ok: true };
}

// 全データ初期化（確認ダイアログは呼び出し側。AC-34）
export function clear(store) {
  const s = getStore(store);
  if (!s) return fail('STORAGE_FAILED', 'この端末では保存機能を使えません');
  try {
    s.removeItem(STORAGE_KEY);
  } catch (e) {
    return fail('STORAGE_FAILED', `削除できませんでした: ${e.message}`);
  }
  return { ok: true };
}

// 書き出し用の { filename, text } を作る（AC-30）
export function exportJson(competition) {
  return { filename: EXPORT_FILENAME, text: JSON.stringify(competition, null, 2) };
}

// 読み込み。形式が不正なときは例外を投げず、保存データには一切触れない（AC-31, 32）
// 成功: { ok: true, competition } ※呼び出し側が確認ダイアログのあと save() して置き換える
// 失敗: { ok: false, error: { code: 'INVALID_IMPORT', message, details? } }
export function importJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return fail('INVALID_IMPORT', 'ファイルが空です');

  let obj;
  try {
    obj = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return fail('INVALID_IMPORT', 'JSON として読み込めませんでした');
  }
  const v = validateCompetition(obj);
  if (!v.ok) {
    const first = v.errors[0];
    return fail('INVALID_IMPORT', `データの形式が正しくありません（${first.path || '全体'}: ${first.message}）`, { details: v.errors });
  }
  return { ok: true, competition: obj };
}
