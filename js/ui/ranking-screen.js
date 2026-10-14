// 順位画面（⑤）。チーム順位・同点処理の決着理由・結果のテキスト共有。
import { h } from './dom.js';
import { rankTeams } from '../ranking.js';
import { resultRows, resultText, tieBreakLabel } from '../share.js';

// 状態ごとの「直す画面」への案内
const FIX = {
  setup: { to: 'teams', label: '②チームへ' },
  incomplete: { to: 'input', label: '③入力へ' },
  manual_incomplete: { to: 'assign', label: '④割当へ' },
};

export const screen = {
  id: 'ranking',
  label: '順位',
  render(container, ctx) {
    const competition = ctx.state.competition;
    const ranking = rankTeams(competition);
    const rows = resultRows(ranking);

    container.append(h('h2', {}, '順位'));

    if (rows.length === 0) {
      container.append(
        h('div', { class: 'card stack' },
          h('p', {}, '先にチームを登録してください。'),
          h('button', { class: 'primary', type: 'button', onclick: () => ctx.navigate('teams') }, '②チームへ'),
        ),
      );
      container.append(shareCard(ctx));
      container.append(tieBreakNote(competition));
      return;
    }

    // 暫定表示（AC-14）
    if (!ranking.complete) {
      container.append(
        h('div', { class: 'card rk-provisional', role: 'status' },
          h('p', {}, h('span', { class: 'badge ng' }, '暫定（入力中）'), ' 全員のスコアが揃うまで順位は確定しません。'),
        ),
      );
    }

    container.append(rankTable(rows, ranking.complete));

    // 直す必要のあるチームの案内
    const pending = rows.filter((r) => FIX[r.status]);
    if (pending.length) {
      const list = h('div', { class: 'card stack' }, h('h3', {}, '確定していないチーム'));
      for (const r of pending) {
        const fix = FIX[r.status];
        list.append(
          h('div', { class: 'row rk-pending' },
            h('div', { class: 'grow' }, h('strong', {}, r.name), h('div', { class: 'hint' }, r.message ?? '')),
            h('button', { type: 'button', onclick: () => ctx.navigate(fix.to) }, fix.label),
          ),
        );
      }
      container.append(list);
    }

    container.append(shareCard(ctx));
    container.append(tieBreakNote(competition));
  },
};

function rankTable(rows, complete) {
  const tbody = h('tbody', {});
  for (const r of rows) {
    const rankCell = h('td', { class: 'rk-rank' }, h('span', { class: 'rk-rank-num' }, r.rankText));
    if (r.tied) rankCell.append(h('div', {}, h('span', { class: 'badge' }, '＝同順位')));
    tbody.append(
      h('tr', { class: r.reason ? 'rk-has-reason' : null },
        rankCell,
        h('td', { class: 'left rk-name' }, r.name),
        h('td', { class: 'rk-total' }, r.total != null ? String(r.total) : '—'),
        h('td', {}, r.front != null ? String(r.front) : '—'),
        h('td', {}, r.back != null ? String(r.back) : '—'),
      ),
    );
    if (r.reason) {
      tbody.append(h('tr', { class: 'rk-reason-row' }, h('td', { colspan: 5, class: 'left rk-reason' }, `同点処理: ${r.reason}`)));
    }
  }
  return h('div', { class: 'card' },
    h('div', { class: 'table-wrap' },
      h('table', { class: 'grid rk-table' },
        h('caption', { class: 'rk-caption' }, complete ? 'チーム順位' : 'チーム順位（暫定・合計は参考値）'),
        h('thead', {}, h('tr', {},
          h('th', {}, '順位'), h('th', { class: 'left' }, 'チーム'), h('th', {}, '合計'), h('th', {}, '前半'), h('th', {}, '後半'))),
        tbody,
      ),
    ),
  );
}

function tieBreakNote(competition) {
  return h('p', { class: 'hint rk-tiebreak' }, `同点処理の方式: ${tieBreakLabel(competition.settings.tieBreak)}`);
}

function shareCard(ctx) {
  const status = h('p', { class: 'rk-share-status', role: 'status' });
  const area = h('div', { class: 'rk-fallback' });
  const say = (msg, isError = false) => {
    status.textContent = msg;
    status.className = 'rk-share-status' + (isError ? ' error-text' : '');
  };
  const showText = (text) => {
    area.textContent = '';
    const ta = h('textarea', { readonly: true, rows: 10, class: 'rk-textarea', 'aria-label': '共有する結果テキスト' });
    ta.value = text;
    area.append(ta);
    say('自動でコピーできませんでした。下の文章を長押しして手でコピーしてください。');
    ta.focus();
    ta.select();
  };

  // iOS はユーザー操作の直後でないと共有に失敗する。文字列は同期的に作ってから呼ぶ
  const onShare = () => {
    const text = resultText(ctx.state.competition, rankTeams(ctx.state.competition));
    area.textContent = '';
    say('');
    const copyOrShow = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => say('結果をクリップボードにコピーしました。'),
          () => showText(text),
        );
      } else {
        showText(text);
      }
    };
    if (navigator.share) {
      navigator.share({ text }).then(
        () => say('共有しました。'),
        (e) => {
          if (e && e.name === 'AbortError') return; // 共有シートを閉じただけ
          copyOrShow();
        },
      );
    } else {
      copyOrShow();
    }
  };

  return h('div', { class: 'card stack' },
    h('h3', {}, '結果を共有'),
    h('button', { class: 'primary rk-share-btn', type: 'button', onclick: onShare }, '結果をテキストで共有'),
    status,
    area,
  );
}
