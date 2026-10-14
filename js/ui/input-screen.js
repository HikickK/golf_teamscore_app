// ③ 入力画面。ホールごとのカードに選手ごとのスコア入力（−／値／＋）を並べる。
// 変更のたびに ctx.commitQuiet で即時保存し、画面全体は描き直さず、変わった部分だけ更新する（フォーカスを保つ）。
import { h } from './dom.js';
import { HOLES } from '../model.js';
import { FRONT_END, stepScore, parseScoreInput, subtotals, teamProgress, holeComplete, pickTeam } from './input-logic.js';

const LOCKED_MSG = '保存データが壊れているため、入力できません（上のお知らせから初期化してください）';

export const screen = {
  id: 'input',
  label: '入力',
  render(container, ctx) {
    const comp = ctx.state.competition;
    container.append(h('h2', {}, '入力'));

    const team = pickTeam(comp.teams, ctx.ui.selectedTeamId);
    if (!team) {
      container.append(
        h('div', { class: 'card stack' },
          h('p', {}, '先にチームを登録してください。'),
          h('button', { type: 'button', class: 'primary', onclick: () => ctx.navigate('teams') }, 'チーム画面へ'),
        ),
      );
      return;
    }
    ctx.ui.selectedTeamId = team.id;
    const teamId = team.id;
    const liveTeam = () => ctx.state.competition.teams.find((t) => t.id === teamId);

    // ---- チーム選択 ----
    const select = h('select', {
      id: 'input-team',
      onchange: () => {
        ctx.ui.selectedTeamId = select.value;
        ctx.rerender();
      },
    }, comp.teams.map((t) => h('option', { value: t.id, selected: t.id === teamId }, t.name)));
    container.append(h('div', { class: 'field' }, h('label', { for: 'input-team' }, 'チーム'), select));

    // ---- 進み具合 ----
    const progressText = h('span', { class: 'progress-text', id: 'input-progress' });
    const progressBadge = h('span', { class: 'badge', id: 'input-status' });
    container.append(h('div', { class: 'card row between input-progress' }, progressText, progressBadge));

    // 更新する部品の参照（refresh が使う）
    const holeMarks = []; // [hole] -> span
    const cells = []; // { playerId, hole, input, minus, plus, error }
    const outCells = []; // [playerIndex] -> td（前半の OUT 表）
    const sumCells = []; // [playerIndex] -> { out, in, total }

    function refresh() {
      const t = liveTeam();
      const pr = teamProgress(t);
      progressText.textContent = `入力済み ${pr.filled} / ${pr.total}`;
      progressBadge.textContent = pr.complete ? '✓ 入力完了' : '… 入力中';
      progressBadge.classList.toggle('ok', pr.complete);
      for (let hole = 0; hole < HOLES; hole++) {
        const done = holeComplete(t, hole);
        holeMarks[hole].textContent = done ? '✓ 全員入力済み' : '';
        holeMarks[hole].classList.toggle('is-done', done);
      }
      const fmt = (v) => (v === null ? '—' : String(v));
      t.players.forEach((p, i) => {
        const st = subtotals(p.scores);
        outCells[i].textContent = fmt(st.out);
        sumCells[i].out.textContent = fmt(st.out);
        sumCells[i].in.textContent = fmt(st.in);
        sumCells[i].total.textContent = fmt(st.total);
      });
      for (const c of cells) {
        const v = t.players.find((p) => p.id === c.playerId).scores[c.hole];
        c.minus.setAttribute('aria-disabled', v === 1 ? 'true' : 'false');
        c.plus.setAttribute('aria-disabled', v === 20 ? 'true' : 'false');
      }
    }

    // 1 つのスコアを state に書く。保存を受け付けたら true（保存できない状態なら入力欄を元に戻して false）
    function write(c, value) {
      const ok = ctx.commitQuiet((comp2) => {
        const tm = comp2.teams.find((x) => x.id === teamId);
        tm.players.find((p) => p.id === c.playerId).scores[c.hole] = value;
      });
      if (!ok) {
        const cur = liveTeam().players.find((p) => p.id === c.playerId).scores[c.hole];
        c.input.value = cur === null ? '' : String(cur);
        c.input.classList.remove('is-invalid');
        c.error.textContent = LOCKED_MSG;
        refresh();
      }
      return ok;
    }

    function buildCell(player, hole) {
      const par = comp.pars[hole];
      const c = { playerId: player.id, hole };
      const current = () => liveTeam().players.find((p) => p.id === player.id).scores[hole];
      const label = `${player.name} ${hole + 1}番ホールのスコア`;

      c.error = h('div', { class: 'error-text', role: 'alert' });
      const step = (delta) => {
        const r = stepScore(current(), par, delta);
        if (!r.ok) {
          c.error.textContent = r.error;
          return;
        }
        c.error.textContent = '';
        if (write(c, r.value)) {
          c.input.value = String(r.value);
          c.input.classList.remove('is-invalid');
          refresh();
        }
      };
      c.minus = h('button', { type: 'button', class: 'step', 'aria-label': `${label}を 1 減らす`, 'aria-disabled': 'false', onclick: () => step(-1) }, '−');
      c.plus = h('button', { type: 'button', class: 'step', 'aria-label': `${label}を 1 増やす`, 'aria-disabled': 'false', onclick: () => step(1) }, '＋');
      const v0 = player.scores[hole];
      c.input = h('input', {
        type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'score-input',
        placeholder: '—', 'aria-label': label, value: v0 === null ? '' : String(v0),
        oninput: () => {
          const r = parseScoreInput(c.input.value);
          if (r.kind === 'invalid') {
            // 状態には入れず、入力欄に残して理由を出す
            c.error.textContent = r.error;
            c.input.classList.add('is-invalid');
            return;
          }
          c.error.textContent = '';
          c.input.classList.remove('is-invalid');
          if (current() !== r.value) write(c, r.value);
          refresh();
        },
        onchange: () => {
          // 入力を終えたとき、受理された値は半角の正しい表記に直す。不正な値は理由つきで残す
          const r = parseScoreInput(c.input.value);
          if (r.kind === 'ok') c.input.value = String(r.value);
          if (r.kind === 'empty') c.input.value = '';
        },
      });
      cells.push(c);
      return h('div', { class: 'score-cell' },
        h('div', { class: 'score-line' },
          h('span', { class: 'player-name' }, player.name),
          h('div', { class: 'score-ctrl' }, c.minus, c.input, c.plus),
        ),
        c.error,
      );
    }

    function holeCard(hole) {
      const mark = h('span', { class: 'hole-mark' });
      holeMarks[hole] = mark;
      return h('div', { class: 'card hole-card' },
        h('div', { class: 'hole-head' },
          h('h3', {}, `${hole + 1}番`),
          h('span', { class: 'badge' }, `パー ${comp.pars[hole]}`),
          mark,
        ),
        team.players.map((p) => buildCell(p, hole)),
      );
    }

    // 前半の後: OUT。後半の後: OUT / IN / 合計
    function outCard() {
      return h('div', { class: 'card sub-card' },
        h('h3', {}, 'OUT（1〜9番）'),
        h('table', { class: 'grid' },
          h('tbody', {}, team.players.map((p, i) => {
            const td = h('td', { class: 'num' }, '—');
            outCells[i] = td;
            return h('tr', {}, h('th', { class: 'left', scope: 'row' }, p.name), td);
          })),
        ),
      );
    }
    function totalCard() {
      return h('div', { class: 'card sub-card' },
        h('h3', {}, '小計・合計'),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'grid' },
            h('thead', {}, h('tr', {}, h('th', { class: 'left' }, '選手'), h('th', {}, 'OUT'), h('th', {}, 'IN'), h('th', {}, '合計'))),
            h('tbody', {}, team.players.map((p, i) => {
              const o = h('td', { class: 'num' }, '—');
              const n = h('td', { class: 'num' }, '—');
              const t = h('td', { class: 'num total' }, '—');
              sumCells[i] = { out: o, in: n, total: t };
              return h('tr', {}, h('th', { class: 'left', scope: 'row' }, p.name), o, n, t);
            })),
          ),
        ),
      );
    }

    for (let hole = 0; hole < HOLES; hole++) {
      container.append(holeCard(hole));
      if (hole === FRONT_END - 1) container.append(outCard());
    }
    container.append(totalCard());
    refresh();
  },
};
