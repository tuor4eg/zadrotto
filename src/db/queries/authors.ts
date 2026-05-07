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

export async function createAuthor(input: {
  code: string;
  name: string;
}) {
  const [author] = await db
    .insert(authors)
    .values({
      name: input.name,
      code: input.code,
    })
    .returning({
      id: authors.id,
      code: authors.code,
    });

  return author;
}

export async function updateAuthor(input: {
  id: number;
  name: string;
}) {
  const [author] = await db
    .update(authors)
    .set({
      name: input.name,
      updatedAt: new Date(),
    })
    .where(eq(authors.id, input.id))
    .returning({
      id: authors.id,
      code: authors.code,
    });

  return author ?? null;
}
