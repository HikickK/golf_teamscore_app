// スコアのテキスト取り込み。DOM に依存しない純粋関数だけを置く。
// 外部の AI が返した（崩れていることがある）テキストを寛容に読み、間違いは確認表に出す。

import { HOLES, SCORE_MIN, SCORE_MAX } from './model.js';

const OUT_HOLES = 9;

const emptyCell = () => ({ raw: '', value: null, error: null });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function teamsOf(competition) {
  return isObject(competition) && Array.isArray(competition.teams) ? competition.teams.filter(isObject) : [];
}
function playersOf(team) {
  return Array.isArray(team.players) ? team.players.filter(isObject) : [];
}
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ---- 依頼文 ----

export function buildPrompt(competition) {
  const heading = ['選手名', ...Array.from({ length: HOLES }, (_, i) => `${i + 1}番`), '合計'].join(',');
  const teams = teamsOf(competition);
  const firstName = teams.flatMap(playersOf).map((p) => str(p.name).trim()).find((n) => n) || '山田太郎';
  const sample = [4, 5, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
  const example = [firstName, ...sample, sample.reduce((a, b) => a + b, 0)].join(',');

  const lines = [
    'あなたはゴルフのスコアカードを読み取る担当です。添付したスコアカードの写真から、各選手の 1〜18 番ホールのスコアを読み取ってください。',
    '',
    '【出力のしかた】',
    '・出力はプレーンテキストだけにしてください。説明・前置き・後書き・表・コードブロック（```）は不要です。',
    '・1 人 1 行で、次の形式にしてください。',
    heading,
    '・例（1 行）',
    example,
    '',
    '【規則】',
    '・選手名は、下の「登録済みの選手」の表記に合わせてください。',
    '・数字はすべて半角で書いてください。',
    '・読み取れないホールは空欄にしてください（カンマは残します。例: 4,,5）。',
    '・合計は、スコアカードに書かれた値をそのまま書いてください。自分で計算し直さないでください（読み間違いを後で見つけるためです）。合計が書かれていない・読めない場合は、空欄にしてください。',
    '',
    '【登録済みの選手】',
  ];
  if (teams.length === 0) {
    lines.push('（登録済みの選手はありません）');
  } else {
    teams.forEach((t, i) => {
      const names = playersOf(t).map((p) => str(p.name).trim()).filter((n) => n);
      lines.push(`${str(t.name).trim() || `チーム${i + 1}`}: ${names.join('、')}`);
    });
  }
  return lines.join('\n');
}

// ---- セル・名前 ----

export function parseCell(text) {
  const raw = str(text).trim();
  if (raw === '') return { raw: '', value: null, error: null };
  if (/^\d{1,4}$/.test(raw)) {
    const v = parseInt(raw, 10);
    if (v >= SCORE_MIN && v <= SCORE_MAX) return { raw, value: v, error: null };
  }
  return { raw, value: null, error: `「${raw}」は ${SCORE_MIN}〜${SCORE_MAX} の整数ではありません` };
}

export function normalizeName(s) {
  return str(s).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

// ---- テキストの解釈 ----

function isHeaderFields(fields) {
  const t = fields.map((f) => f.trim());
  if (t.length >= 3 && ['1番', '2番', '3番'].every((x, i) => t[i] === x)) return true;
  const stripped = t.map((x) => x.replace(/番$/, ''));
  return stripped.length >= 6 && ['1', '2', '3', '4', '5', '6'].every((x, i) => stripped[i] === x);
}

function parseReported(text, label, errors) {
  const raw = str(text).trim();
  if (raw === '') return null;
  if (/^\d{1,4}$/.test(raw)) return parseInt(raw, 10);
  errors.push(`カードの${label}「${raw}」を数値として読めません`);
  return null;
}

function buildRow(lineNo, raw, name, fields) {
  const n = fields.length;
  const errors = [];
  const badCount = ![18, 19, 20, 21].includes(n);
  if (badCount) errors.push(`スコアの数が合いません（${n} 個）`);
  const cells = Array.from({ length: HOLES }, (_, h) => (h < n ? parseCell(fields[h]) : emptyCell()));
  const reported = { out: null, in: null, total: null };
  if (!badCount) {
    if (n === 19) reported.total = parseReported(fields[18], '合計', errors);
    else if (n === 20 || n === 21) {
      reported.out = parseReported(fields[18], 'OUT', errors);
      reported.in = parseReported(fields[19], 'IN', errors);
      if (n === 21) reported.total = parseReported(fields[20], '合計', errors);
    }
  }
  return { lineNo, raw, name, cells, reported, errors, badCount };
}

export function parseScoreText(text) {
  const rows = [];
  const ignored = [];
  const input = typeof text === 'string' ? text : '';
  const lines = input.normalize('NFKC').split(/\r\n|\r|\n/);

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const ignore = (reason) => ignored.push({ lineNo, raw: line, reason });
    const trimmed = line.trim();
    if (trimmed === '') return ignore('空行');
    if (trimmed.startsWith('```')) return ignore('コードブロックの区切り');
    if (/^[|\-:\s]+$/.test(trimmed) && /-/.test(trimmed)) return ignore('表の区切り行');
    if (!/\d/.test(trimmed)) return ignore('数字を含まない行（前置き・見出しなど）');

    let name;
    let fields;
    if (/[,、\t|]/.test(trimmed)) {
      let body = trimmed;
      if (body.startsWith('|')) body = body.slice(1);
      if (body.endsWith('|')) body = body.slice(0, -1);
      const parts = body.split(/[,、\t|]/);
      name = parts[0].trim();
      fields = parts.slice(1);
    } else {
      const tokens = trimmed.split(/\s+/);
      let k = tokens.findIndex((t) => /^\d+$/.test(t));
      if (k < 0) return ignore('スコアを含まない行');
      name = tokens.slice(0, k).join(' ');
      fields = tokens.slice(k);
    }
    if (isHeaderFields(fields)) return ignore('見出しの行（1番〜）');
    if (fields.length > 0 && fields.every((f) => !/\d/.test(f) && f.trim() !== '')) return ignore('スコアを含まない行');
    rows.push(buildRow(lineNo, trimmed, name, fields));
  });

  return { rows, ignored };
}

