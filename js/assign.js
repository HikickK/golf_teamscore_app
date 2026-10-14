// 採用ホールの割当（自動 / 手動の検証）。DOM に依存しない。
//
// 用語: alloc は quotasFor() の成功結果 { quotas: {playerId: n}, order: [playerId…] }。
//       order は配分順（採用ホールが多い側が先）。

import { HOLES } from './model.js';

export const BACK_START = 9; // 後半9ホールの開始位置（0 始まり。10番ホール = 9）

const fail = (code, message) => ({ ok: false, error: { code, message } });

function playersInOrder(team, alloc) {
  return alloc.order.map((id) => team.players.find((p) => p.id === id));
}

// 全選手・全ホールのスコアが揃っているか
export function hasAllScores(team) {
  return team.players.every((p) => p.scores.every((s) => Number.isInteger(s)));
}

// 自動割当: 各選手の採用数を採用上限にちょうど一致させ、
//   ① チーム合計が最小 → ② 後半9ホールの合計が最小 → ③ ホール1から配分順が先の選手を優先
// の順で決める（同じ入力には常に同じ結果。AC-16, 17）。動的計画法で厳密に解く。
//
// 成功: { ok: true, assignment: [playerId × ホール数], total, back }
// opts.backStart: 後半の開始位置（既定 9）。テストで少ないホール数を使うための引数
export function autoAssign(team, alloc, opts = {}) {
  const backStart = opts.backStart ?? BACK_START;
  const players = playersInOrder(team, alloc);
  const n = players[0].scores.length;

  if (!hasAllScores(team)) return fail('INCOMPLETE_SCORES', 'スコアが未入力のホールがあります');

  const quota = players.map((p) => alloc.quotas[p.id]);
  if (quota.reduce((a, b) => a + b, 0) !== n) return fail('QUOTA_MISMATCH', '採用上限の合計がホール数と一致しません');

  const k = players.length;
  const memo = new Map();

  // counts = 各選手のこれまでの採用数。処理済みホール数 = 採用数の合計
  function best(counts) {
    const h = counts.reduce((a, b) => a + b, 0);
    if (h === n) return { t: 0, b: 0 };
    const key = counts.join(',');
    if (memo.has(key)) return memo.get(key);

    let res = null;
    for (let i = 0; i < k; i++) {
      if (counts[i] >= quota[i]) continue;
      counts[i]++;
      const next = best(counts);
      counts[i]--;
      const s = players[i].scores[h];
      const t = s + next.t;
      const b = (h >= backStart ? s : 0) + next.b;
      if (res === null || t < res.t || (t === res.t && b < res.b)) res = { t, b };
    }
    memo.set(key, res);
    return res;
  }

  const optimum = best(new Array(k).fill(0));

  // 前から順に、最適を保てる選手のうち配分順が先の人を選ぶ（辞書式で最小の並びになる）
  const counts = new Array(k).fill(0);
  const assignment = [];
  for (let h = 0; h < n; h++) {
    const cur = best(counts);
    for (let i = 0; i < k; i++) {
      if (counts[i] >= quota[i]) continue;
      counts[i]++;
      const next = best(counts);
      counts[i]--;
      const s = players[i].scores[h];
      if (s + next.t === cur.t && (h >= backStart ? s : 0) + next.b === cur.b) {
        assignment.push(players[i].id);
        counts[i]++;
        break;
      }
    }
  }

  return { ok: true, assignment, total: optimum.t, back: optimum.b };
}

// 割当（ホール別の採用者 ID）から、採用スコアと合計を求める。未割当・未入力があれば null
export function assignmentTotals(team, assignment, opts = {}) {
  const backStart = opts.backStart ?? BACK_START;
  const adopted = [];
  for (let h = 0; h < assignment.length; h++) {
    const p = team.players.find((x) => x.id === assignment[h]);
    const s = p ? p.scores[h] : null;
    if (!Number.isInteger(s)) return null;
    adopted.push(s);
  }
  const total = adopted.reduce((a, b) => a + b, 0);
  const back = adopted.slice(backStart).reduce((a, b) => a + b, 0);
  return { adopted, total, front: total - back, back };
}

// 手動割当の状態を調べる（AC-21, 22）
// manual: ホール別の採用者 ID（未選択は null）
export function checkManual(team, alloc, manual) {
  const counts = {};
  for (const p of team.players) counts[p.id] = 0;
  const unassigned = [];
  manual.forEach((id, h) => {
    if (id === null || id === undefined) unassigned.push(h);
    else if (id in counts) counts[id]++;
  });

  const overQuota = [];
  const underQuota = [];
  for (const p of team.players) {
    const quota = alloc.quotas[p.id];
    if (counts[p.id] > quota) overQuota.push({ playerId: p.id, name: p.name, quota, count: counts[p.id] });
    if (counts[p.id] < quota) underQuota.push({ playerId: p.id, name: p.name, quota, count: counts[p.id] });
  }
  const complete = unassigned.length === 0 && overQuota.length === 0 && underQuota.length === 0;
  return { complete, counts, unassigned, overQuota, underQuota };
}

// 手動で 1 ホールの採用者を選ぶ。上限を超える選択は受理しない（AC-21）。playerId = null で選択解除
// 成功: { ok: true, assignment: 新しい配列 }（元の配列は変更しない）
export function tryAssign(team, alloc, manual, hole, playerId) {
  const next = manual ? [...manual] : new Array(HOLES).fill(null);
  if (playerId !== null) {
    const p = team.players.find((x) => x.id === playerId);
    if (!p) return fail('UNKNOWN_PLAYER', 'チームに存在しない選手です');
    const quota = alloc.quotas[playerId];
    const count = next.filter((id, h) => id === playerId && h !== hole).length;
    if (count >= quota) return fail('QUOTA_EXCEEDED', `${p.name}さんは上限 ${quota} ホールに達しています`);
  }
  next[hole] = playerId;
  return { ok: true, assignment: next };
}
