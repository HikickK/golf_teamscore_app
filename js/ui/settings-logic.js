// 設定画面の純粋なロジック（DOM に依存しない）。
import { checkPar } from '../model.js';

// 全角数字を半角にする（iPhone の日本語キーボード対策）
const toHalfWidth = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// パー入力欄の文字列を解釈する。成功: { ok: true, value } / 失敗: { ok: false, message }
export function parseParInput(text) {
  const t = toHalfWidth(String(text ?? '')).trim();
  const value = t === '' ? NaN : Number(t);
  const message = checkPar(value);
  return message ? { ok: false, message } : { ok: true, value };
}

// 前半・後半に分けたホール番号（1 始まり）
export const FRONT_HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const BACK_HOLES = [10, 11, 12, 13, 14, 15, 16, 17, 18];

export const DIRECTION_OPTIONS = [
  { value: 'lowHdcpMore', label: 'HDCP が小さい人ほど採用ホール数が多い', note: '初期値' },
  { value: 'highHdcpMore', label: 'HDCP が大きい人ほど採用ホール数が多い', note: '' },
];

export const TIE_BREAK_OPTIONS = [
  { value: 'back9', label: '後半9ホールの採用スコア合計', desc: '10〜18番の採用スコアの合計が小さいチームを上位にします。', note: '' },
  { value: 'hdcpSum', label: '所属選手の HDCP 合計', desc: 'チーム所属選手の HDCP 合計が小さいチームを上位にします。', note: '' },
  { value: 'scoreCounts', label: '全スコアの内訳（アルバトロス〜）', desc: 'チーム各員の全スコアを、アルバトロス → イーグル → バーディ → パー → ボギー → … の順に比べ、最初に差が出た区分で決めます。', note: '初期値' },
];

// 書き出しファイルの MIME
export const JSON_MIME = 'application/json';
