// 取込画面（当日モードの最初の画面）: スコアのテキスト取り込み。
// 解釈・対応付け・照合・保存の中身は score-import.js。ここは画面だけを作る。
// 読み取っただけでは保存データを変えない。「取り込む」で初めて state.commit する。
import { h } from './dom.js';
import { HOLES } from '../model.js';
import { buildPrompt, parseScoreText, matchPlayers, setCell, reviewImport, applyImport } from '../score-import.js';
import {
  STATUS_TEXT, SKIP_VALUE, CHOOSE_VALUE, initialMapping, rowStatus, parseSelection, playerGroups, playerIdSet,
  normalizeInput, visibleIgnored, checkLine, applySummary, overwriteMessage,
} from './import-logic.js';

const PRIVACY_NOTICE =
  '写真に写っている氏名は、あなたが使う外部の AI に送られます。会社のルールに従って使ってください。このアプリは写真も氏名も送信しません。'
  + '依頼文には、このアプリに登録した選手名は入っていません。AI は写真のとおりに書き写すだけで、登録した選手との対応付けは、下の確認表で行います。';

const NOT_FOUND_MSG = 'スコアの行が見つかりませんでした。形式を確認してください';
const SAVE_FAILED_MSG = 'データを端末に保存できませんでした。貼り付けた内容は消していません。保存の状態（画面上部のお知らせ）を確認して、もう一度お試しください。';

export const screen = {
  id: 'import',
  label: '取込',
  render(container, ctx) {
    // 入力途中の内容は ctx.ui に持つ（画面を切り替えても消えない。保存データには入れない）
    const st = (ctx.ui.import ??= { text: '', parsed: null, message: '', done: null, applyError: '' });
    pruneMapping(st, ctx.state.competition);

    container.append(h('h2', {}, '取込'));

    // 取り込み完了の案内は 1 回だけ出す（別の画面から戻ったときに古い案内を残さない）
    let done = st.done;
    st.done = null;
    const doneHost = h('div', {});
    const reviewHost = h('div', { class: 'stack', id: 'import-review' });
    const renderDone = () => {
      doneHost.textContent = '';
      if (!done) return;
      doneHost.append(
        h('div', { class: 'card stack im-done', role: 'status', id: 'import-done' },
          h('strong', {}, `${done.people} 人・${done.holes} ホールを取り込みました`),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'primary', onclick: () => ctx.navigate('assign') }, '割当を見る'),
            h('button', { type: 'button', class: 'primary', onclick: () => ctx.navigate('ranking') }, '順位を見る'),
          ),
        ),
      );
    };
    renderDone();

    container.append(doneHost, requestCard(ctx), pasteCard(ctx, st, { clearDone: () => { done = null; renderDone(); }, reviewHost, onParsed: () => renderReview(ctx, st, reviewHost) }), reviewHost);
    renderReview(ctx, st, reviewHost);
  },
};

// 保存データの選手が変わっていたら（JSON の読み込みなど）、存在しない選手への対応付けは外す
function pruneMapping(st, competition) {
  if (!st.parsed) return;
  const ids = playerIdSet(competition);
  st.parsed.mapping = st.parsed.mapping.map((id) => (id != null && ids.has(id) ? id : null));
}

// ---- 1. AI に依頼する ----

function requestCard(ctx) {
  const status = h('p', { class: 'im-status', role: 'status', id: 'import-copy-status' });
  const area = h('div', { class: 'im-fallback' });
  const say = (msg, isError = false) => {
    status.textContent = msg;
    status.className = 'im-status' + (isError ? ' error-text' : '');
  };
  const showText = (text) => {
    area.textContent = '';
    const ta = h('textarea', { readonly: true, rows: 10, class: 'im-textarea', id: 'import-prompt-text', 'aria-label': 'AI への依頼文' });
    ta.value = text;
    area.append(ta);
    say('自動でコピーできませんでした。下の文章を長押しして、手でコピーしてください。');
    ta.focus();
    ta.select();
  };

  // 文字列は同期的に作ってからコピーを呼ぶ（iOS はユーザー操作の直後でないと失敗するため）
  const onCopy = () => {
    const text = buildPrompt();
    area.textContent = '';
    say('');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      let p;
      try {
        p = navigator.clipboard.writeText(text);
      } catch {
        showText(text);
        return;
      }
      Promise.resolve(p).then(() => say('コピーしました'), () => showText(text));
    } else {
      showText(text);
    }
  };

  return h('section', { class: 'card stack' },
    h('h3', {}, 'AI に依頼する'),
    h('ol', { class: 'im-steps' },
      h('li', {}, 'スコアカードの写真を撮る'),
      h('li', {}, '下のボタンで依頼文をコピーし、写真と一緒に、使いたい AI アプリ（画像を読めるもの。どれでもよい）に渡す'),
      h('li', {}, '返ってきた文章を全部コピーして、下の欄に貼り付ける'),
    ),
    h('button', { type: 'button', class: 'primary', id: 'import-copy', onclick: onCopy }, 'AI への依頼文をコピー'),
    status,
    area,
    h('p', { class: 'im-privacy', id: 'import-privacy' }, PRIVACY_NOTICE),
  );
}

