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

// AI への依頼文。AI は「写真に書かれたとおりに書き写す」だけを担当する。
// 選手名の突き合わせ（登録済みの選手との対応付け）はアプリ側（matchPlayers と確認表）が行うので、
// 依頼文には登録済みの選手名を入れない（入れると、AI が写真の名前をアプリ側の表記に寄せてしまう）。
// 引数は取らない。アプリのデータは、依頼文に一切含まれない。
export function buildPrompt() {
  const heading = ['選手名', ...Array.from({ length: HOLES }, (_, i) => `${i + 1}番`)].join(',');
  const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);

  // 例 1: OUT・IN・合計が印字されているカード
  const s1 = [4, 5, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
  const example1 = ['山田 太郎', ...s1, sum(s1.slice(0, 9)), sum(s1.slice(9)), sum(s1)].join(',');
  // 例 2: 名前の一部と 2 つのホールが読めない。印字された OUT・IN・合計は、そのまま書き写す（ホールの数字と合わなくても直さない）
  const s2 = [5, 6, 4, 6, 5, 5, '', 6, 5, 5, 5, 4, 6, 5, 5, '', 6, 5];
  const example2 = ['鈴木 ？郎', ...s2, 47, 46, 93].join(',');

  return [
    'あなたはゴルフのスコアカードを「書き写す」担当です。添付した写真に書かれている内容を、そのまま正確に文字にしてください。判断・補正・推測はしないでください。',
    '',
    '【最優先: 正確さ】',
    '・写真に書かれているとおりに書き写します。「たぶんこうだろう」と補ったり、きれいに直したりしないでください。',
    '・選手名は、写真に書かれた表記のまま（漢字・ひらがな・カタカナ・空白・敬称も、そのまま）書いてください。名前を正しそうな表記に直したり、他の人の名前に合わせたりしないでください。読み取れない文字は、推測せず「？」に置き換えてください（例: 鈴木 ？郎）。',
    '・スコアは、各ホールに書かれた数字をそのまま書いてください。読み取れない・空欄・判別に迷うホールは、推測せず空欄にしてください（カンマは残します。例: 4,,5）。「－」「×」など、数字でない記入も空欄にしてください。',
    '・OUT・IN・合計が印字されている場合は、書かれた値をそのまま、ホールの後ろに書いてください。自分で計算し直さないでください。ホールの数字と合わなくても、直さずにそのまま書いてください（読み違いを、後で人が見つけるためです）。',
    '',
    '【出力のしかた】',
    '・出力はプレーンテキストだけにしてください。説明・前置き・後書き・見出し行・表・コードブロック（```）は不要です。',
    '・選手 1 人につき 1 行です。写真の上から順に、全員分を書いてください（同じ名前が複数いても、省略しません）。パー・距離・ハンデ・ネット・順位など、選手のスコア以外の行や列は書かないでください。',
    '・1 行の形式は、半角のカンマ区切りです。数字はすべて半角で書いてください。',
    heading,
    '・ホールは 1 番から 18 番の順に、18 個です。カードが前半（OUT）と後半（IN）に分かれていても、1 番から 18 番の順につなげて 1 行にしてください。',
    '・OUT・IN・合計が印字されているときは、18 個のホールの後ろに、OUT,IN,合計 の順で続けます。OUT・IN が無く合計だけのときは、合計だけを続けます。何も印字されていなければ、続けません。',
    '・例（架空）。1 行目は OUT・IN・合計が印字されている場合です。2 行目は、名前の一部と 2 つのホールが読めず、OUT・IN・合計は印字されている場合です。',
    example1,
    example2,
    '',
    '【出力する前の見直し】',
    '出力する前に、各行を写真ともう一度見比べて、次を確かめてください。見直しの内容そのものは出力しません。',
    '・名前の文字が、写真と同じか。',
    '・数字の読み違いがないか（特に 1 と 7、3 と 8、4 と 9、5 と 6、0 と 6）。',
    '・ホールの数が、1 行あたり 18 個か（読めないホールも、空欄として数に含めます）。',
    '・別の選手の行と、数字が混ざっていないか。',
  ].join('\n');
}

// AI への依頼文（対話版）。書き写しの規則は buildPrompt と同じで、迷った所は AI が推測で決めず、
// 写真を見ている利用者に聞く。直すのは利用者の答えに基づく所だけ。最終の出力は buildPrompt と同じ形式。
// 登録済みの選手名は含めない（理由は buildPrompt の説明のとおり）。引数は取らない。
export function buildDialoguePrompt() {
  const s1 = [4, 5, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const example = ['山田 太郎', ...s1, sum(s1.slice(0, 9)), sum(s1.slice(9)), sum(s1)].join(',');

  return [
    'あなたはゴルフのスコアカードを「書き写す」担当です。添付した写真に書かれている内容を、そのまま正確に文字にします。判断・補正・推測はしません。迷ったところは、推測で決めずに、写真を見ている私に聞いてください。',
    '',
    '【書き写しの規則】',
    '・選手名は、写真に書かれた表記のまま（漢字・ひらがな・カタカナ・空白・敬称も、そのまま）。名前を正しそうな表記に直したり、他の人の名前に合わせたりしません。読み取れない文字は「？」にします。',
    '・スコアは、各ホールに書かれた数字のまま。読み取れない・空欄・判別に迷うホールは、空欄にします。「－」「×」など、数字でない記入も空欄にします。',
    '・OUT・IN・合計が印字されていれば、その値をそのまま書きます（計算し直さない。ホールの数字と合わなくても直さない）。',
    '・選手 1 人につき 1 行、写真の上から順に全員分（同じ名前が複数いても省略しない）。パー・距離・ハンデ・ネット・順位など、選手のスコア以外の行や列は書きません。',
    '・ホールは 1 番から 18 番の順に 18 個。カードが前半（OUT）と後半（IN）に分かれていても、1 番から 18 番の順につなげて 1 行にします。',
    '',
    '【進め方】',
    '1. まず写真を書き写してください。ただし、この段階では書き写した結果は出さずに、確認が必要な点だけを、短い箇条書きで私に伝えてください。',
    '　・読み取れなかった文字やホール（何行目の誰の、何番ホールか）',
    '　・数字の判別に迷ったホール（候補を示す。例: 3 行目の 7 番は「1 か 7」）',
    '　・名前の文字に自信がない所',
    '　・ホールの数字の合計が、印字された OUT・IN・合計と合わない行（どれだけ違うか）',
    '　確認する点がなければ「確認点なし」と伝えて、3 へ進みます。',
    '2. 私が写真を見て答えます。直すのは、私の答えに基づく所だけです。私が答えていない所は、推測で埋めずに、空欄または「？」のままにしてください。続けて確認が必要な点があれば、また聞いてください。',
    '3. 私が「OK」と言ったら、最終の結果を出してください。コードブロック 1 つの中に、次の形式の行だけを書きます（説明は付けません）。',
    '　・形式は、半角のカンマ区切りで、選手名,1番,2番,…,18番 の順です。OUT・IN・合計が印字されていれば、続けて OUT,IN,合計 の順に付けます（OUT・IN が無く合計だけのときは、合計だけ）。',
    '　・数字は半角、ホールは 18 個です（空欄も数に含めます）。',
    '　・例（架空）',
    example,
    '　最終の結果を出す前に、この形式と書き写しの規則を、もう一度確かめてください。',
  ].join('\n');
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
