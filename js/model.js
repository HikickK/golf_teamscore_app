// データモデルと検証。DOM に依存しない純粋関数だけを置く。

export const SCHEMA_VERSION = 1;
export const HOLES = 18;
export const PAR_MIN = 3;
export const PAR_MAX = 6;
export const SCORE_MIN = 1;
export const SCORE_MAX = 20;
export const NAME_MAX = 20;
export const TEAM_SIZES = [3, 4];
export const DIRECTIONS = ['lowHdcpMore', 'highHdcpMore'];
export const TIE_BREAKS = ['back9', 'hdcpSum', 'scoreCounts'];
export const ASSIGNMENT_MODES = ['auto', 'manual'];
export const MODES = ['prep', 'day']; // 画面のモード（事前準備 / 当日）。Competition.mode は任意で、無ければ 'prep'

export function createCompetition() {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: '',
    date: '',
    pars: Array(HOLES).fill(4),
    settings: { allocationDirection: 'lowHdcpMore', tieBreak: 'scoreCounts' },
    teams: [],
    mode: 'prep',
    updatedAt: new Date().toISOString(),
  };
}

// HDCP は小数第2位まで。比較・合計の誤差を避けるため 100 倍の整数で扱う。
export const hdcpToInt = (hdcp) => Math.round(hdcp * 100);

// ---- 単項目の検証（画面の入力時にも使う）。問題が無ければ null、あれば理由を返す ----

export function checkPar(v) {
  if (!Number.isInteger(v) || v < PAR_MIN || v > PAR_MAX) return `パーは ${PAR_MIN}〜${PAR_MAX} の整数で入力してください`;
  return null;
}

export function checkScore(v) {
  if (!Number.isInteger(v) || v < SCORE_MIN || v > SCORE_MAX) return `スコアは ${SCORE_MIN}〜${SCORE_MAX} の整数で入力してください`;
  return null;
}

export function checkHdcp(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'HDCP は数値で入力してください';
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) return 'HDCP は小数第2位までで入力してください';
  return null;
}

export function checkName(v, label = '氏名') {
  if (typeof v !== 'string' || v.trim() === '') return `${label}を入力してください`;
  if (v.trim().length > NAME_MAX) return `${label}は ${NAME_MAX} 文字以内で入力してください`;
  return null;
}

export function checkTeamSize(n) {
  return TEAM_SIZES.includes(n) ? null : 'チームの人数は 3 名または 4 名にしてください';
}

// ---- コンペ全体の検証（読込・インポート時） ----

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateCompetition(obj) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });

  if (!isObject(obj)) {
    err('', 'データの形式が正しくありません');
    return { ok: false, errors };
  }

  if (obj.schemaVersion !== SCHEMA_VERSION) err('schemaVersion', `対応していないデータ形式です（schemaVersion ${SCHEMA_VERSION} のみ対応）`);
  if (typeof obj.name !== 'string') err('name', 'コンペ名は文字列にしてください');
  if (typeof obj.date !== 'string' || (obj.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(obj.date))) err('date', '開催日は YYYY-MM-DD 形式にしてください');
  if (typeof obj.updatedAt !== 'string') err('updatedAt', '更新日時が正しくありません');
  if (obj.mode !== undefined && !MODES.includes(obj.mode)) err('mode', 'モードが正しくありません');

  if (!Array.isArray(obj.pars) || obj.pars.length !== HOLES) {
    err('pars', `パーは ${HOLES} ホール分が必要です`);
  } else {
    obj.pars.forEach((p, i) => {
      const m = checkPar(p);
      if (m) err(`pars[${i}]`, `${i + 1}番ホール: ${m}`);
    });
  }

  if (!isObject(obj.settings)) {
    err('settings', '設定が正しくありません');
  } else {
    if (!DIRECTIONS.includes(obj.settings.allocationDirection)) err('settings.allocationDirection', '配分の向きが正しくありません');
    if (!TIE_BREAKS.includes(obj.settings.tieBreak)) err('settings.tieBreak', '同点処理の方式が正しくありません');
  }

  if (!Array.isArray(obj.teams)) {
    err('teams', 'チーム一覧が正しくありません');
    return { ok: false, errors };
  }

  const teamIds = new Set();
  const playerIds = new Set();
  obj.teams.forEach((t, ti) => {
    const tp = `teams[${ti}]`;
    if (!isObject(t)) return err(tp, 'チームの形式が正しくありません');

    if (typeof t.id !== 'string' || t.id === '') err(`${tp}.id`, 'チーム ID が正しくありません');
    else if (teamIds.has(t.id)) err(`${tp}.id`, `チーム ID が重複しています: ${t.id}`);
    else teamIds.add(t.id);

    const nm = checkName(t.name, 'チーム名');
    if (nm) err(`${tp}.name`, nm);
    if (!ASSIGNMENT_MODES.includes(t.assignmentMode)) err(`${tp}.assignmentMode`, '割当モードが正しくありません');

    if (!Array.isArray(t.players)) return err(`${tp}.players`, '選手一覧が正しくありません');
    const sizeMsg = checkTeamSize(t.players.length);
    if (sizeMsg) err(`${tp}.players`, sizeMsg);

    const ownIds = new Set();
    t.players.forEach((p, pi) => {
      const pp = `${tp}.players[${pi}]`;
      if (!isObject(p)) return err(pp, '選手の形式が正しくありません');

      if (typeof p.id !== 'string' || p.id === '') err(`${pp}.id`, '選手 ID が正しくありません');
      else if (playerIds.has(p.id)) err(`${pp}.id`, `選手 ID が重複しています: ${p.id}`);
      else {
        playerIds.add(p.id);
        ownIds.add(p.id);
      }

      const pn = checkName(p.name);
      if (pn) err(`${pp}.name`, pn);
      const hm = checkHdcp(p.hdcp);
      if (hm) err(`${pp}.hdcp`, hm);
      if (p.tieOrder !== null && !(Number.isInteger(p.tieOrder) && p.tieOrder >= 1)) err(`${pp}.tieOrder`, '同 HDCP の順序が正しくありません');

      if (!Array.isArray(p.scores) || p.scores.length !== HOLES) {
        err(`${pp}.scores`, `スコアは ${HOLES} ホール分が必要です`);
      } else {
        p.scores.forEach((s, hi) => {
          if (s === null) return;
          const sm = checkScore(s);
          if (sm) err(`${pp}.scores[${hi}]`, `${hi + 1}番ホール: ${sm}`);
        });
      }
    });

    if (t.manualAssignment !== null) {
      if (!Array.isArray(t.manualAssignment) || t.manualAssignment.length !== HOLES) {
        err(`${tp}.manualAssignment`, `手動割当は ${HOLES} ホール分が必要です`);
      } else {
        t.manualAssignment.forEach((id, hi) => {
          if (id !== null && !ownIds.has(id)) err(`${tp}.manualAssignment[${hi}]`, `${hi + 1}番ホール: チームに存在しない選手が指定されています`);
        });
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
