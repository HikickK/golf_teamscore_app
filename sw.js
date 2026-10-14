'use strict';

// Service Worker: アプリ一式を端末に保存し、圏外でも起動できるようにする。
// アプリを更新したら VERSION を上げる（古い保存は新しい版が有効になったときに消える）。
// PRECACHE には app/ のファイルをすべて載せる（漏れると、そのファイルだけ圏外で読めなくなる。tests/pwa.test.js が漏れを検出する）。
const VERSION = 'v1';
const CACHE_PREFIX = 'golf-teamscore-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/settings.css',
  './css/teams.css',
  './css/input.css',
  './css/assign.css',
  './css/ranking.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './js/main.js',
  './js/state.js',
  './js/model.js',
  './js/quota.js',
  './js/assign.js',
  './js/ranking.js',
  './js/storage.js',
  './js/share.js',
  './js/result-image.js',
  './js/ui/dom.js',
  './js/ui/screens.js',
  './js/ui/file-actions.js',
  './js/ui/settings-screen.js',
  './js/ui/settings-logic.js',
  './js/ui/teams-screen.js',
  './js/ui/teams-logic.js',
  './js/ui/input-screen.js',
  './js/ui/input-logic.js',
  './js/ui/assign-screen.js',
  './js/ui/assign-logic.js',
  './js/ui/ranking-screen.js',
  './js/pwa.js',
];

// 新しい版は、利用者が「更新する」を押すまで待機させる（入力中に勝手に切り替わらないように）。
// そのため install では skipWaiting しない
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 画面の「更新する」から届く合図。待機中の新しい版を有効にする
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 保存したものを優先して返す。無ければ通信する（圏外なら失敗する）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // ページの移動は、保存済みの index.html を返す（画面の切り替えはハッシュなので 1 ページで足りる）
    if (req.mode === 'navigate') {
      const index = await cache.match('./index.html');
      if (index) return index;
    }
    try {
      return await fetch(req);
    } catch {
      return new Response('オフラインのため読み込めませんでした', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
