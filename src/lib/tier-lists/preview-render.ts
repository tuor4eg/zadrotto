import sharp, { type OverlayOptions } from "sharp";

type PreviewInput = {
  backgroundColor: string;
  rows: { color: string; posters: (Buffer | null)[] }[];
};

const WIDTH = 128;
const HEIGHT = 192;
const PADDING = 6;
const GAP = 3;
const STRIPE_WIDTH = 12;
const POSTER_WIDTH = 22;
const PLACEHOLDER = "#374151";

function colorOrFallback(color: string, fallback: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? color : fallback;
}

async function rectangle(width: number, height: number, background: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}

/** A carrier-free summary: only tier colors and covers, without text or ratings. */
export async function renderTierListPreview(input: PreviewInput): Promise<Buffer> {
  // Sample long lists evenly so the last tier remains visible within six readable rows.
  const rows = input.rows.length <= 6
    ? input.rows
    : Array.from({ length: 6 }, (_, index) => input.rows[Math.round(index * (input.rows.length - 1) / 5)]!);
  const background = colorOrFallback(input.backgroundColor, "#111827");
  const overlays: OverlayOptions[] = [];
  const rowHeight = rows.length ? Math.floor((HEIGHT - PADDING * 2 - GAP * (rows.length - 1)) / rows.length) : 0;

  for (const [index, row] of rows.entries()) {
    const top = PADDING + index * (rowHeight + GAP);
    overlays.push({
      input: await rectangle(STRIPE_WIDTH, rowHeight, colorOrFallback(row.color, PLACEHOLDER)),
      left: PADDING,
      top,
    });
    const posterHeight = Math.min(rowHeight, 33);
    for (const [posterIndex, poster] of row.posters.slice(0, 4).entries()) {
      let cover: Buffer;
      try {
        if (!poster) throw new Error("Missing cover");
        cover = await sharp(poster, { limitInputPixels: 40_000_000, pages: 1 })
          .rotate()
          .resize(POSTER_WIDTH, posterHeight, { fit: "contain", background })
          .png()
          .toBuffer();
      } catch {
        cover = await rectangle(POSTER_WIDTH, posterHeight, PLACEHOLDER);
      }
      overlays.push({ input: cover, left: PADDING + STRIPE_WIDTH + GAP + posterIndex * (POSTER_WIDTH + GAP), top });
    }
  }

  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background } })
    .composite(overlays)
    .webp({ lossless: true })
    .toBuffer();
}
