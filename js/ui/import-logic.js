// 取込画面の、DOM に依存しない補助（表示用の判定・文言）。解釈そのものは score-import.js が行う。

export const SKIP_VALUE = '';
export const CHOOSE_VALUE = '?';

// 対応状況（行ごと）。色だけに頼らず、記号と文字でも示す
export const STATUS_TEXT = {
  matched: '✓ 一致',
  check: '？ 要確認',
  unmatched: '✕ 未対応',
  dup: '！ 重複',
  chosen: '✓ 選択済み',
  skip: '－ 取り込まない',
};

// 読み取り直後の対応付けの初期値: mapping[i] = playerId | null
export function initialMapping(matches) {
  return (Array.isArray(matches) ? matches : []).map((m) => (m && m.playerId != null ? m.playerId : null));
}

// 行の状態。duplicate はその選手に 2 行以上が対応付けられているか
export function rowStatus({ match, playerId, skip, duplicate }) {
  if (skip) return 'skip';
  if (!playerId) return match && match.status === 'check' ? 'check' : 'unmatched';
  if (duplicate) return 'dup';
  if (match && playerId === match.playerId) return match.status === 'check' ? 'check' : 'matched';
  return 'chosen';
}

// <select> の値 → { playerId, skip }
export function parseSelection(value) {
  if (value === SKIP_VALUE) return { playerId: null, skip: true };
  if (value === CHOOSE_VALUE) return { playerId: null, skip: false };
  return { playerId: value, skip: false };
}

// チームごとの選手の一覧（optgroup 用）
export function playerGroups(competition) {
  const teams = competition && Array.isArray(competition.teams) ? competition.teams : [];
  return teams.map((t, i) => ({
    teamName: String(t.name || '').trim() || `チーム${i + 1}`,
    players: (Array.isArray(t.players) ? t.players : []).map((p) => ({ id: p.id, name: String(p.name || '') })),
  }));
}

export function playerIdSet(competition) {
  const ids = new Set();
  playerGroups(competition).forEach((g) => g.players.forEach((p) => ids.add(p.id)));
  return ids;
}

// 手で入力した値は、全角も受け付ける（行の解釈と同じく NFKC で半角にする）
export const normalizeInput = (s) => String(s ?? '').normalize('NFKC');

// 画面に出す「無視した行」（空行は数えない）
export function visibleIgnored(ignored) {
  return (Array.isArray(ignored) ? ignored : []).filter((x) => x.reason !== '空行');
}

// 照合の 1 行分の文言
const CHECK_LABEL = { out: 'OUT', in: 'IN', total: '合計' };
export function checkLine(check) {
  const label = CHECK_LABEL[check.kind] || check.kind;
  const head = `${label}: カード ${check.reported}`;
  if (check.ok === true) return { ok: true, text: `${head} ・ 計算 ${check.computed}　✓ 一致` };
  if (check.ok === false) return { ok: false, text: `${head} ・ 計算 ${check.computed}　⚠ ${Math.abs(check.computed - check.reported)} 打差` };
  return { ok: null, text: `${head}　照合できない（空欄あり）` };
}

// 「取り込む」ボタンの状態: { canApply, people, holes, reason }
export function applySummary(review) {
  const items = review && Array.isArray(review.items) ? review.items : [];
  const targets = items.filter((i) => !i.badCount);
  const people = targets.length;
  const holes = targets.reduce((n, i) => n + i.cells.filter((c) => !c.error && Number.isInteger(c.value)).length, 0);
  let reason = '';
  if (review && review.duplicates && review.duplicates.length > 0) {
    const names = review.duplicates.map((d) => `「${d.playerName}」（${d.lineNos.join('・')} 行目）`).join('、');
    reason = `同じ選手に複数の行が対応付けられています: ${names}。選手を選び直すか、不要な行を「この行は取り込まない」にしてください。`;
  } else if (items.length === 0) {
    reason = '取り込む行がありません。各行の選手を選んでください。';
  } else if (people === 0) {
    reason = 'スコアの数が合わない行しかないため、取り込めません。';
  }
  return { canApply: reason === '' && Boolean(review && review.canApply), people, holes, reason };
}

export const overwriteMessage = (n) => `保存済みのスコアを ${n} ホール上書きします。よろしいですか？`;
