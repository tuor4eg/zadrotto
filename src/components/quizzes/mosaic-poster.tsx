export function MosaicPoster({ imageUrl }: { imageUrl: string }) {
  return <div className="mx-auto aspect-[2/3] w-full max-w-[320px] overflow-hidden rounded-md border border-stone-400 bg-stone-200">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={imageUrl} alt="Исходный постер" className="h-full w-full object-contain" />
  </div>;
}
