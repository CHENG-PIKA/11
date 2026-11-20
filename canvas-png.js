// Some browsers defer asynchronous canvas encoding in a background tab.
// Keep saving usable by falling back to synchronous PNG encoding after a delay.
export function encodePng(canvas, {timeoutMs = 8000} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const fallback = () => {
      if (settled) return;
      try {
        const url = canvas.toDataURL('image/png');
        if (!url.startsWith('data:image/png;base64,')) throw Error('图片导出失败，请减小尺寸');
        const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0));
        finish(new Blob([bytes], {type:'image/png'}));
      } catch (error) { finish(null, error); }
    };
    const timer = setTimeout(fallback, timeoutMs);
    try { canvas.toBlob(blob => blob ? finish(blob) : fallback(), 'image/png'); }
    catch (error) { finish(null, error); }
  });
}
