// モード（事前準備 / 当日）の判定・準備の点検・画面の振り分け。DOM に依存しない純粋関数だけを置く。
import { quotasFor } from './quota.js';

const SCREENS_BY_MODE = {
  prep: ['settings', 'teams', 'data'],
  day: ['import', 'input', 'assign', 'ranking', 'data'],
};

// mode が無い（既存の保存データ）・不明なときは事前準備とみなす
export function modeOf(competition) {
  return competition && competition.mode === 'day' ? 'day' : 'prep';
}

// 当日を始められるかの点検。issues の screen は「直す画面」の ID
export function readiness(competition) {
  const issues = [];
  const teams = (competition && competition.teams) || [];
  if (teams.length === 0) {
    issues.push({ message: 'チームを登録してください', screen: 'teams' });
  }
  const direction = competition && competition.settings ? competition.settings.allocationDirection : undefined;
  for (const team of teams) {
    const r = quotasFor(team, direction);
    if (!r.ok) issues.push({ message: `${team.name}: ${r.error.message}`, screen: 'teams' });
  }
  return { ok: issues.length === 0, issues };
}

export function screensFor(mode) {
  return [...SCREENS_BY_MODE[mode === 'day' ? 'day' : 'prep']];
}

const allScoresFilled = (competition) => {
  const teams = competition.teams || [];
  return teams.length > 0 && teams.every((t) => t.players.every((p) => p.scores.every((s) => s !== null && s !== undefined)));
};

// 起動時の画面
export function defaultScreen(competition) {
  if (modeOf(competition) === 'day') return allScoresFilled(competition) ? 'ranking' : 'import';
  return (competition.teams || []).length > 0 ? 'teams' : 'settings';
}

// ハッシュ（'#teams' でも 'teams' でも可）がそのモードの画面でなければ、起動時の画面に振り替える
export function resolveScreen(hash, competition) {
  const id = String(hash ?? '').replace(/^#/, '');
  return screensFor(modeOf(competition)).includes(id) ? id : defaultScreen(competition);
}
