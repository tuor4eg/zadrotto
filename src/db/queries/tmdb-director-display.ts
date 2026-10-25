import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { filmCreatorRoleJsonSql, type FilmCompanyDisplay } from "@/db/queries/tmdb-company-display";

export type FilmDirectorDisplay = FilmCompanyDisplay;

export async function getFilmDirectorDisplay(mediaItemId: number): Promise<FilmDirectorDisplay[]> {
  const [row] = await db.select({ directors: filmCreatorRoleJsonSql("director", sql`${mediaItems}."id"`) })
    .from(mediaItems).where(eq(mediaItems.id, mediaItemId));
  return row?.directors ?? [];
}
