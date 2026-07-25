import type { CoverCandidate, MediaProvider } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type FantLabRecord = Record<string, unknown>;

const FANTLAB_API_ORIGIN = "https://api.fantlab.ru";
const FANTLAB_SITE_ORIGIN = "https://fantlab.ru";

function asRecord(value: unknown): FantLabRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as FantLabRecord)
    : null;
}

function asString(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asPositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(asString(value));

  return Number.isInteger(number) && number > 0 ? number : null;
}

function asYear(value: unknown) {
  const year = asPositiveInteger(value);

  return year && year >= 1000 && year <= 9999 ? year : null;
}

function getFantLabExternalWorkId(value: unknown) {
  const directId = asPositiveInteger(value);

  if (directId) {
    return directId;
  }

  const stringValue = asString(value);
  const matchedId = stringValue?.match(
    /(?:^work:?|fantlab\.ru\/work)(\d+)(?:[/?#]|$)/i,
  )?.[1];

  return asPositiveInteger(matchedId);
}

function asUrl(value: unknown, origin: string) {
  const stringValue = asString(value);

  if (!stringValue) {
    return null;
  }

  try {
    if (stringValue.startsWith("//")) {
      return new URL(`https:${stringValue}`).toString();
    }

    return new URL(stringValue, origin).toString();
  } catch {
    return null;
  }
}

function getFantLabWorkId(item: FantLabRecord) {
  return asPositiveInteger(item.id) ?? asPositiveInteger(item.work_id) ?? asPositiveInteger(item.doc);
}

function getFantLabWorkUrl(workId: number) {
  return `${FANTLAB_SITE_ORIGIN}/work${workId}`;
}

function getFantLabImageUrl(item: FantLabRecord) {
  return asUrl(item.image, FANTLAB_SITE_ORIGIN);
}

function getFantLabAuthors(item: FantLabRecord) {
  const creators = asRecord(item.creators);
  const creatorAuthors = Array.isArray(creators?.authors) ? creators.authors : [];
  const directAuthors = Array.isArray(item.authors) ? item.authors : [];

  return [
    ...new Set(
      [...creatorAuthors, ...directAuthors]
        .map((author) => asString(asRecord(author)?.name))
        .filter((author): author is string => Boolean(author)),
    ),
  ];
}

function getFantLabWorks(response: unknown) {
  if (Array.isArray(response)) {
    return response.map(asRecord).filter((item): item is FantLabRecord => Boolean(item));
  }

  const works = asRecord(response)?.works;

  return Array.isArray(works)
    ? works.map(asRecord).filter((item): item is FantLabRecord => Boolean(item))
    : [];
}

function getFantLabEditions(response: unknown) {
  const editions = asRecord(response)?.editions;

  return Array.isArray(editions)
    ? editions.map(asRecord).filter((item): item is FantLabRecord => Boolean(item))
    : [];
}

function getFantLabEditionIds(response: unknown) {
  const editionsBlocks = asRecord(asRecord(response)?.editions_blocks);

  if (!editionsBlocks) {
    return [];
  }

  const editionIds: number[] = [];

  for (const block of Object.values(editionsBlocks)) {
    const editions = asRecord(block)?.list;

    if (!Array.isArray(editions)) {
      continue;
    }

    for (const edition of editions) {
      const editionRecord = asRecord(edition);
      const editionId = asPositiveInteger(editionRecord?.edition_id);
      const imageCount = asPositiveInteger(editionRecord?.pic_num);

      if (editionId && imageCount) {
        editionIds.push(editionId);
      }
    }
  }

  return [...new Set(editionIds)];
}

function getFantLabTitle(item: FantLabRecord, fallback: string) {
  return asString(item.name) ?? asString(item.work_name) ?? asString(item.title) ?? fallback;
}

function getFantLabOriginalTitle(item: FantLabRecord, title: string) {
  const originalTitle = asString(item.name_orig) ?? asString(item.work_name_orig);

  return originalTitle && originalTitle !== title ? originalTitle : null;
}

async function searchFantLabWorks(query: string) {
  return getFantLabWorks(
    await fetchJson<unknown>(
      buildUrl(`${FANTLAB_API_ORIGIN}/search-txt`, { q: query }),
    ),
  );
}

async function getFantLabWork(externalId: string) {
  const workId = getFantLabExternalWorkId(externalId);

  if (!workId) {
    return null;
  }

  const works = getFantLabWorks(
    await fetchJson<unknown>(
      buildUrl(`${FANTLAB_API_ORIGIN}/search-ids`, { w: workId }),
    ),
  );

  return works.find((work) => getFantLabWorkId(work) === workId) ?? null;
}

async function getFantLabEditionCovers(workId: number, candidateLimit: number) {
  const work = await fetchJson<unknown>(
    new URL(`${FANTLAB_API_ORIGIN}/work/${workId}/extended`),
  );
  const editionIds = getFantLabEditionIds(work).slice(0, Math.max(candidateLimit * 4, 20));

  if (!editionIds.length) {
    return [];
  }

  const response = await fetchJson<unknown>(
    buildUrl(`${FANTLAB_API_ORIGIN}/search-ids`, {
      e: editionIds.join(","),
    }),
  );

  return getFantLabEditions(response)
    .map((edition) => {
      const editionId = asPositiveInteger(edition.id) ?? asPositiveInteger(edition.edition_id);
      const imageUrl = getFantLabImageUrl(edition);

      if (!editionId || !imageUrl) {
        return null;
      }

      return {
        id: `edition:${editionId}`,
        provider: "fantlab" as const,
        title: getFantLabTitle(edition, `Издание ${editionId}`),
        imageUrl,
        sourcePageUrl: `${FANTLAB_SITE_ORIGIN}/edition${editionId}`,
        year: asYear(edition.year) ?? undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .slice(0, candidateLimit);
}

function toCoverCandidate(
  item: FantLabRecord,
  fallbackTitle: string,
): CoverCandidate | null {
  const workId = getFantLabWorkId(item);
  const imageUrl = getFantLabImageUrl(item);

  if (!workId || !imageUrl) {
    return null;
  }

  return {
    id: `work:${workId}`,
    provider: "fantlab",
    title: getFantLabTitle(item, fallbackTitle),
    imageUrl,
    sourcePageUrl: getFantLabWorkUrl(workId),
    year: asYear(item.year) ?? asYear(item.work_year) ?? undefined,
  };
}

export const fantLabProvider: MediaProvider = {
  code: "fantlab",
  mediaTypes: ["book"],
  async searchTitleCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    return (await searchFantLabWorks(query))
      .map((item) => {
        const workId = getFantLabWorkId(item);

        if (!workId) {
          return null;
        }

        const title = getFantLabTitle(item, query);
        const authors = getFantLabAuthors(item);

        return {
          id: `work:${workId}`,
          provider: "fantlab" as const,
          externalId: String(workId),
          mediaType: input.mediaType,
          title,
          originalTitle: getFantLabOriginalTitle(item, title),
          description: asString(item.description) ?? (authors.length ? authors.join(", ") : null),
          coverUrl: getFantLabImageUrl(item),
          sourcePageUrl: getFantLabWorkUrl(workId),
          releaseYear: asYear(item.year),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, options.candidateLimit);
  },
  async getTitleMetadata(input) {
    const work = await getFantLabWork(input.externalId);
    const workId = work ? getFantLabWorkId(work) : null;

    if (!work || !workId) {
      return null;
    }

    return {
      provider: "fantlab",
      externalId: String(workId),
      sourceUrl: getFantLabWorkUrl(workId),
      facts: {
        authors: getFantLabAuthors(work),
      },
    };
  },
  async getCoverCandidatesByTitleSource(input, options) {
    const work = input.titleSource?.externalId
      ? await getFantLabWork(input.titleSource.externalId)
      : null;
    const candidate = work ? toCoverCandidate(work, input.title) : null;

    if (candidate) {
      return [candidate];
    }

    const workId = work ? getFantLabWorkId(work) : null;

    return workId ? getFantLabEditionCovers(workId, options.candidateLimit) : [];
  },
  async searchCoverCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    return (await searchFantLabWorks(query))
      .map((item) => toCoverCandidate(item, query))
      .filter((item): item is CoverCandidate => Boolean(item))
      .slice(0, options.candidateLimit);
  },
};
