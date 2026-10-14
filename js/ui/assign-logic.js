// 割当画面の表示用データの組み立てと、モード切替後の状態。DOM と state に依存しない純粋関数。
import { HOLES } from '../model.js';
import { quotasFor } from '../quota.js';
import { autoAssign, checkManual, tryAssign, hasAllScores, BACK_START } from '../assign.js';

// 選択中のチームを返す。未設定・存在しないチームなら先頭。チームが無ければ null
export function pickTeam(competition, selectedId) {
  const teams = competition.teams;
  if (teams.length === 0) return null;
  return teams.find((t) => t.id === selectedId) ?? teams[0];
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// 画面に出すデータ。status:
//   'setup'      採用上限を決められない（HDCP の順序未指定など）。message に理由
//   'incomplete' スコアが未入力
//   'ready'      割当表を出せる
// ready のとき: mode / players / rows / subtotals / playerStats / manual / confirmed
export function buildAssignView(team, competition) {
  const alloc = quotasFor(team, competition.settings.allocationDirection);
  if (!alloc.ok) return { status: 'setup', message: alloc.error.message };
  if (!hasAllScores(team)) return { status: 'incomplete', message: 'スコアが未入力のホールがあります' };

  const mode = team.assignmentMode === 'manual' ? 'manual' : 'auto';
  let assignment;
  if (mode === 'manual') {
    assignment = team.manualAssignment ? [...team.manualAssignment] : new Array(HOLES).fill(null);
  } else {
    const r = autoAssign(team, alloc);
    if (!r.ok) return { status: 'setup', message: r.error.message };
    assignment = r.assignment;
  }

  const check = checkManual(team, alloc, assignment);
  const players = team.players.map((p) => ({ id: p.id, name: p.name, quota: alloc.quotas[p.id] }));

  const rows = assignment.map((adoptedId, h) => {
    const adopter = team.players.find((p) => p.id === adoptedId);
    return {
      hole: h + 1,
      index: h,
      par: competition.pars[h],
      adoptedId: adopter ? adopter.id : null,
      adoptedScore: adopter ? adopter.scores[h] : null,
      cells: team.players.map((p) => ({ playerId: p.id, score: p.scores[h], adopted: p.id === adoptedId })),
    };
  });

  // 小計: 区間（前半 / 後半 / 全体）ごとの、選手別の採用スコア合計と、区間の採用スコア合計
  const range = (from, to) => {
    const part = rows.slice(from, to);
    return {
      perPlayer: team.players.map((p) => sum(part.map((r) => r.cells.find((c) => c.playerId === p.id)).filter((c) => c.adopted).map((c) => c.score))),
      total: sum(part.map((r) => r.adoptedScore ?? 0)),
    };
  };
  const subtotals = { front: range(0, BACK_START), back: range(BACK_START, HOLES), all: range(0, HOLES) };

  const playerStats = players.map((p) => {
    const count = check.counts[p.id];
    return { ...p, count, state: count > p.quota ? 'over' : count < p.quota ? 'under' : 'ok' };
  });

  return {
    status: 'ready',
    mode,
    players,
    rows,
    subtotals,
    playerStats,
    unassignedCount: check.unassigned.length,
    manual: check,
    // 自動は常に確定。手動は全ホール選択済み・採用数が上限に一致したとき確定（AC-22）
    confirmed: mode === 'auto' ? true : check.complete,
    // 手動が未完了のとき、画面に出す説明
    incompleteText: mode === 'manual' && !check.complete ? incompleteText(check) : null,
  };
}

function incompleteText(check) {
  const parts = [];
  if (check.unassigned.length > 0) parts.push(`未選択のホールが ${check.unassigned.length} あります`);
  for (const u of check.underQuota) parts.push(`${u.name}さんはあと ${u.quota - u.count} ホール必要です`);
  for (const o of check.overQuota) parts.push(`${o.name}さんが上限 ${o.quota} ホールを超えています`);
  return parts.join(' / ');
}

// 自動 → 手動: その時点の自動結果をコピーして手動の初期値にする（AC-23）。失敗は { ok:false, error }
export function switchToManual(team, competition) {
  const alloc = quotasFor(team, competition.settings.allocationDirection);
  if (!alloc.ok) return alloc;
  const r = autoAssign(team, alloc);
  if (!r.ok) return r;
  return { ok: true, assignmentMode: 'manual', manualAssignment: [...r.assignment] };
}

// 手動 → 自動: 手動の選択を破棄する（AC-24。確認は呼び出し側）
export function switchToAuto() {
  return { assignmentMode: 'auto', manualAssignment: null };
}

// 手動でセルをタップしたときの次の割当。同じ選手をもう一度タップしたら選択解除。
// 成功: { ok:true, assignment } / 失敗（上限超過など）: { ok:false, error }
export function applyManualTap(team, competition, hole, playerId) {
  const alloc = quotasFor(team, competition.settings.allocationDirection);
  if (!alloc.ok) return alloc;
  const cur = team.manualAssignment ?? new Array(HOLES).fill(null);
  const next = cur[hole] === playerId ? null : playerId;
  return tryAssign(team, alloc, cur, hole, next);
}
