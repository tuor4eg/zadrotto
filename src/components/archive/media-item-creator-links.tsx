"use client";

import Link from "next/link";
import { Fragment, useId, useState } from "react";
import { Feather } from "lucide-react";

export type WriterCreatorLink = { id: number; name: string; slug: string };

export function MediaItemWriterLinks({ creators }: { creators: readonly WriterCreatorLink[] }) {
  if (!creators.length) return null;
  return <span title="Писатели"><Feather aria-hidden="true" className="mr-1 inline-block size-3.5 align-text-bottom text-stone-500" /><span className="sr-only">Писатели: </span><MediaItemCreatorLinks creators={creators} /></span>;
}

type CreatorNameLink = { id?: number | null; name: string; slug?: string | null };

export function MediaItemCreatorLinks({ creators, mediaType }: { creators: readonly CreatorNameLink[]; mediaType?: string }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!creators.length) return null;
  const collapsible = creators.length - 10 > 5;
  const visible = collapsible && !expanded ? creators.slice(0, 10) : creators;
  return <>
    <span id={listId}>{visible.map((creator, index) => <Fragment key={creator.id ?? index}>
      {index ? ", " : null}
      {creator.slug ? <Link className="break-words underline underline-offset-4 hover:text-stone-950" href={`/archive?creator=${encodeURIComponent(creator.slug)}${mediaType ? `&type=${encodeURIComponent(mediaType)}` : ""}`}>{creator.name}</Link> : creator.name}
    </Fragment>)}</span>
    {collapsible ? <> <button type="button" aria-expanded={expanded} aria-controls={listId}
      className="cursor-pointer whitespace-nowrap font-bold underline underline-offset-4 hover:text-stone-950"
      onClick={() => setExpanded(value => !value)}>{expanded ? "свернуть" : `показать все ${creators.length}`}</button></> : null}
  </>;
}
