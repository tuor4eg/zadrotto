import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { authors } from "@/db/schema";

export async function getAuthors() {
  return db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      createdAt: authors.createdAt,
    })
    .from(authors)
    .orderBy(asc(authors.name), asc(authors.code));
}

export async function getAuthorById(id: number) {
  const [author] = await db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
    })
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  return author ?? null;
}

export async function createAuthor(name: string, code: string) {
  await db.insert(authors).values({
    name,
    code,
  });
}
