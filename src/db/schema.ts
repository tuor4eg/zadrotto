import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", [
  "game",
  "film",
  "series",
  "book",
  "comic",
  "anime",
  "other",
]);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const franchises = pgTable("franchises", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  ...timestamps(),
});

export const authors = pgTable("authors", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps(),
});

export const mediaItems = pgTable("media_items", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  mediaType: mediaTypeEnum("media_type").notNull(),
  franchiseId: integer("franchise_id")
    .notNull()
    .references(() => franchises.id),
  releaseYear: integer("release_year"),
  coverUrl: text("cover_url"),
  ...timestamps(),
});

export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    score: integer("score").notNull(),
    ...timestamps(),
  },
  (table) => [unique("ratings_media_item_id_author_id_unique").on(table.mediaItemId, table.authorId)],
);

export type Franchise = typeof franchises.$inferSelect;
export type NewFranchise = typeof franchises.$inferInsert;
export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
