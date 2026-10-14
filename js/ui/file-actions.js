// ファイルの書き出し（共有シート / ダウンロード）と読み込み。T-9（JSON）と T-14（PNG）で共用する。

// content: 文字列または Blob。iOS では、ユーザー操作の直後でないと navigator.share が失敗する。
// ボタンのクリックハンドラの中から、時間のかかる非同期処理を挟まずに呼ぶこと（ファイルの作成は同期で行う）。
// 戻り値: { ok: true, method: 'share' | 'download' } / { ok: false, cancelled: true } / { ok: false, error }
export async function shareFile({ filename, mime, content }) {
  let file;
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    file = new File([blob], filename, { type: mime });
  } catch (error) {
    return { ok: false, error };
  }

  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    let canShare = false;
    try { canShare = nav.canShare({ files: [file] }); } catch { canShare = false; }
    if (canShare) {
      try {
        await nav.share({ files: [file] });
        return { ok: true, method: 'share' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
        // 共有に失敗したときはダウンロードに切り替える
      }
    }
  }
  return download(file);
}

function download(file) {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true, method: 'download' };
  } catch (error) {
    return { ok: false, error };
  }
}

// 選んだファイルの中身を文字列で読む
export function readFileText(file) {
  return file.text();
}
