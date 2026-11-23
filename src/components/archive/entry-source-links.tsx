import Link from "next/link";

import { CreatorRoleIcon } from "@/components/archive/creator-role-icon";
import { EntrySourceCycle } from "@/components/archive/entry-source-cycle";
import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";
import { RateableMediaItemStatusTile, TileRatingScope } from "@/components/archive/tile-rating-scope";
import { Avatar } from "@/components/ui/avatar";
import type { getSourceMediaCards } from "@/db/queries/media-items";
import { resolveCreatorAvatarUrl } from "@/lib/creators/avatar-url";
import { MEDIA_IDENTITY_FONT_CLASS_NAME } from "@/lib/media/carrier-frame";
import { entrySourceKey, type EntrySourceOption } from "@/lib/media/entry-sources";
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types";

type DisplayLink = { key: string | number; href: string; label: string };

function EntrySourceLinks({ heading, links }: { heading: string; links: DisplayLink[] }) {
  if (!links.length) return null;
  return (
    <section className="archive-paper archive-panel px-4 py-3" aria-label={heading}>
      <h2 className="mb-2 text-base font-semibold">{heading}</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {links.map(({ key, href, label }) => (
          <li key={key}>
            <Link className="underline underline-offset-4 hover:text-stone-900" href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type SourceCard = Awaited<ReturnType<typeof getSourceMediaCards>>[number];
type CardGroup = { cards: [SourceCard, ...SourceCard[]]; authors: SourceCard["people"] };
type SourceRow = { group: CardGroup } | { source: EntrySourceOption };

function groupSources(sources: EntrySourceOption[], cards: SourceCard[]): SourceRow[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const groups = new Map<string, CardGroup>();
  const rows: SourceRow[] = [];

  const sourceOrder = { creator: 0, entry: 1, series: 2 };
  const releaseYear = (id: number) => cardsById.get(id)?.releaseYear ?? Number.MAX_SAFE_INTEGER;
  const sortedSources = [...sources].sort((left, right) =>
    sourceOrder[left.type] - sourceOrder[right.type]
    || (left.type === "entry" ? releaseYear(left.id) - releaseYear(right.id) : 0),
  );

  for (const source of sortedSources) {
    if (source.type !== "entry") {
      rows.push({ source });
      continue;
    }
    const card = cardsById.get(source.id);
    if (!card) continue;

    const writers = card.people.filter((person) => person.roleCode === "writer");
    const authors = writers.length ? writers : card.people;
    const authorIds = [...new Set(authors.map(({ id }) => id))].sort();
    const key = authorIds.length ? JSON.stringify([card.mediaType, authorIds]) : null;
    const existing = key ? groups.get(key) : undefined;
    if (existing) {
      existing.cards.push(card);
    } else {
      const group: CardGroup = { cards: [card], authors };
      rows.push({ group });
      if (key) groups.set(key, group);
    }
  }
  return rows;
}

function SourceCover({ card, isAuthorized }: { card: SourceCard; isAuthorized: boolean }) {
  return (
    <div className="w-32 min-w-0 shrink-0 sm:w-36">
      <RateableMediaItemStatusTile
        item={card}
        href={`/media/${encodeURIComponent(card.code)}`}
        currentAuthorScore={card.currentAuthorScore}
        currentAuthorStatus={card.currentAuthorStatus}
        currentAuthorHasRating={card.hasRating}
        isAuthorized={isAuthorized}
      />
    </div>
  );
}

const creatorCountForms: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "создатель", few: "создателя" };
const creatorCountRules = new Intl.PluralRules("ru");

function SourcePeople({ people }: { people: SourceCard["people"] }) {
  if (!people.length) return null;

  const byId = new Map<number, { id: number; name: string; slug: string; roles: { code: string; name: string }[] }>();
  for (const person of people) {
    const creator = byId.get(person.id);
    const role = { code: person.roleCode, name: person.roleName };
    if (creator) {
      creator.roles.push(role);
    } else {
      byId.set(person.id, { id: person.id, name: person.name, slug: person.slug, roles: [role] });
    }
  }

  const visible = [...byId.values()].slice(0, 3);
  const remaining = byId.size - visible.length;
  const plural = creatorCountRules.select(remaining);

  return (
    <ul className="space-y-1">
      {visible.map(({ id, name, slug, roles }) => (
        <li key={id}>
          <MediaItemCreatorLinks creators={[{ id, name, slug }]} />
          <ul className="leading-5 text-stone-600">
            {roles.map((role) => (
              <li key={role.code} className="grid grid-cols-[0.875rem_minmax(0,1fr)] items-start gap-x-1">
                <CreatorRoleIcon code={role.code} className="mt-0.75 size-3.5" />
                <span>{role.name.toLocaleLowerCase("ru")}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
      {remaining > 0 ? (
        <li className="text-stone-600">
          +{remaining} {creatorCountForms[plural] ?? "создателей"}
        </li>
      ) : null}
    </ul>
  );
}

function SourceCardDescription({ card, mediaTypes }: { card: SourceCard; mediaTypes: MediaTypeOption[] }) {
  return (
    <>
      <div className="text-stone-600">
        {getMediaTypeLabel(card.mediaType, mediaTypes)}{card.releaseYear ? ` · ${card.releaseYear}` : ""}
      </div>
      <SourcePeople people={card.people} />
    </>
  );
}

function SourceCardRow({ card, mediaTypes, isAuthorized }: {
  card: SourceCard;
  mediaTypes: MediaTypeOption[];
  isAuthorized: boolean;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      <SourceCover card={card} isAuthorized={isAuthorized} />
      <div className="min-w-0 max-w-36 space-y-1 break-words py-1 text-sm">
        <SourceCardDescription card={card} mediaTypes={mediaTypes} />
      </div>
    </li>
  );
}

export function EntrySources({ heading = "Первоисточники", sources, cards, mediaTypes, isAuthorized }: {
  heading?: string;
  sources: EntrySourceOption[];
  cards: SourceCard[];
  mediaTypes: MediaTypeOption[];
  isAuthorized: boolean;
}) {
  const rows = groupSources(sources, cards);
  if (!rows.length) return null;

  return (
    <section aria-label={heading} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <h2 className={`text-xs font-semibold uppercase leading-6 text-stone-600 ${MEDIA_IDENTITY_FONT_CLASS_NAME}`}>{heading}</h2>
      <TileRatingScope>
        <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,18.5rem),1fr))] items-start gap-x-3 gap-y-4">
          {rows.map((row) => {
            if ("source" in row) {
              const { source } = row;
              const code = encodeURIComponent(source.code);
              return (
                <li key={entrySourceKey(source)} className="max-w-36 shrink-0 break-words text-sm">
                  {source.type === "creator" ? (
                    <Link className="flex items-center gap-2" href={`/archive?creator=${code}`}>
                      <span aria-hidden="true">
                        <Avatar name={source.label} src={resolveCreatorAvatarUrl(source.avatarObjectKey ?? null)} className="size-10 [&_img]:bg-white" />
                      </span>
                      <span className="min-w-0 underline underline-offset-4">{source.label}</span>
                    </Link>
                  ) : (
                    <Link className="underline underline-offset-4" href={`/archive?series=${code}`}>{source.label}</Link>
                  )}
                </li>
              );
            }

            const { cards: groupedCards, authors } = row.group;
            const [first] = groupedCards;
            if (groupedCards.length === 1) {
              return <SourceCardRow key={first.id} card={first} mediaTypes={mediaTypes} isAuthorized={isAuthorized} />;
            }

            const last = groupedCards.at(-1) ?? first;
            const years = groupedCards.flatMap(({ releaseYear }) => releaseYear === null ? [] : [releaseYear]);
            const firstYear = Math.min(...years);
            const lastYear = Math.max(...years);
            const yearRange = years.length ? (firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`) : null;
            return (
              <EntrySourceCycle
                key={first.id}
                count={groupedCards.length}
                cover={<SourceCover card={first} isAuthorized={isAuthorized} />}
                lastCover={<SourceCover card={last} isAuthorized={isAuthorized} />}
                lastDescription={<SourceCardDescription card={last} mediaTypes={mediaTypes} />}
                description={<>
                  <div className="font-semibold">Цикл произведений</div>
                  <div className="text-stone-600">
                    {getMediaTypeLabel(first.mediaType, mediaTypes)}{yearRange ? ` · ${yearRange}` : ""}
                  </div>
                  <SourcePeople people={authors} />
                </>}
              >
                {groupedCards.slice(0, -1).map((card) => <SourceCardRow key={card.id} card={card} mediaTypes={mediaTypes} isAuthorized={isAuthorized} />)}
              </EntrySourceCycle>
            );
          })}
        </ul>
      </TileRatingScope>
    </section>
  );
}

export function WorksBasedOn({ works }: { works: { id: number; label: string; code: string }[] }) {
  return (
    <EntrySourceLinks heading="Произведения на основе" links={works.map((work) => ({
      key: work.id,
      href: `/media/${encodeURIComponent(work.code)}`,
      label: work.label,
    }))} />
  );
}
