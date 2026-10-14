// チーム合計・順位・同点処理。DOM に依存しない。
import { hdcpToInt, HOLES } from './model.js';
import { quotasFor } from './quota.js';
import { autoAssign, checkManual, assignmentTotals, hasAllScores } from './assign.js';

// ---- 同点処理 方式3 のスコア区分（パーとの差） ----
// 0 アルバトロス(−3以下) / 1 イーグル(−2) / 2 バーディ(−1) / 3 パー(0) / 4 ボギー(+1) / 5 ダブルボギー(+2) …
// 20 = +17。0〜3 は数が多いほど上位、4 以降は少ないほど上位
const DIFF_MIN = -3;
const DIFF_MAX = 17;
const CATEGORY_COUNT = DIFF_MAX - DIFF_MIN + 1;
const GOOD_CATEGORIES = 4;

const NAMED = ['アルバトロス', 'イーグル', 'バーディ', 'パー', 'ボギー', 'ダブルボギー', 'トリプルボギー'];
export const categoryLabel = (i) => (i < NAMED.length ? NAMED[i] : `パー+${i + DIFF_MIN}`);
export const categoryIndex = (diff) => Math.min(Math.max(diff, DIFF_MIN), DIFF_MAX) - DIFF_MIN;

// チーム各員の全ホールのスコアを区分ごとに数える（採用されなかったスコアも含む）
export function scoreCounts(team, pars) {
  const counts = new Array(CATEGORY_COUNT).fill(0);
  for (const p of team.players) {
    p.scores.forEach((s, h) => {
      counts[categoryIndex(s - pars[h])]++;
    });
  }
  return counts;
}

// ---- 同点処理の比較。A が上位なら cmp < 0、B が上位なら cmp > 0、決着しなければ 0 ----
const fmtHdcp = (int) => String(int / 100);

function compareTieBreak(method, a, b) {
  if (method === 'back9') {
    return { cmp: Math.sign(a.back - b.back), basis: '後半9ホール合計', a: a.back, b: b.back };
  }
  if (method === 'hdcpSum') {
    return { cmp: Math.sign(a.hdcpSum - b.hdcpSum), basis: 'HDCP合計', a: fmtHdcp(a.hdcpSum), b: fmtHdcp(b.hdcpSum) };
  }
  // scoreCounts: 最初に差が出た区分で決める
  for (let i = 0; i < CATEGORY_COUNT; i++) {
    if (a.counts[i] === b.counts[i]) continue;
    const aMore = a.counts[i] > b.counts[i];
    const aBetter = i < GOOD_CATEGORIES ? aMore : !aMore;
    return { cmp: aBetter ? -1 : 1, basis: `${categoryLabel(i)}数`, a: a.counts[i], b: b.counts[i] };
  }
  return { cmp: 0, basis: 'スコア区分の数', a: '同数', b: '同数' };
}

// ---- 1 チーム分の評価 ----
// status: 'ready'（確定）/ 'setup'（HDCP の順序未指定など）/ 'incomplete'（スコア未入力）/ 'manual_incomplete'（手動割当が未完了）
function evaluateTeam(team, competition) {
  const base = { teamId: team.id, name: team.name, status: 'ready', total: null, back: null, front: null, hdcpSum: null, counts: null, assignment: null, adopted: null, message: null };

  const alloc = quotasFor(team, competition.settings.allocationDirection);
  if (!alloc.ok) return { ...base, status: 'setup', message: alloc.error.message };

  if (!hasAllScores(team)) return { ...base, status: 'incomplete', message: 'スコアが未入力のホールがあります' };

  let assignment;
  if (team.assignmentMode === 'manual') {
    const manual = team.manualAssignment ?? new Array(HOLES).fill(null);
    if (!checkManual(team, alloc, manual).complete) {
      return { ...base, status: 'manual_incomplete', message: '採用ホールの手動選択が完了していません' };
    }
    assignment = manual;
  } else {
    assignment = autoAssign(team, alloc).assignment;
  }

  const t = assignmentTotals(team, assignment);
  return {
    ...base,
    total: t.total,
    back: t.back,
    front: t.front,
    hdcpSum: team.players.reduce((sum, p) => sum + hdcpToInt(p.hdcp), 0),
    counts: scoreCounts(team, competition.pars),
    assignment,
    adopted: t.adopted,
  };
}

// チーム順位を求める。
// 戻り値: { complete, teams }
//   complete: 全チームが確定（'ready'）か。確定していない間は順位を付けない（AC-14）
//   teams: 各チームの { teamId, name, status, message, total, back, front, hdcpSum, assignment, adopted,
//                      rank（確定前は null）, reason（同点処理の決着理由。無ければ null）, provisional }
//          確定済みなら順位順、そうでなければ入力順
export function rankTeams(competition) {
  const method = competition.settings.tieBreak;
  const entries = competition.teams.map((t) => ({ ...evaluateTeam(t, competition), rank: null, reason: null, provisional: true }));
  const complete = entries.length > 0 && entries.every((e) => e.status === 'ready');

  if (!complete) return { complete: false, teams: entries };

  const compare = (a, b) => (a.total !== b.total ? Math.sign(a.total - b.total) : compareTieBreak(method, a, b).cmp);
  const sorted = entries.map((e, i) => ({ e, i })).sort((x, y) => compare(x.e, y.e) || x.i - y.i).map((x) => x.e);

  sorted.forEach((e, i) => {
    e.provisional = false;
    e.rank = i === 0 ? 1 : compare(sorted[i - 1], e) === 0 ? sorted[i - 1].rank : i + 1;
  });

  // 決着理由: 合計が同点のチームごとに、隣のチームとの比較結果を示す（AC-28）
  sorted.forEach((e, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const neighbor = prev && prev.total === e.total ? prev : next && next.total === e.total ? next : null;
    if (!neighbor) return;
    const r = compareTieBreak(method, e, neighbor);
    e.reason = r.cmp === 0 ? '同点処理でも決着せず同順位' : `${r.basis} ${r.a} vs ${r.b}（${neighbor.name}）`;
  });

  return { complete: true, teams: sorted };
}
