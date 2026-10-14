// 結果ページ（順位表）の PNG 画像を作る。
//   layoutResultImage: 配置の計算（DOM に依存しない純粋関数。文字幅は measure で受け取る）→ テスト対象
//   resultPng: Canvas に描いて PNG の Blob にする（ブラウザ専用）
// 画像は共有先で見られるため、画面のダークモードに関係なく、固定の配色（白地）にする。

import { resultRows, resultTitle, tieBreakLabel } from './share.js';

export const IMAGE_WIDTH = 720; // 論理幅（出力は SCALE 倍）
export const SCALE = 2;
const PAD = 32;

const COLOR = {
  bg: '#ffffff',
  head: '#1a6b3a',
  headText: '#ffffff',
  warnBg: '#fff4d6',
  warnText: '#6b4e00',
  thBg: '#eef2ef',
  muted: '#5b665f',
  text: '#1b1f1c',
  line: '#d5dbd6',
};

export const fontOf = (size, bold = false) => `${bold ? '700 ' : ''}${size}px -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif`;

// text を maxWidth に収まるように折り返す（日本語は文字単位で折る）
export function wrapText(text, maxWidth, font, measure) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (cur !== '' && measure(cur + ch, font) > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || lines.length === 0) lines.push(cur);
  return lines;
}

// 長い文字列を「…」で切り詰める
export function truncateText(text, maxWidth, font, measure) {
  const s = String(text);
  if (measure(s, font) <= maxWidth) return s;
  let cur = '';
  for (const ch of s) {
    if (measure(cur + ch + '…', font) > maxWidth) break;
    cur += ch;
  }
  return cur + '…';
}

// 配置を計算する。戻り値: { width, height, items }
//   items: { kind: 'rect', x, y, w, h, fill } / { kind: 'text', x, y(中心), text, font, fill, align }
export function layoutResultImage(competition, ranking, measure) {
  const rows = resultRows(ranking);
  const complete = !!ranking?.complete;
  const W = IMAGE_WIDTH;
  const items = [];
  const rect = (x, y, w, h, fill) => items.push({ kind: 'rect', x, y, w, h, fill });
  const text = (x, y, t, font, fill, align = 'left') => items.push({ kind: 'text', x, y, text: t, font, fill, align });

  // 背景（高さは最後に確定するので、先頭に置いて後で書き換える）
  const bg = { kind: 'rect', x: 0, y: 0, w: W, h: 0, fill: COLOR.bg };
  items.push(bg);
  let y = 0;

  // 見出し
  const titleFont = fontOf(32, true);
  const titleLines = wrapText(resultTitle(competition), W - PAD * 2, titleFont, measure);
  const headH = 40 + titleLines.length * 44;
  rect(0, y, W, headH, COLOR.head);
  titleLines.forEach((line, i) => text(PAD, y + 20 + 22 + i * 44, line, titleFont, COLOR.headText));
  y += headH;

  // 暫定の帯
  if (!complete) {
    const warnFont = fontOf(20, true);
    const lines = wrapText('暫定：全員のスコア入力が終わるまで順位は確定していません', W - PAD * 2, warnFont, measure);
    const h = 24 + lines.length * 30;
    rect(0, y, W, h, COLOR.warnBg);
    lines.forEach((line, i) => text(PAD, y + 12 + 15 + i * 30, line, warnFont, COLOR.warnText));
    y += h;
  }

  // 表の見出し
  const COL = { rank: PAD, name: 170, total: 520, front: 604, back: W - PAD };
  rect(0, y, W, 44, COLOR.thBg);
  const thFont = fontOf(20, true);
  text(COL.rank, y + 22, '順位', thFont, COLOR.muted);
  text(COL.name, y + 22, 'チーム', thFont, COLOR.muted);
  text(COL.total, y + 22, '合計', thFont, COLOR.muted, 'right');
  text(COL.front, y + 22, '前半', thFont, COLOR.muted, 'right');
  text(COL.back, y + 22, '後半', thFont, COLOR.muted, 'right');
  y += 44;

  if (rows.length === 0) {
    text(PAD, y + 40, '（チームが未登録です）', fontOf(24), COLOR.muted);
    y += 80;
  }

  const nameFont = fontOf(28, true);
  const reasonFont = fontOf(20);
  const nameMax = COL.total - 110 - COL.name;
  for (const r of rows) {
    const rowH = 64;
    text(COL.rank, y + (r.tied ? 24 : 32), r.rankText, fontOf(30, true), COLOR.text);
    if (r.tied) text(COL.rank, y + 48, '＝同順位', fontOf(16), COLOR.muted);
    text(COL.name, y + 32, truncateText(r.name, nameMax, nameFont, measure), nameFont, COLOR.text);
    text(COL.total, y + 32, r.total != null ? String(r.total) : '—', fontOf(32, true), COLOR.text, 'right');
    text(COL.front, y + 32, r.front != null ? String(r.front) : '—', fontOf(26), COLOR.text, 'right');
    text(COL.back, y + 32, r.back != null ? String(r.back) : '—', fontOf(26), COLOR.text, 'right');
    y += rowH;

    // 同点処理の決着理由（確定時のみ）
    let rowEnd = y;
    if (complete && r.reason) {
      const lines = wrapText(`└ 同点処理：${r.reason}`, W - PAD * 2 - 16, reasonFont, measure);
      lines.forEach((line, i) => text(PAD + 16, y + 4 + 14 + i * 28, line, reasonFont, COLOR.muted));
      rowEnd = y + 8 + lines.length * 28;
    }
    rect(0, rowEnd, W, 1, COLOR.line);
    y = rowEnd + 1;
  }

  // 同点処理の方式
  const noteFont = fontOf(18);
  const noteLines = wrapText(`同点処理の方式：${tieBreakLabel(competition.settings?.tieBreak)}`, W - PAD * 2, noteFont, measure);
  y += 16;
  noteLines.forEach((line, i) => text(PAD, y + 12 + i * 26, line, noteFont, COLOR.muted));
  y += noteLines.length * 26 + 24;

  bg.h = y;
  return { width: W, height: y, items };
}

// Canvas に描いて PNG の Blob を返す（ブラウザ専用）。失敗したら例外を投げる
export async function resultPng(competition, ranking) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('この端末では画像を作れません');

  const measure = (t, font) => {
    ctx.font = font;
    return ctx.measureText(t).width;
  };
  const layout = layoutResultImage(competition, ranking, measure);

  canvas.width = layout.width * SCALE;
  canvas.height = layout.height * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';
  for (const it of layout.items) {
    if (it.kind === 'rect') {
      ctx.fillStyle = it.fill;
      ctx.fillRect(it.x, it.y, it.w, it.h);
    } else {
      ctx.font = it.font;
      ctx.fillStyle = it.fill;
      ctx.textAlign = it.align;
      ctx.fillText(it.text, it.x, it.y);
    }
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('画像を生成できませんでした');
  return blob;
}
