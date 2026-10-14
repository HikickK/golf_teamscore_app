// 割当画面（④）。採用ホールの自動割当の表示と、手動での調整。
import { h } from './dom.js';
import { pickTeam, buildAssignView, switchToManual, switchToAuto, applyManualTap } from './assign-logic.js';

const LOCKED_MESSAGE = '保存データが壊れているため、変更できません（設定画面で初期化してください）';

export const screen = {
  id: 'assign',
  label: '割当',
  render(container, ctx) {
    const competition = ctx.state.competition;
    container.append(h('h2', {}, '割当'));

    const team = pickTeam(competition, ctx.ui.selectedTeamId);
    if (!team) {
      container.append(
        h('div', { class: 'card stack' },
          h('p', {}, 'チームがありません。先にチームと選手を登録してください。'),
          h('button', { type: 'button', class: 'primary', onclick: () => ctx.navigate('teams') }, 'チーム画面へ'),
        ),
      );
      return;
    }
    ctx.ui.selectedTeamId = team.id;

    container.append(teamSelect(competition, team, ctx));

    const view = buildAssignView(team, competition);
    if (view.status === 'setup') {
      container.append(
        h('div', { class: 'card stack' },
          h('p', { class: 'error-text assign-notice' }, view.message),
          h('button', { type: 'button', class: 'primary', onclick: () => ctx.navigate('teams') }, 'チーム画面へ'),
        ),
      );
      return;
    }
    if (view.status === 'incomplete') {
      container.append(
        h('div', { class: 'card stack' },
          h('p', { class: 'assign-notice' }, 'スコアが未入力です。全選手・全ホールのスコアを入力すると、割当を表示します。'),
          h('button', { type: 'button', class: 'primary', onclick: () => ctx.navigate('input') }, '入力画面へ'),
        ),
      );
      return;
    }

    const errorEl = h('div', { class: 'error-text assign-error', role: 'alert' });
    container.append(
      modeCard(team, view, ctx, errorEl),
      h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, table(team, view, ctx, errorEl))),
      h('p', { class: 'hint' }, view.mode === 'manual'
        ? '表のセルをタップすると、そのホールの採用者になります。もう一度タップすると解除します。'
        : '● が採用されたスコアです。スコアを修正すると自動で再計算されます。'),
    );
  },
};

function teamSelect(competition, team, ctx) {
  const select = h('select', {
    id: 'assign-team',
    onchange: (e) => {
      ctx.ui.selectedTeamId = e.target.value;
      ctx.rerender();
    },
  }, competition.teams.map((t) => h('option', { value: t.id, selected: t.id === team.id }, t.name)));
  return h('div', { class: 'field assign-team' }, h('label', { for: 'assign-team' }, 'チーム'), select);
}

function modeCard(team, view, ctx, errorEl) {
  const manual = view.mode === 'manual';
  const status = manual
    ? view.confirmed ? h('span', { class: 'badge ok' }, '✓ 確定') : h('span', { class: 'badge ng' }, '未完了')
    : h('span', { class: 'badge ok' }, '✓ 確定（自動）');

  const toggle = manual
    ? h('button', {
      type: 'button',
      class: 'danger',
      onclick: () => {
        // 手動の選択が失われるので確認する（AC-24）
        if (!confirm('手動の選択を破棄して、自動割当に戻します。よろしいですか？')) return;
        const next = switchToAuto();
        const ok = ctx.state.commit(() => {
          team.assignmentMode = next.assignmentMode;
          team.manualAssignment = next.manualAssignment;
        });
        if (!ok) errorEl.textContent = LOCKED_MESSAGE;
      },
    }, '自動に戻す')
    : h('button', {
      type: 'button',
      onclick: () => {
        const next = switchToManual(team, ctx.state.competition);
        if (!next.ok) {
          errorEl.textContent = next.error.message;
          return;
        }
        const ok = ctx.state.commit(() => {
          team.assignmentMode = next.assignmentMode;
          team.manualAssignment = next.manualAssignment;
        });
        if (!ok) errorEl.textContent = LOCKED_MESSAGE;
      },
    }, '手動で調整する');

  const total = view.subtotals.all.total;
  return h('div', { class: 'card stack' },
    h('div', { class: 'row between' },
      h('div', {}, h('span', { class: 'label' }, manual ? '手動割当' : '自動割当'), ' ', status),
      toggle,
    ),
    h('div', { class: 'assign-total' },
      h('span', { class: 'muted' }, 'チーム合計'), ' ', h('strong', { class: 'assign-total-num' }, view.unassignedCount > 0 ? `${total}（暫定）` : String(total)),
      h('span', { class: 'muted' }, `　前半 ${view.subtotals.front.total} / 後半 ${view.subtotals.back.total}`),
    ),
    view.incompleteText ? h('p', { class: 'assign-incomplete' }, '未完了: ' + view.incompleteText) : null,
    errorEl,
  );
}

