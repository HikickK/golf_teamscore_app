'use strict';

const $ = (id) => document.getElementById(id);
const KEY = 'spike.v1';

function log(msg) {
  const row = document.createElement('div');
  row.textContent = `${new Date().toLocaleTimeString('ja-JP')}  ${msg}`;
  $('log').prepend(row);
}

function rows(dl, pairs) {
  dl.textContent = '';
  for (const [k, v] of pairs) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP') : '-');

// ---------- 保存データ ----------
function readData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    log(`読込エラー: ${e.message}`);
    return null;
  }
}

function writeData(d) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch (e) {
    log(`保存エラー: ${e.message}`);
    return false;
  }
}

let data = readData() || { firstLaunch: new Date().toISOString(), launches: 0, lastLaunch: null, note: '' };
const prevLaunch = data.lastLaunch;
data.launches += 1;
data.lastLaunch = new Date().toISOString();
const saved = writeData(data);

function renderState() {
  rows($('state'), [
    ['保存できたか', saved ? 'OK' : 'NG（保存に失敗）'],
    ['メモ', data.note || '(なし)'],
    ['起動回数', String(data.launches)],
    ['最初の起動', fmt(data.firstLaunch)],
    ['前回の起動', fmt(prevLaunch)],
    ['今回の起動', fmt(data.lastLaunch)],
  ]);
  $('note').value = data.note || '';
}

$('save').addEventListener('click', () => {
  data.note = $('note').value;
  if (writeData(data)) log(`メモを保存: ${data.note}`);
  renderState();
});

$('clear').addEventListener('click', () => {
  try {
    localStorage.removeItem(KEY);
    log('保存データを削除しました（次回起動で回数が 1 から始まります）');
  } catch (e) {
    log(`削除エラー: ${e.message}`);
  }
});

// ---------- 環境情報 ----------
const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const env = [
  ['ホーム画面から起動', standalone ? 'はい（ホーム画面アプリ）' : 'いいえ（Safari のタブ）'],
  ['通信状態', navigator.onLine ? 'オンライン' : 'オフライン'],
  ['Service Worker 対応', 'serviceWorker' in navigator ? 'はい' : 'いいえ'],
  ['共有 (Web Share)', typeof navigator.share === 'function' ? '対応' : '非対応'],
  ['OS / ブラウザ', navigator.userAgent],
];
rows($('env'), env);
if (!standalone) {
  $('mode-hint').textContent = 'いまは Safari のタブで開いています。検証は「ホーム画面に追加」したアイコンから開いて行ってください（タブとホーム画面アプリは保存領域が別です）。';
}
renderState();

window.addEventListener('online', () => log('オンラインになりました'));
window.addEventListener('offline', () => log('オフラインになりました'));

// 永続化の要求
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(
    (granted) => {
      log(`storage.persist(): ${granted ? '許可' : '不許可'}`);
      env.push(['永続化 (persist)', granted ? '許可' : '不許可']);
      rows($('env'), env);
    },
    (e) => log(`storage.persist() エラー: ${e.message}`)
  );
} else {
  log('storage.persist() は未対応です');
}

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(
    () => log('Service Worker を登録しました'),
    (e) => log(`Service Worker 登録エラー: ${e.message}`)
  );
  navigator.serviceWorker.ready.then(() => {
    const controlled = !!navigator.serviceWorker.controller;
    log(`Service Worker 準備完了（このページを制御: ${controlled ? 'はい' : 'いいえ。次回起動から有効'}）`);
    env.push(['オフライン用の保存', controlled ? '有効' : '次回起動から有効']);
    rows($('env'), env);
  });
}

// ---------- V-4: PNG ----------
let pngBlob = null;

function makePng() {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 480;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1a6b3a';
  g.fillRect(0, 0, c.width, 70);
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px sans-serif';
  g.fillText('団体戦 結果（検証用）', 24, 47);
  g.fillStyle = '#1b1f1c';
  g.font = '28px sans-serif';
  const lines = ['1位  チームA   72', '2位  チームB   74', '3位  チームC   74（後半 36）', '3位  チームD   74（後半 38）'];
  lines.forEach((t, i) => g.fillText(t, 40, 140 + i * 56));
  g.font = '20px sans-serif';
  g.fillStyle = '#555';
  g.fillText(`生成: ${new Date().toLocaleString('ja-JP')}`, 40, 440);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

$('png-make').addEventListener('click', async () => {
  try {
    pngBlob = await makePng();
    const out = $('png-out');
    out.textContent = '';
    const img = document.createElement('img');
    img.alt = '生成した画像';
    img.src = URL.createObjectURL(pngBlob);
    out.append(img);
    log(`PNG を生成しました（${pngBlob.size} バイト）。日本語の表示を確認してください`);
  } catch (e) {
    log(`PNG 生成エラー: ${e.message}`);
  }
});

$('png-share').addEventListener('click', async () => {
  if (!pngBlob) {
    log('先に「① 画像を生成」を押してください');
    return;
  }
  const file = new File([pngBlob], 'spike.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '検証画像' });
      log('共有シートを閉じました（保存できたか写真アプリで確認してください）');
    } else {
      log('この環境ではファイル共有が使えません。画像を長押しして保存してください');
    }
  } catch (e) {
    log(`共有: ${e.name} ${e.message}`);
  }
});

// ---------- V-5: JSON ----------
function buildJson() {
  return JSON.stringify({ app: 'spike', exportedAt: new Date().toISOString(), data }, null, 2);
}

$('json-share').addEventListener('click', async () => {
  const file = new File([buildJson()], 'spike.json', { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '検証JSON' });
      log('共有シートを閉じました（「ファイルに保存」したか確認してください）');
    } else {
      log('この環境ではファイル共有が使えません。「ダウンロード」を試してください');
    }
  } catch (e) {
    log(`共有: ${e.name} ${e.message}`);
  }
});

$('json-dl').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([buildJson()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spike.json';
  document.body.append(a);
  a.click();
  a.remove();
  log('ダウンロードを開始しました');
});

$('json-file').addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    $('json-out').textContent = `読み込み成功: ${f.name}\n${JSON.stringify(obj, null, 2)}`;
    log(`JSON を読み込みました: ${f.name}`);
  } catch (e) {
    $('json-out').textContent = `読み込み失敗: ${e.message}`;
    log(`JSON 読込エラー: ${e.message}`);
  }
});
