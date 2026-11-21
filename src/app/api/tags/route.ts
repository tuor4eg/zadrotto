import { NextResponse } from "next/server";
import { searchTags } from "@/db/queries/tags";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ items: await searchTags(query) }, { headers: { "Cache-Control": "no-store" } });
}
