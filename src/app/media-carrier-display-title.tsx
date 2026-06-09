import type { MediaCarrierFrame } from "@/lib/media/carrier-frame";
import { formatMediaCarrierTitle } from "@/lib/media/carrier-frame";

type MediaCarrierDisplayTitleProps = {
  frame?: MediaCarrierFrame | null;
  title: string;
};

export function MediaCarrierDisplayTitle({ frame, title }: MediaCarrierDisplayTitleProps) {
  return (
    <>
      {formatMediaCarrierTitle(title, frame)}
      {frame?.titleCursor ? (
        <span className="media-carrier-title-cursor" aria-hidden="true">
          {frame.titleCursor}
        </span>
      ) : null}
    </>
  );
}