// ---- 2. テキストを貼り付ける ----

function pasteCard(ctx, st, { clearDone, reviewHost, onParsed }) {
  const message = h('p', { class: 'im-status', role: 'status', id: 'import-message' });
  const showMessage = () => {
    message.textContent = st.message || '';
    message.className = 'im-status' + (st.messageError ? ' error-text' : '');
  };

  const textarea = h('textarea', {
    class: 'im-textarea', id: 'import-text', rows: 8, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: '山田太郎,5,4,6,…', 'aria-label': '取り込むスコアのテキスト',
  });
  textarea.value = st.text;
  textarea.addEventListener('input', () => { st.text = textarea.value; });

  const onParse = () => {
    st.text = textarea.value;
    st.applyError = '';
    clearDone();
    const { rows, ignored } = parseScoreText(st.text);
    if (rows.length === 0) {
      st.parsed = null;
      st.message = NOT_FOUND_MSG;
      st.messageError = true;
    } else {
      const matches = matchPlayers(rows, ctx.state.competition);
      st.parsed = { rows, ignored, matches, mapping: initialMapping(matches), skip: rows.map(() => false) };
      st.message = `${rows.length} 行を読み取りました。確認表を見て、問題がなければ「取り込む」を押してください（まだ保存していません）。`;
      st.messageError = false;
    }
    showMessage();
    onParsed();
    if (st.parsed && reviewHost.scrollIntoView) reviewHost.scrollIntoView({ block: 'start' });
  };

  const onClear = () => {
    st.text = '';
    st.parsed = null;
    st.message = '';
    st.messageError = false;
    st.done = null;
    st.applyError = '';
    ctx.rerender();
  };

  showMessage();
  return h('section', { class: 'card stack' },
    h('h3', {}, 'テキストを貼り付ける'),
    h('p', { class: 'hint' }, '1 人 1 行です。手で打ってもかまいません。例: 山田太郎,5,4,6,…（18 個）,合計（合計は省略できます。区切りは、カンマ・読点・タブ・空白）'),
    textarea,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', id: 'import-parse', onclick: onParse }, '読み取る'),
      h('button', { type: 'button', id: 'import-clear', onclick: onClear }, 'クリア'),
    ),
    message,
  );
}

// ---- 3. 確認表 ----

