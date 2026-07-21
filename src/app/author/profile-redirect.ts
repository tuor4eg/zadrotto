import { redirect } from "next/navigation";

export async function redirectToAuthorProfile(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const source = await searchParams;
  const target = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") target.set(key, value);
  }
  return redirect(`/author/profile${target.size ? `?${target.toString()}` : ""}`);
}
