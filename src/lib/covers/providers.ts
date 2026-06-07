import type { CoverProvider } from "@/lib/covers/types";
import { googleBooksProvider } from "@/lib/covers/providers/google-books";
import { igdbProvider } from "@/lib/covers/providers/igdb";
import { jikanProvider } from "@/lib/covers/providers/jikan";
import { openLibraryProvider } from "@/lib/covers/providers/open-library";
import { rawgProvider } from "@/lib/covers/providers/rawg";
import { createTmdbProvider } from "@/lib/covers/providers/tmdb";

export const COVER_PROVIDERS = [
  createTmdbProvider("film"),
  createTmdbProvider("series"),
  openLibraryProvider,
  googleBooksProvider,
  igdbProvider,
  rawgProvider,
  jikanProvider,
] as const satisfies readonly CoverProvider[];
