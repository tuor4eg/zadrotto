import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaItemMetadata, mediaItems } from "@/db/schema";
import { tmdbCreatorRoleJsonSql, type FilmCompanyDisplay } from "./tmdb-company-display";

export type SeriesCreatorDisplay = {
  productionCompanies?: FilmCompanyDisplay[];
  networks?: FilmCompanyDisplay[];
  creators: FilmCompanyDisplay[];
  showrunners: FilmCompanyDisplay[];
};

/** One bounded read for all roles; pending requests remain plain-text names. */
export async function getSeriesCreatorDisplay(mediaItemId: number): Promise<SeriesCreatorDisplay | undefined> {
  const [row] = await db.select({
    productionCompanies: tmdbCreatorRoleJsonSql("production_company", mediaItems.id, "series"),
    networks: tmdbCreatorRoleJsonSql("network", mediaItems.id, "series"),
    creators: tmdbCreatorRoleJsonSql("creator", mediaItems.id, "series"),
    showrunners: tmdbCreatorRoleJsonSql("showrunner", mediaItems.id, "series"),
    facts: mediaItemMetadata.facts,
  }).from(mediaItems).leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .where(eq(mediaItems.id, mediaItemId));
  if (!row) return undefined;
  return {
    productionCompanies: Object.hasOwn(row.facts ?? {}, "productionCompanies") ? undefined : row.productionCompanies,
    networks: Object.hasOwn(row.facts ?? {}, "networks") ? undefined : row.networks,
    creators: row.creators,
    showrunners: row.showrunners,
  };
}