function renderReview(ctx, st, host) {
  host.textContent = '';
  const p = st.parsed;
  if (!p) return;

  const cards = [];
  const below = h('div', { class: 'stack' });
  const applyHost = h('section', { class: 'card stack', id: 'import-apply' });

  function refresh() {
    const comp = ctx.state.competition;
    const review = reviewImport(p.rows, p.mapping, comp);
    const byRow = new Map(review.items.map((it) => [it.rowIndex, it]));
    const dupRows = new Set(review.duplicates.flatMap((d) => d.rows));
    cards.forEach((c) => c.update(byRow.get(c.index), dupRows.has(c.index)));
    renderBelow(below, review, p);
    renderApply(applyHost, review);
  }

  function renderApply(el, review) {
    const sum = applySummary(review);
    el.textContent = '';
    const btn = h('button', { type: 'button', class: 'primary', id: 'import-apply-btn', disabled: !sum.canApply, onclick: onApply }, `取り込む（${sum.people} 人）`);
    el.append(btn);
    if (!sum.canApply) el.append(h('p', { class: 'error-text im-reason', id: 'import-reason', role: 'status' }, sum.reason));
    else el.append(h('p', { class: 'hint' }, `${sum.people} 人・${sum.holes} ホールを保存します。エラーのホール・空欄は取り込まず、保存済みのスコアはそのまま残ります。`));
    if (st.applyError) el.append(h('p', { class: 'error-text', id: 'import-apply-error', role: 'alert' }, st.applyError));
  }

  function onApply() {
    const review = reviewImport(p.rows, p.mapping, ctx.state.competition);
    const sum = applySummary(review);
    if (!sum.canApply) return;
    if (review.overwriteCount > 0 && !confirm(overwriteMessage(review.overwriteCount))) return;

    // commit は画面全体を描き直すので、先に取り込み後の状態にしておく（失敗したら戻す）
    const before = { text: st.text, parsed: st.parsed, message: st.message, messageError: st.messageError, done: st.done };
    st.done = { people: sum.people, holes: sum.holes };
    st.text = '';
    st.parsed = null;
    st.message = '';
    st.messageError = false;
    st.applyError = '';
    const ok = ctx.state.commit((c) => { applyImport(c, review); });
    if (!ok || ctx.state.saveError) {
      Object.assign(st, before);
      st.applyError = SAVE_FAILED_MSG;
      ctx.rerender();
    }
  }

  // 1 人 = 1 枚のカード。打鍵ごとに作り直さず、変わった部分だけ update で更新する（フォーカスを保つ）
  p.rows.forEach((_, i) => {
    const c = buildCard(ctx, p, i, refresh);
    cards.push(c);
  });

  host.append(
    h('h3', { class: 'im-section' }, '確認表'),
    h('p', { class: 'hint' }, '読み取った内容です。まだ保存していません。選手の対応やスコアは、ここで直せます。'),
    h('div', { class: 'stack' }, cards.map((c) => c.el)),
    below,
  );
  const ignored = visibleIgnored(p.ignored);
  if (ignored.length > 0) {
    host.append(
      h('details', { class: 'im-ignored', id: 'import-ignored' },
        h('summary', {}, `無視した行 ${ignored.length} 行`),
        h('ul', {}, ignored.map((x) => h('li', {}, `${x.lineNo} 行目: ${x.raw}（${x.reason}）`))),
      ),
    );
  }
  host.append(applyHost);
  refresh();
}

