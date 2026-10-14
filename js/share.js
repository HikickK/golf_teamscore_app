// 順位表の表示用データと、共有用テキストを作る。DOM に依存しない純粋関数。
// resultRows は画面と、後続の画像出力（T-14）が共通で使う。

// 同点処理の方式名（画面・共有文面で共通）
export const TIE_BREAK_LABELS = {
  back9: '後半9ホールの採用スコア合計',
  hdcpSum: 'HDCP 合計',
  scoreCounts: '全スコアの区分の数（アルバトロス→イーグル→…）',
};
export const tieBreakLabel = (key) => TIE_BREAK_LABELS[key] ?? String(key);

// rankTeams の戻り値から、順位表の行データを作る
// 行: { teamId, name, rank, rankText, total, front, back, reason, tied, provisional, status, message }
//   rankText: 確定なら「1位」、暫定なら「—」
//   tied: 同順位のチームがほかにあるか（確定時のみ）
export function resultRows(ranking) {
  const teams = ranking?.teams ?? [];
  const counts = new Map();
  for (const t of teams) if (t.rank != null) counts.set(t.rank, (counts.get(t.rank) ?? 0) + 1);
  return teams.map((t) => ({
    teamId: t.teamId,
    name: t.name,
    rank: t.rank ?? null,
    rankText: t.rank != null ? `${t.rank}位` : '—',
    total: t.total ?? null,
    front: t.front ?? null,
    back: t.back ?? null,
    reason: t.reason ?? null,
    tied: t.rank != null && counts.get(t.rank) > 1,
    provisional: t.provisional !== false || t.rank == null,
    status: t.status,
    message: t.message ?? null,
  }));
}

export function resultTitle(competition) {
  const name = (competition.name ?? '').trim();
  const date = (competition.date ?? '').trim();
  const head = name ? `${name} 団体戦結果` : '団体戦結果';
  return date ? `${head}（${date}）` : head;
}

// 共有用テキスト（メッセージアプリで読みやすい短い行）
export function resultText(competition, ranking) {
  const rows = resultRows(ranking);
  const complete = !!ranking?.complete;
  const lines = [];
  lines.push(complete ? resultTitle(competition) : `【暫定】${resultTitle(competition)}`);
  if (!complete) lines.push('※全員のスコア入力が終わるまで順位は確定していません');
  if (rows.length === 0) lines.push('（チームが未登録です）');
  for (const r of rows) {
    const detail = r.total != null ? `${r.total}（前半${r.front}／後半${r.back}）` : `（${r.message ?? '入力中'}）`;
    const rank = complete ? `${r.rankText}${r.tied ? '（同順位）' : ''}` : '暫定';
    lines.push(`${rank} ${r.name} ${detail}`);
    if (complete && r.reason) lines.push(` └ ${r.reason}`);
  }
  lines.push(`同点処理: ${tieBreakLabel(competition.settings?.tieBreak)}`);
  return lines.join('\n');
}
