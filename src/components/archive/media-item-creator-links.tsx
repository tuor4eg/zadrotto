import Link from "next/link";
import { Fragment } from "react";
import { Feather } from "lucide-react";

export type WriterCreatorLink = { id: number; name: string; slug: string };

export function MediaItemWriterLinks({ creators }: { creators: readonly WriterCreatorLink[] }) {
  if (!creators.length) return null;
  return <span title="Писатели"><Feather aria-hidden="true" className="mr-1 inline-block size-3.5 align-text-bottom text-stone-500" /><span className="sr-only">Писатели: </span><MediaItemCreatorLinks creators={creators} /></span>;
}

export function MediaItemCreatorLinks({ creators }: { creators: readonly WriterCreatorLink[] }) {
  return creators.map((creator, index) => <Fragment key={creator.id}>
    {index ? ", " : null}
    <Link className="break-words underline underline-offset-4 hover:text-stone-950" href={`/archive?creator=${encodeURIComponent(creator.slug)}`}>{creator.name}</Link>
  </Fragment>);
}
