// PWA の登録と更新の通知。Service Worker が使えない環境では何もしない。

// 新しい版が待機状態になったら onUpdateReady(registration) を呼ぶ。
// 利用者が更新を選んだら applyUpdate(registration) で有効にし、切り替わったら一度だけ再読み込みする
export function registerServiceWorker({ onUpdateReady }) {
  if (!('serviceWorker' in navigator)) return;

  // 初回の登録（制御するものが無かった状態からの切り替わり）では再読み込みしない
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then(
    (reg) => {
      const notifyIfWaiting = () => {
        if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg);
      };
      notifyIfWaiting();
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed') notifyIfWaiting();
        });
      });
      // アプリを開いたままにしていても、画面に戻ったときに新しい版を探す
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
    () => { /* 登録できない環境（通信なしの初回など）では、そのまま動かす */ },
  );

  // 端末内のデータを消されにくくするよう求める（iOS では結果が保証されない。拒否されても支障はない）
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

export function applyUpdate(reg) {
  if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
