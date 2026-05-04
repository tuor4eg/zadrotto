import { connection } from "next/server";

import { getCatalogMediaItems } from "@/db/queries/media-items";
import { MediaItemsCatalog } from "./media-items-catalog";

export default async function Home() {
  await connection();

  const items = await getCatalogMediaItems();

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2 border-b border-zinc-300 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
            Archive
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold text-zinc-950 sm:text-4xl">
            Журнал, которого не было
          </h1>
        </header>

        <MediaItemsCatalog items={items} />
      </div>
    </main>
  );
}