// ---- 対応付け ----

function allPlayers(competition) {
  const list = [];
  teamsOf(competition).forEach((t) => {
    playersOf(t).forEach((p) => {
      list.push({ teamId: t.id, teamName: str(t.name), playerId: p.id, playerName: str(p.name), norm: normalizeName(p.name) });
    });
  });
  return list;
}
const candidate = (p) => ({ teamId: p.teamId, playerId: p.playerId, teamName: p.teamName, playerName: p.playerName });

export function matchPlayers(rows, competition) {
  const players = allPlayers(competition);
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const norm = normalizeName(row && row.name);
    if (norm === '') return { status: 'unmatched', teamId: null, playerId: null, candidates: [] };
    const exact = players.filter((p) => p.norm === norm);
    if (exact.length === 1) {
      return { status: 'matched', teamId: exact[0].teamId, playerId: exact[0].playerId, candidates: [candidate(exact[0])] };
    }
    if (exact.length > 1) {
      return { status: 'check', teamId: null, playerId: null, candidates: exact.map(candidate) };
    }
    const partial = players.filter((p) => p.norm !== '' && (p.norm.includes(norm) || norm.includes(p.norm)));
    if (partial.length === 1) {
      return { status: 'check', teamId: partial[0].teamId, playerId: partial[0].playerId, candidates: [candidate(partial[0])] };
    }
    return { status: 'unmatched', teamId: null, playerId: null, candidates: partial.map(candidate) };
  });
}

// ---- 手修正 ----

export function setCell(row, holeIndex, text) {
  const next = structuredClone(row);
  if (Number.isInteger(holeIndex) && holeIndex >= 0 && holeIndex < HOLES && Array.isArray(next.cells)) {
    next.cells[holeIndex] = parseCell(text);
  }
  return next;
}

// ---- 確認表 ----

const sumRange = (cells, from, to) => cells.slice(from, to).reduce((a, c) => a + (Number.isInteger(c.value) ? c.value : 0), 0);
const hasBlank = (cells, from, to) => cells.slice(from, to).some((c) => !Number.isInteger(c.value));
const holeList = (idxs) => idxs.map((i) => `${i + 1}番`).join('・');

