/** Encode away from the UI thread when the browser supports transferable bitmaps. */
export async function encodeTierCanvas(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    let worker: Worker | undefined;
    let url: string | undefined;
    let bitmap: ImageBitmap | undefined;
    try {
      url = URL.createObjectURL(new Blob([`onmessage = async ({ data }) => { try { const canvas = new OffscreenCanvas(data.width, data.height); canvas.getContext('2d').drawImage(data.bitmap, 0, 0); data.bitmap.close(); postMessage({ blob: await canvas.convertToBlob({ type: 'image/png' }) }); } catch { postMessage({ error: true }); } };`], { type: 'text/javascript' }));
      worker = new Worker(url);
      bitmap = await createImageBitmap(canvas);
      const encoder = worker;
      return await new Promise<Blob>((resolve, reject) => {
        const timer: { value?: ReturnType<typeof setTimeout> } = {};
        const abort = () => { clearTimeout(timer.value); encoder.terminate(); reject(new DOMException('Экспорт отменён', 'AbortError')); };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        timer.value = setTimeout(() => { signal.removeEventListener('abort', abort); reject(new Error('Не удалось обработать изображение.')); }, 30000);
        const finish = () => { clearTimeout(timer.value); signal.removeEventListener('abort', abort); };
        encoder.onmessage = event => { finish(); if (event.data.blob instanceof Blob) resolve(event.data.blob); else reject(new Error('Не удалось обработать изображение.')); };
        encoder.onerror = () => { finish(); reject(new Error('Не удалось запустить обработку изображения.')); };
        encoder.postMessage({ width: canvas.width, height: canvas.height, bitmap }, [bitmap!]);
        bitmap = undefined;
      });
    } catch (error) { if (signal.aborted) throw error; }
    finally { bitmap?.close(); worker?.terminate(); if (url) URL.revokeObjectURL(url); }
  }
  if (signal.aborted) throw new DOMException('Экспорт отменён', 'AbortError');
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось создать PNG.')), 'image/png'));
}
