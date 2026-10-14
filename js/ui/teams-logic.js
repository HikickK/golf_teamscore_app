// チーム画面のロジック。DOM に依存しない純粋関数だけを置く（tests/teams-logic.test.js で検証）。
// 方針: ここで作る・変える状態は、常に model.js の validateCompetition を通る形にする。
import { HOLES, checkHdcp, checkTeamSize, hdcpToInt } from '../model.js';
import { tiedGroups } from '../quota.js';

// ---- ID の発行（コンペ全体で一意）----

function allIds(competition) {
  const ids = new Set();
  for (const t of competition.teams) {
    ids.add(t.id);
    for (const p of t.players) ids.add(p.id);
  }
  return ids;
}

// 既存の `t<数字>` の最大値 + 1 から、未使用の ID を探す。チームを削除しても、使われている ID とは重ならない
export function nextTeamId(competition) {
  const used = allIds(competition);
  let n = 1;
  for (const t of competition.teams) {
    const m = /^t(\d+)$/.exec(t.id);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  while (used.has(`t${n}`)) n++;
  return `t${n}`;
}

// `{チームID}p<数字>`。チーム内の最大番号 + 1 から探す（選手を削除して追加しても、他の選手と重ならない）
export function nextPlayerId(competition, team) {
  const used = allIds(competition);
  const prefix = `${team.id}p`;
  let n = 1;
  for (const p of team.players) {
    if (p.id.startsWith(prefix) && /^\d+$/.test(p.id.slice(prefix.length))) n = Math.max(n, Number(p.id.slice(prefix.length)) + 1);
  }
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// ---- 生成 ----

export function createPlayer(id, name) {
  return { id, name, hdcp: 0, tieOrder: null, scores: Array(HOLES).fill(null) };
}

// 「選手N」のうち、チーム内で使われていない最小の N
export function defaultPlayerName(team) {
  const used = new Set(team.players.map((p) => p.name));
  let n = 1;
  while (used.has(`選手${n}`)) n++;
  return `選手${n}`;
}

// 「チームN」（N は 件数+1 から、同名があれば進める）
export function defaultTeamName(competition) {
  const used = new Set(competition.teams.map((t) => t.name));
  let n = competition.teams.length + 1;
  while (used.has(`チーム${n}`)) n++;
  return `チーム${n}`;
}

// 追加直後のチーム: 4 名・HDCP 0（同値なので順序指定が必要）・自動割当
export function createTeam(competition) {
  const team = {
    id: nextTeamId(competition),
    name: defaultTeamName(competition),
    assignmentMode: 'auto',
    manualAssignment: null,
    players: [],
  };
  for (let i = 1; i <= 4; i++) team.players.push(createPlayer(`${team.id}p${i}`, `選手${i}`));
  return team;
}

// ---- 人数の変更（3 ⇄ 4 のみ）----

export const canAddPlayer = (team) => team.players.length === 3;
export const canRemovePlayer = (team) => team.players.length === 4;

// 3 名のときだけ 4 人目を追加する。追加できたら true
export function addPlayer(competition, team) {
  if (!canAddPlayer(team)) return false;
  team.players.push(createPlayer(nextPlayerId(competition, team), defaultPlayerName(team)));
  cleanTieOrders(team);
  return true;
}

// 4 名のときだけ削除する。手動割当に残る ID は null に直し、同 HDCP の順序も整える。削除できたら true
export function removePlayer(team, playerId) {
  if (!canRemovePlayer(team)) return false;
  const i = team.players.findIndex((p) => p.id === playerId);
  if (i < 0) return false;
  team.players.splice(i, 1);
  if (team.manualAssignment) team.manualAssignment = team.manualAssignment.map((id) => (id === playerId ? null : id));
  cleanTieOrders(team);
  return true;
}

export const playerHasScores = (player) => player.scores.some((s) => s !== null);
export const teamHasScores = (team) => team.players.some(playerHasScores);

// ---- 同 HDCP の順序 ----

// 同 HDCP のグループに入っていない選手の tieOrder は null に戻す。
// グループ人数を超える値（人数が減った・HDCP が変わった後の古い値）も null に戻す
export function cleanTieOrders(team) {
  const groups = tiedGroups(team);
  const inGroup = new Map();
  for (const g of groups) for (const p of g) inGroup.set(p.id, g.length);
  for (const p of team.players) {
    const size = inGroup.get(p.id);
    if (size === undefined || (p.tieOrder !== null && p.tieOrder > size)) p.tieOrder = null;
  }
}

// 順序が未指定・重複している同 HDCP グループ（AC-11 の表示用）。quota.js の判定と同じ
export function unresolvedTieGroups(team) {
  return tiedGroups(team).filter((g) => {
    const orders = g.map((p) => p.tieOrder);
    if (orders.some((o) => o === null || o === undefined)) return true;
    return new Set(orders).size !== orders.length;
  });
}

// 「HDCP が同じ選手の順序を決めてください（A・B / C・D）」。問題が無ければ null
export function tieWarning(team) {
  const groups = unresolvedTieGroups(team);
  if (groups.length === 0) return null;
  return `HDCP が同じ選手の順序を決めてください（${groups.map((g) => g.map((p) => p.name).join('・')).join(' / ')}）`;
}

// 順序を指定する（null で未指定に戻す）。グループ内の人数の範囲外なら false
export function setTieOrder(team, playerId, order) {
  const p = team.players.find((x) => x.id === playerId);
  if (!p) return false;
  if (order !== null) {
    const g = tiedGroups(team).find((grp) => grp.includes(p));
    if (!g || !Number.isInteger(order) || order < 1 || order > g.length) return false;
  }
  p.tieOrder = order;
  return true;
}

// ---- 編集 ----

// HDCP 文字列の解釈。仕様（推測で決めた点）:
//  - 前後の空白（全角空白含む）は許容、全角数字・全角ピリオド・全角/各種マイナス・プラスは半角に直す
//  - 形式は [符号]整数[.小数] または [符号].小数。カンマ区切り・指数表記・空欄は不可
//  - 小数第2位までを超える場合は checkHdcp のエラーとする
// 戻り値: { ok: true, value } | { ok: false, message }
export function parseHdcp(text) {
  const s = String(text ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[－−ー‐-―]/g, '-')
    .replace(/＋/g, '+')
    .trim();
  if (s === '') return { ok: false, message: 'HDCP を入力してください' };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: false, message: 'HDCP は数値で入力してください' };
  let value = Number(s);
  if (value === 0) value = 0; // -0 を 0 にする
  const msg = checkHdcp(value);
  return msg ? { ok: false, message: msg } : { ok: true, value };
}

// HDCP を設定し、同値でなくなった選手の順序を戻す。value は検証済みの数値
export function setHdcp(team, playerId, value) {
  const p = team.players.find((x) => x.id === playerId);
  if (!p) return false;
  p.hdcp = value;
  cleanTieOrders(team);
  return true;
}

// 同じ HDCP かどうか（表示用）
export const sameHdcp = (a, b) => hdcpToInt(a) === hdcpToInt(b);

export { checkTeamSize };