export function reviewImport(rows, mapping, competition) {
  const rowList = Array.isArray(rows) ? rows : [];
  const map = Array.isArray(mapping) ? mapping : [];
  const lookup = new Map();
  teamsOf(competition).forEach((t) => {
    playersOf(t).forEach((p) => lookup.set(p.id, { team: t, player: p }));
  });

  const items = [];
  const unmappedRows = [];
  const byPlayer = new Map();
  let overwriteCount = 0;

  rowList.forEach((row, rowIndex) => {
    const pid = map[rowIndex];
    const found = pid == null ? null : lookup.get(pid);
    if (!found) {
      unmappedRows.push(rowIndex);
      return;
    }
    const cells = structuredClone(row.cells);
    const reported = row.reported || { out: null, in: null, total: null };
    const out = sumRange(cells, 0, OUT_HOLES);
    const inn = sumRange(cells, OUT_HOLES, HOLES);
    const total = out + inn;
    const warnings = [];
    const errors = [...(row.errors || [])];

    const blanks = [];
    const errCells = [];
    cells.forEach((c, i) => {
      if (c.error) errCells.push(i);
      else if (!Number.isInteger(c.value)) blanks.push(i);
    });
    if (blanks.length) warnings.push(`空欄のホールがあります（${holeList(blanks)}）`);
    if (errCells.length) errors.push(`エラーのホールがあります（${holeList(errCells)}）`);

    const checks = [];
    const addCheck = (kind, label, from, to) => {
      const rep = reported[kind];
      if (rep == null) return;
      const computed = kind === 'out' ? out : kind === 'in' ? inn : total;
      if (hasBlank(cells, from, to)) {
        checks.push({ kind, ok: null, reported: rep, computed });
        warnings.push(`${label}はホールに空欄・エラーがあるため、カードの値（${rep}）と照合できません`);
      } else if (computed === rep) {
        checks.push({ kind, ok: true, reported: rep, computed });
      } else {
        checks.push({ kind, ok: false, reported: rep, computed });
        warnings.push(`${label}がカードの値と合いません（カード ${rep}・計算 ${computed}、${Math.abs(computed - rep)} 打差）`);
      }
    };
    addCheck('out', 'OUT', 0, OUT_HOLES);
    addCheck('in', 'IN', OUT_HOLES, HOLES);
    addCheck('total', '合計', 0, HOLES);

    let overwrites = 0;
    if (!row.badCount) {
      const stored = Array.isArray(found.player.scores) ? found.player.scores : [];
      cells.forEach((c, h) => {
        if (Number.isInteger(c.value) && Number.isInteger(stored[h]) && stored[h] !== c.value) overwrites++;
      });
    }
    overwriteCount += overwrites;

    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid).push(rowIndex);

    items.push({
      rowIndex,
      playerId: pid,
      playerName: str(found.player.name),
      teamName: str(found.team.name),
      cells,
      out,
      in: inn,
      total,
      checks,
      warnings,
      errors,
      overwrites,
      badCount: !!row.badCount,
    });
  });

  const duplicates = [];
  byPlayer.forEach((idxs, playerId) => {
    if (idxs.length >= 2) {
      duplicates.push({ playerId, playerName: str(lookup.get(playerId).player.name), rows: idxs, lineNos: idxs.map((i) => rowList[i].lineNo) });
    }
  });

  const missingPlayers = [];
  teamsOf(competition).forEach((t) => {
    playersOf(t).forEach((p) => {
      if (!byPlayer.has(p.id)) missingPlayers.push({ playerId: p.id, teamName: str(t.name), playerName: str(p.name) });
    });
  });

  return {
    items,
    duplicates,
    missingPlayers,
    unmappedRows,
    overwriteCount,
    canApply: duplicates.length === 0 && items.length > 0,
  };
}

// ---- 取り込み（state.commit の中で使う。competition を書き換える） ----

export function applyImport(competition, review) {
  if (!review || !review.canApply || !Array.isArray(review.items)) return 0;
  const lookup = new Map();
  teamsOf(competition).forEach((t) => playersOf(t).forEach((p) => lookup.set(p.id, p)));
  let written = 0;
  review.items.forEach((item) => {
    if (item.badCount) return;
    const player = lookup.get(item.playerId);
    if (!player || !Array.isArray(player.scores)) return;
    item.cells.forEach((c, h) => {
      if (h < HOLES && !c.error && Number.isInteger(c.value)) {
        player.scores[h] = c.value;
        written++;
      }
    });
  });
  return written;
}
