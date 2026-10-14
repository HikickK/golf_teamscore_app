// チーム画面（AC-6〜11）: チーム・選手の登録、人数（3 / 4 名）、HDCP、採用上限、同 HDCP の順序指定。
import { h } from './dom.js';
import { checkName, checkTeamSize, NAME_MAX } from '../model.js';
import { quotasFor, tiedGroups } from '../quota.js';
import {
  createTeam, addPlayer, removePlayer, canAddPlayer, canRemovePlayer, playerHasScores, teamHasScores,
  parseHdcp, setHdcp, setTieOrder, tieWarning,
} from './teams-logic.js';

const LOCKED_MESSAGE = '保存データが壊れているため、変更できません（設定画面または画面上部のお知らせから初期化してください）';

export const screen = {
  id: 'teams',
  label: 'チーム',
  render(container, ctx) {
    const { state } = ctx;
    const comp = state.competition;

    // 変更を受け付けなかった（locked）ときに画面上部へ理由を出す
    const notice = h('div', { class: 'error-text teams-notice', role: 'alert' });
    const setNotice = (msg) => { notice.textContent = msg || ''; };
    const apply = (mutator, { quiet = false } = {}) => {
      const accepted = quiet ? ctx.commitQuiet(mutator) : state.commit(mutator);
      setNotice(accepted ? '' : LOCKED_MESSAGE);
      return accepted;
    };

    const findTeam = (c, id) => c.teams.find((t) => t.id === id);

    // ---- 部品 ----
    // テキスト入力。valid なら onValid(value) で状態へ保存（quiet）。確定（change）で描き直す
    function textField({ id, label, value, className, inputProps, check, save }) {
      const err = h('div', { class: 'error-text', id: `${id}-err` });
      const input = h('input', { id, type: 'text', value, autocomplete: 'off', 'aria-describedby': `${id}-err`, ...inputProps });
      const wrap = h('div', { class: `field ${className || ''}` }, h('label', { for: id }, label), input, err);
      const validate = () => {
        const r = check(input.value);
        err.textContent = r.message || '';
        wrap.classList.toggle('is-invalid', !r.ok);
        input.setAttribute('aria-invalid', r.ok ? 'false' : 'true');
        return r;
      };
      input.addEventListener('input', () => {
        const r = validate();
        if (r.ok) apply((c) => save(c, r.value), { quiet: true });
      });
      input.addEventListener('change', () => {
        const r = validate();
        if (r.ok && !state.locked) ctx.rerender(); // 採用上限・警告の表示を更新する
      });
      return wrap;
    }

    function playerRow(team, player, quotaResult) {
      const group = tiedGroups(team).find((g) => g.includes(player));
      const quota = quotaResult.ok ? `採用 ${quotaResult.quotas[player.id]} ホール` : '採用 未確定';

      const nameField = textField({
        id: `${player.id}-name`,
        label: '氏名',
        value: player.name,
        className: 'grow t-name',
        inputProps: { maxlength: String(NAME_MAX + 10) },
        check: (v) => {
          const m = checkName(v);
          return m ? { ok: false, message: m } : { ok: true, value: v.trim() };
        },
        save: (c, v) => { findTeam(c, team.id).players.find((p) => p.id === player.id).name = v; },
      });

      const hdcpField = textField({
        id: `${player.id}-hdcp`,
        label: 'HDCP',
        value: String(player.hdcp),
        className: 't-hdcp',
        inputProps: { inputmode: 'decimal' },
        check: (v) => parseHdcp(v),
        save: (c, v) => setHdcp(findTeam(c, team.id), player.id, v),
      });

      const parts = [nameField];
      const line = h('div', { class: 'row t-line' }, hdcpField);

      if (group) {
        const sel = h('select', { id: `${player.id}-tie`, 'aria-label': `${player.name} の順序（同じ HDCP の中で、1 が採用ホールの多い側）` },
          h('option', { value: '' }, '未指定'),
          ...group.map((_, i) => h('option', { value: String(i + 1), selected: player.tieOrder === i + 1 }, String(i + 1))),
        );
        sel.addEventListener('change', () => {
          const order = sel.value === '' ? null : Number(sel.value);
          apply((c) => setTieOrder(findTeam(c, team.id), player.id, order));
        });
        line.append(h('div', { class: 'field t-tie' }, h('label', { for: `${player.id}-tie` }, '順序'), sel));
      }

      line.append(h('span', { class: `badge t-quota ${quotaResult.ok ? 'ok' : 'ng'}` }, quota));

      if (canRemovePlayer(team)) {
        line.append(h('button', {
          type: 'button', class: 'danger t-remove', 'aria-label': `${player.name} を削除`,
          onclick: () => {
            const msg = playerHasScores(player)
              ? `「${player.name}」を削除します。入力済みのスコアも消えます。よろしいですか？`
              : `「${player.name}」を削除します。よろしいですか？`;
            if (!confirm(msg)) return;
            apply((c) => removePlayer(findTeam(c, team.id), player.id));
          },
        }, '削除'));
      }
      parts.push(line);
      return h('div', { class: 'player' }, ...parts);
    }

    function teamCard(team) {
      const quotaResult = quotasFor(team, comp.settings.allocationDirection);
      const warning = tieWarning(team);
      const sizeMsg = checkTeamSize(team.players.length);

      const nameField = textField({
        id: `${team.id}-name`,
        label: 'チーム名',
        value: team.name,
        className: 'grow',
        inputProps: { maxlength: String(NAME_MAX + 10) },
        check: (v) => {
          const m = checkName(v, 'チーム名');
          return m ? { ok: false, message: m } : { ok: true, value: v.trim() };
        },
        save: (c, v) => { findTeam(c, team.id).name = v; },
      });

      const delBtn = h('button', {
        type: 'button', class: 'danger', 'aria-label': `${team.name} を削除`,
        onclick: () => {
          const msg = teamHasScores(team)
            ? `チーム「${team.name}」を削除します。入力済みのスコアもすべて消えます。よろしいですか？`
            : `チーム「${team.name}」を削除します。よろしいですか？`;
          if (!confirm(msg)) return;
          apply((c) => { c.teams = c.teams.filter((t) => t.id !== team.id); });
        },
      }, 'チームを削除');

      return h('section', { class: 'card team-card', 'data-team': team.id },
        h('div', { class: 'row t-head' }, nameField, delBtn),
        h('div', { class: 'row between t-size' },
          h('span', { class: 'label' }, `人数 ${team.players.length} 名`),
          canAddPlayer(team)
            ? h('button', { type: 'button', class: 't-add', onclick: () => apply((c) => addPlayer(c, findTeam(c, team.id))) }, '選手を追加（4 名にする）')
            : h('span', { class: 'hint' }, '3 名にするには選手を削除'),
        ),
        sizeMsg ? h('div', { class: 'error-text' }, sizeMsg) : null,
        warning ? h('div', { class: 'tie-warning', role: 'alert' }, h('strong', {}, '⚠ 要入力　'), warning) : null,
        h('div', { class: 'stack players' }, ...team.players.map((p) => playerRow(team, p, quotaResult))),
        h('p', { class: 'hint t-hint' },
          `採用ホール数は HDCP の順位で決まります（配分の向きは設定画面）。HDCP が同じ選手は「順序」で指定します（1 = 採用ホールが多い側）。`),
      );
    }

    // ---- 画面 ----
    container.append(h('h2', {}, 'チーム'), notice);

    if (comp.teams.length === 0) {
      container.append(h('div', { class: 'card' }, h('p', {}, 'チームがまだありません。「チームを追加」を押してください。'), h('p', { class: 'hint' }, '各チームは 3 名または 4 名です。')));
    } else {
      container.append(...comp.teams.map(teamCard));
    }

    container.append(h('button', {
      type: 'button', class: 'primary t-add-team',
      onclick: () => apply((c) => { c.teams.push(createTeam(c)); }),
    }, 'チームを追加'));
  },
};
