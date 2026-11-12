import { encodeTierCanvas } from './export-encode';
import type { TierConfiguration, TierDistribution } from './model';
import { tierBackground, tierForeground, tierRangeError } from './model';
export function tierExportDimensions(width: number, height: number, quality = 1) {
  const scale = Math.min(quality, 8192 / width, 8192 / height, Math.sqrt(16000000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}
export type TierExportRequest = { root: HTMLElement; title: string; configuration: TierConfiguration; distribution: TierDistribution; header: boolean; signal: AbortSignal; onProgress: (value: number) => void };
function aborted(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Экспорт отменён', 'AbortError'); }
async function imagesReady(root: HTMLElement, signal: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const pending = Promise.all([document.fonts.ready, Promise.all(Array.from(root.querySelectorAll('img')).map(async image => { try { await image.decode(); } catch { image.style.visibility = 'hidden'; } }))]);
  try {
    await Promise.race([pending, new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('Экспорт отменён', 'AbortError'));
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => reject(new Error('Обложки или шрифты не загрузились. Повторите экспорт.')), 30000);
    })]);
  } finally { clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); }
}
export async function exportTierListPng(request: TierExportRequest): Promise<Blob> {
  const invalid = tierRangeError(request.configuration, request.distribution); if (invalid) throw new Error(invalid);
  const { toSvg } = await import('html-to-image');
  await imagesReady(request.root, request.signal); aborted(request.signal);
  const logo = request.root.querySelector<HTMLImageElement>('[data-export-logo]');
  if (!logo?.naturalWidth) throw new Error('Не удалось загрузить логотип. Повторите экспорт.');
  const levels = request.configuration.levels.filter(l => request.distribution[l.id]?.length);
  const cardWidth = 240, gap = 16, labelWidth = 144, perRow = 8;
  const columns = Math.min(perRow, Math.max(...levels.map(level => request.distribution[level.id].length)));
  const width = labelWidth + gap + columns * (cardWidth + gap);
  const stackedHeader = request.header && width < 800;
  const headerHeight = stackedHeader ? 176 : 104;
  // Reserve the tallest title across the entire image, keeping every tile equal
  // without truncating long names or stretching posters.
  const titles = Array.from(request.root.querySelectorAll<HTMLElement>('[data-export-title]'));
  for (const title of titles) title.style.height = 'auto';
  const titleHeight = Math.max(0, ...titles.map(title => title.offsetHeight));
  for (const title of titles) title.style.height = `${titleHeight}px`;
  const rows = levels.map(level => { const nodes = request.distribution[level.id].map(id => request.root.querySelector<HTMLElement>(`[data-export-id="${id}"]`)); if (nodes.some(n => !n)) throw new Error('Некоторые записи недоступны для экспорта.'); const height = Math.max(...nodes.map(n => n!.offsetHeight)); return { level, nodes: nodes as HTMLElement[], cardHeight: height, height: Math.ceil(nodes.length / perRow) * (height + gap) + gap }; });
  const height = rows.reduce((total, row) => total + row.height, headerHeight);
  for (let retry = 0; retry < 3; retry++) {
    aborted(request.signal); const size = tierExportDimensions(width, height, 1 / 2 ** retry);
    const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Браузер не поддерживает экспорт изображения.');
    try {
      ctx.scale(size.scale, size.scale); ctx.fillStyle = tierBackground(request.configuration); ctx.fillRect(0, 0, width, height);
      if (request.header) { ctx.fillStyle = tierForeground(request.configuration); ctx.font = 'bold 40px sans-serif'; ctx.fillText(request.title || 'Тир-лист', 24, stackedHeader ? 144 : 64, width - (stackedHeader ? 48 : 360)); }
      ctx.fillStyle = tierForeground(request.configuration); ctx.font = 'bold 28px monospace';
      const brand = 'gikoteka.top', logoHeight = 60, logoWidth = logoHeight * logo.naturalWidth / logo.naturalHeight;
      const brandWidth = ctx.measureText(brand).width;
      ctx.drawImage(logo, width - 24 - brandWidth - 12 - logoWidth, 22, logoWidth, logoHeight);
      ctx.fillText(brand, width - 24 - brandWidth, 62);
      let top = headerHeight, done = 0; const total = rows.reduce((sum, row) => sum + row.nodes.length, 0);
      for (const row of rows) {
        ctx.fillStyle = row.level.color; ctx.fillRect(0, top, labelWidth, row.height); ctx.fillStyle = '#1c1917'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(row.level.name, labelWidth / 2, top + row.height / 2, labelWidth - 40); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        for (let start = 0; start < row.nodes.length; start += 4) {
          aborted(request.signal);
          // html-to-image's toCanvas waits for requestAnimationFrame, which pauses when
          // the PNG tab takes focus. Decode SVG directly so background export can finish.
          const batch = await Promise.all(row.nodes.slice(start, start + 4).map(async node => {
            const svg = await toSvg(node, { cacheBust: false, backgroundColor: tierBackground(request.configuration) });
            aborted(request.signal);
            const image = new Image();
            image.src = svg;
            await image.decode();
            aborted(request.signal);
            return image;
          }));
          for (let i = 0; i < batch.length; i++) { const index = start + i; const image = batch[i]; ctx.drawImage(image, labelWidth + gap + index % perRow * (cardWidth + gap), top + gap + Math.floor(index / perRow) * (row.cardHeight + gap), cardWidth, row.nodes[index].offsetHeight); image.src = ''; request.onProgress(++done / total); }
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        // Draw separators after the cards so all borders remain visible.
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
        ctx.strokeRect(0.5, top + 0.5, width - 1, row.height - 1);
        ctx.beginPath(); ctx.moveTo(labelWidth + 0.5, top); ctx.lineTo(labelWidth + 0.5, top + row.height); ctx.stroke();
        top += row.height;
      }
      aborted(request.signal);
      const blob = await encodeTierCanvas(canvas, request.signal);
      canvas.width = 0; canvas.height = 0; return blob;
    } catch (error) { canvas.width = 0; canvas.height = 0; if (request.signal.aborted || retry === 2) throw error; }
  }
  throw new Error('Не удалось создать PNG.');
}