function table(team, view, ctx, errorEl) {
  const manual = view.mode === 'manual';
  const head = h('tr', {},
    h('th', { class: 'sticky-col' }, 'H'),
    h('th', {}, 'パー'),
    view.players.map((p) => h('th', { class: 'assign-name' }, p.name)),
    h('th', { class: 'assign-adopted-col' }, '採用'),
  );

  const holeRow = (r) => h('tr', {},
    h('th', { class: 'sticky-col' }, String(r.hole)),
    h('td', {}, String(r.par)),
    r.cells.map((c) => cell(team, r, c, manual, ctx, errorEl)),
    h('td', { class: 'assign-adopted-col' }, r.adoptedScore === null ? '－' : String(r.adoptedScore)),
  );

  const sumRow = (label, sub, cls) => h('tr', { class: cls },
    h('th', { class: 'sticky-col' }, label),
    h('td', {}, ''),
    sub.perPlayer.map((v) => h('td', {}, String(v))),
    h('td', { class: 'assign-adopted-col' }, String(sub.total)),
  );

  const countRow = h('tr', { class: 'assign-sum' },
    h('th', { class: 'sticky-col' }, '採用数'),
    h('td', {}, ''),
    view.playerStats.map((p) => h('td', { class: `assign-count is-${p.state}` },
      `${p.count} / ${p.quota}`,
      ' ',
      h('span', { class: 'assign-count-mark' }, p.state === 'ok' ? '✓' : p.state === 'over' ? '超過' : '不足'),
    )),
    h('td', { class: 'assign-adopted-col' }, ''),
  );

  const body = [];
  view.rows.forEach((r, i) => {
    body.push(holeRow(r));
    if (i === 8) body.push(sumRow('OUT', view.subtotals.front, 'assign-sum'));
    if (i === 17) body.push(sumRow('IN', view.subtotals.back, 'assign-sum'));
  });
  body.push(sumRow('合計', view.subtotals.all, 'assign-sum assign-grand'), countRow);

  return h('table', { class: 'grid assign-table' }, h('thead', {}, head), h('tbody', {}, body));
}

function cell(team, r, c, manual, ctx, errorEl) {
  const text = c.adopted ? `● ${c.score}` : String(c.score);
  const cls = 'assign-cell' + (c.adopted ? ' is-adopted' : '');
  if (!manual) return h('td', { class: cls }, text);

  const btn = h('button', {
    type: 'button',
    class: 'assign-cell-btn',
    'aria-pressed': c.adopted ? 'true' : 'false',
    onclick: () => {
      const res = applyManualTap(team, ctx.state.competition, r.index, c.playerId);
      if (!res.ok) {
        errorEl.textContent = res.error.message; // 上限を超える選択は受理しない（AC-21）
        return;
      }
      const ok = ctx.state.commit(() => {
        team.manualAssignment = res.assignment;
      });
      if (!ok) errorEl.textContent = LOCKED_MESSAGE;
    },
  }, text);
  return h('td', { class: cls }, btn);
}
