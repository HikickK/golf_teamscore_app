// 入力画面の計算部分。DOM に依存しない純粋関数だけを置く。
import { HOLES, SCORE_MIN, SCORE_MAX, checkScore } from '../model.js';

export const FRONT_END = 9; // 前半（OUT）は 1〜9 番ホール＝インデックス 0〜8

// ---- 増減 ----

// 「−」「＋」を押したときの次の値。delta は -1 か +1。
//   current が null（未入力）のとき: 向きに関わらずパー（par）から始める
//   範囲（1〜20）を外れる操作は受け付けず、現在の値のまま ok:false と理由を返す
// 戻り値: { ok, value, error }
export function stepScore(current, par, delta) {
  if (current === null || current === undefined) {
    return { ok: true, value: par, error: null };
  }
  const next = current + delta;
  if (next < SCORE_MIN) return { ok: false, value: current, error: `スコアは ${SCORE_MIN} より小さくできません` };
  if (next > SCORE_MAX) return { ok: false, value: current, error: `スコアは ${SCORE_MAX} を超えられません` };
  return { ok: true, value: next, error: null };
}

// ---- 入力文字列の解釈 ----

// 全角数字（０-９）を半角にし、前後の空白（半角・全角・タブ等）を取り除く。途中の空白はそのまま残す
export function normalizeScoreText(text) {
  return String(text ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .trim(); // String.prototype.trim \u306f\u5168\u89d2\u7a7a\u767d\u3082\u9664\u304f
}

// 入力欄の文字列を解釈する。
//   空文字・空白のみ → 未入力へ戻す（kind: 'empty', value: null）
//   半角/全角の数字だけの文字列で 1〜20 → kind: 'ok'
//   それ以外（小数・符号つき・文字・範囲外・途中に空白）→ kind: 'invalid'（状態に入れない。error に理由）
// 戻り値: { kind: 'empty' | 'ok' | 'invalid', value, error }
export function parseScoreInput(text) {
  const t = normalizeScoreText(text);
  if (t === '') return { kind: 'empty', value: null, error: null };
  const n = /^\d+$/.test(t) ? Number(t) : NaN;
  const error = checkScore(n);
  if (error) return { kind: 'invalid', value: null, error };
  return { kind: 'ok', value: n, error: null };
}

// ---- 小計 ----

// scores[from..to-1] の入力済み（null でない）ホールの合計と件数
export function sumRange(scores, from, to) {
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    const s = scores[i];
    if (s === null || s === undefined) continue;
    sum += s;
    count++;
  }
  return { sum, count };
}

// 1 選手の OUT（1〜9）・IN（10〜18）・合計。入力済みのホールだけを足す。入力済みが 0 件なら null
export function subtotals(scores) {
  const o = sumRange(scores, 0, FRONT_END);
  const i = sumRange(scores, FRONT_END, HOLES);
  const none = (r) => (r.count === 0 ? null : r.sum);
  return {
    out: none(o),
    in: none(i),
    total: o.count + i.count === 0 ? null : o.sum + i.sum,
    outCount: o.count,
    inCount: i.count,
  };
}

// ---- 進み具合 ----

// チームの入力済みスコア数 / 全スコア数。全員揃ったら complete
export function teamProgress(team) {
  const total = team.players.length * HOLES;
  let filled = 0;
  for (const p of team.players) filled += sumRange(p.scores, 0, HOLES).count;
  return { filled, total, complete: total > 0 && filled === total };
}

// 全員がそのホール（0 始まり）を入力済みか
export function holeComplete(team, hole) {
  return team.players.length > 0 && team.players.every((p) => p.scores[hole] !== null && p.scores[hole] !== undefined);
}

// 選択中のチーム。未設定・存在しないなら先頭。チームが無ければ null
export function pickTeam(teams, selectedId) {
  return teams.find((t) => t.id === selectedId) ?? teams[0] ?? null;
}
