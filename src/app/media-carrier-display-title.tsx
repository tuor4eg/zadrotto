import Image from "next/image";

import type { MediaCarrierFrame } from "@/lib/media/carrier-frame";
import { formatMediaCarrierTitle } from "@/lib/media/carrier-frame";

type MediaCarrierDisplayTitleProps = {
  frame?: MediaCarrierFrame | null;
  title: string;
};

export function MediaCarrierDisplayTitle({ frame, title }: MediaCarrierDisplayTitleProps) {
  const formattedTitle = formatMediaCarrierTitle(title, frame);

  if (frame?.titleIconPath) {
    return (
      <span className="inline-flex max-w-full items-start gap-x-[0.2em] align-baseline">
        <Image
          src={frame.titleIconPath}
          alt=""
          aria-hidden="true"
          width={frame.titleIconWidth ?? 16}
          height={frame.titleIconHeight ?? 16}
          className="mt-[0.22em] h-[1em] w-auto shrink-0"
        />
        <span className="min-w-0">
          {formattedTitle}
          {frame.titleCursor ? (
            <span className="media-carrier-title-cursor" aria-hidden="true">
              {frame.titleCursor}
            </span>
          ) : null}
        </span>
      </span>
    );
  }

  return (
    <>
      {formattedTitle}
      {frame?.titleCursor ? (
        <span className="media-carrier-title-cursor" aria-hidden="true">
          {frame.titleCursor}
        </span>
      ) : null}
    </>
  );
}
