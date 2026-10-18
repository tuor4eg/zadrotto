import { Fragment } from "react";
import Link from "next/link";
import type { MediaItemPlatform } from "@/lib/media/platforms";

export function MediaItemPlatformLinks({ platforms }: { platforms: readonly MediaItemPlatform[] }) {
  return <>{platforms.map((platform, index) => <Fragment key={platform.id}>
    {index > 0 ? ", " : null}
    <Link href={`/archive?platform=${encodeURIComponent(platform.slug)}`} className="underline decoration-current/40 underline-offset-4 hover:decoration-current">{platform.name}</Link>
  </Fragment>)}</>;
}