function buildCard(ctx, p, index, refresh) {
  const row = () => p.rows[index];
  const name = row().name || '（名前なし）';
  const badge = h('span', { class: 'im-badge', id: `import-badge-${index}` });
  const summary = h('div', { class: 'im-summary' });
  const msgs = h('div', { class: 'im-msgs' });

  // 選手の選択（チームごと）
  const select = h('select', { class: 'im-select', id: `import-select-${index}`, 'aria-label': `${name} に対応する選手` });
  select.append(h('option', { value: SKIP_VALUE }, '（この行は取り込まない）'));
  if (p.mapping[index] == null) select.append(h('option', { value: CHOOSE_VALUE }, '（選んでください）'));
  for (const g of playerGroups(ctx.state.competition)) {
    select.append(h('optgroup', { label: g.teamName }, g.players.map((pl) => h('option', { value: pl.id }, pl.name))));
  }
  select.value = p.skip[index] ? SKIP_VALUE : p.mapping[index] != null ? p.mapping[index] : CHOOSE_VALUE;
  select.addEventListener('change', () => {
    const sel = parseSelection(select.value);
    p.mapping[index] = sel.playerId;
    p.skip[index] = sel.skip;
    refresh();
  });

  // 18 ホールの入力欄（6 列 × 3 段）
  const inputs = [];
  const grid = h('div', { class: 'im-grid' });
  for (let hole = 0; hole < HOLES; hole++) {
    const input = h('input', {
      type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'im-input', id: `import-cell-${index}-${hole}`,
      'aria-label': `${name} ${hole + 1}番ホールのスコア`, value: row().cells[hole].raw,
    });
    input.addEventListener('input', () => {
      p.rows[index] = setCell(row(), hole, normalizeInput(input.value));
      refresh();
    });
    input.addEventListener('change', () => {
      const cell = row().cells[hole];
      if (!cell.error) input.value = cell.raw; // 受理した値は半角の表記に直す（エラーは理由つきで残す）
    });
    inputs.push(input);
    grid.append(h('label', { class: 'im-cell' }, h('span', { class: 'im-hole' }, String(hole + 1)), input));
  }

  const el = h('article', { class: 'card stack im-card', id: `import-card-${index}` },
    h('div', { class: 'im-head' },
      h('div', { class: 'grow' },
        h('strong', { class: 'im-name' }, name),
        h('div', { class: 'hint' }, `貼り付けの ${row().lineNo} 行目`),
      ),
      badge,
    ),
    h('div', { class: 'field' }, h('label', { for: `import-select-${index}` }, '対応する選手'), select),
    grid,
    summary,
    msgs,
  );

  function update(item, isDup) {
    const r = row();
    const status = rowStatus({ match: p.matches[index], playerId: p.mapping[index], skip: p.skip[index], duplicate: isDup });
    badge.className = `im-badge is-${status}`;
    badge.textContent = STATUS_TEXT[status];
    el.classList.toggle('is-dup', status === 'dup');
    el.classList.toggle('is-skipped', !item);

    inputs.forEach((input, hole) => {
      const cell = r.cells[hole];
      input.classList.toggle('is-invalid', Boolean(cell.error));
      input.classList.toggle('is-empty', !cell.error && !Number.isInteger(cell.value));
    });

    summary.textContent = '';
    msgs.textContent = '';
    if (item) {
      summary.append(h('div', { class: 'im-totals' }, `OUT ${item.out} ／ IN ${item.in} ／ 合計 `, h('strong', {}, String(item.total))));
      item.checks.forEach((c) => {
        const line = checkLine(c);
        summary.append(h('div', { class: 'im-check' + (line.ok === false ? ' is-ng' : '') }, line.text));
      });
      if (item.checks.length === 0) summary.append(h('div', { class: 'hint' }, 'カードの合計が無いため、照合はできません'));
    } else {
      msgs.append(h('p', { class: 'im-skip-note' }, '⚠ 選手が選ばれていないため、この行は取り込まれません。'));
    }
    const errors = item ? item.errors : r.errors;
    errors.forEach((e) => msgs.append(h('p', { class: 'error-text' }, `エラー: ${e}`)));
    r.cells.forEach((cell, hole) => {
      if (cell.error) msgs.append(h('p', { class: 'error-text' }, `${hole + 1}番: ${cell.error}`));
    });
    if (item) {
      item.warnings.forEach((w) => msgs.append(h('p', { class: 'im-warn' }, `⚠ ${w}`)));
      if (item.badCount) msgs.append(h('p', { class: 'error-text' }, 'スコアの数が合わないため、この行は取り込まれません。'));
      if (item.overwrites > 0) msgs.append(h('p', { class: 'im-overwrite' }, `保存済みのスコアを ${item.overwrites} ホール上書きします。`));
    }
  }

  return { index, el, update };
}

// 表の下: 重複の警告・取り込まれない選手・選ばれていない行
function renderBelow(el, review, p) {
  el.textContent = '';
  if (review.duplicates.length > 0) {
    el.append(
      h('div', { class: 'card im-dup', role: 'alert', id: 'import-dups' },
        h('strong', {}, '！ 同じ選手に複数の行が対応付けられています'),
        h('ul', {}, review.duplicates.map((d) => h('li', {}, `「${d.playerName}」: ${d.lineNos.join('・')} 行目`))),
        h('p', { class: 'hint' }, '重複がある間は取り込めません。選手を選び直すか、不要な行を「この行は取り込まない」にしてください。'),
      ),
    );
  }
  const unselected = review.unmappedRows.filter((i) => !p.skip[i]);
  if (unselected.length > 0) {
    el.append(
      h('div', { class: 'card', id: 'import-unselected' },
        h('p', {}, `⚠ 選手が選ばれていない行は取り込まれません（${unselected.map((i) => `${p.rows[i].lineNo} 行目`).join('・')}）。`),
      ),
    );
  }
  el.append(
    h('div', { class: 'card stack', id: 'import-missing' },
      h('h3', {}, '取り込まれない選手'),
      review.missingPlayers.length === 0
        ? h('p', { class: 'hint' }, '登録されている選手は、全員がテキストに含まれています。')
        : [
          h('p', { class: 'hint' }, 'テキストに無かった登録選手です。この人たちのスコアは変更しません。'),
          h('ul', { class: 'im-missing' }, review.missingPlayers.map((m) => h('li', {}, `${m.teamName}: ${m.playerName}`))),
        ],
    ),
  );
}
