// 採用上限（選手がチーム内で採用されるホール数）の決定。DOM に依存しない。
import { hdcpToInt, checkTeamSize } from './model.js';

// 配分表: チーム人数 → 配分順に当てる採用ホール数（合計 18）
export const ALLOCATION = {
  3: [7, 6, 5],
  4: [6, 5, 4, 3],
};

const fail = (code, message) => ({ ok: false, error: { code, message } });

// 同じ HDCP の選手が 2 人以上いるグループを返す（画面で順序指定を促すのに使う）
export function tiedGroups(team) {
  const byHdcp = new Map();
  for (const p of team.players) {
    const key = hdcpToInt(p.hdcp);
    if (!byHdcp.has(key)) byHdcp.set(key, []);
    byHdcp.get(key).push(p);
  }
  return [...byHdcp.values()].filter((g) => g.length > 1);
}

// 同 HDCP のグループ内で順序が未指定・重複していないかを調べる。問題のあるグループを返す
function unresolvedGroups(team) {
  return tiedGroups(team).filter((g) => {
    const orders = g.map((p) => p.tieOrder);
    if (orders.some((o) => o === null || o === undefined)) return true;
    return new Set(orders).size !== orders.length;
  });
}

// 配分順に並べた選手 ID を返す。direction: 'lowHdcpMore' | 'highHdcpMore'
// 同 HDCP は tieOrder 昇順（1 = 採用ホールが多い側）で、配分の向きに関係しない
function allocationOrder(team, direction) {
  const sign = direction === 'highHdcpMore' ? -1 : 1;
  return [...team.players].sort((a, b) => {
    const d = (hdcpToInt(a.hdcp) - hdcpToInt(b.hdcp)) * sign;
    if (d !== 0) return d;
    return (a.tieOrder ?? 0) - (b.tieOrder ?? 0);
  });
}

// 成功: { ok: true, quotas: { [playerId]: n }, order: [playerId, ...] }
// 失敗: { ok: false, error: { code, message } }
export function quotasFor(team, direction) {
  const sizeMsg = checkTeamSize(team.players.length);
  if (sizeMsg) return fail('INVALID_TEAM_SIZE', sizeMsg);

  const groups = unresolvedGroups(team);
  if (groups.length > 0) {
    const names = groups.map((g) => g.map((p) => p.name).join('・')).join(' / ');
    return fail('TIE_ORDER_MISSING', `HDCP が同じ選手の順序を指定してください（${names}）`);
  }

  const order = allocationOrder(team, direction);
  const table = ALLOCATION[team.players.length];
  const quotas = {};
  order.forEach((p, i) => {
    quotas[p.id] = table[i];
  });
  return { ok: true, quotas, order: order.map((p) => p.id) };
}
