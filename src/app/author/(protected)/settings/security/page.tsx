import { redirectToAuthorProfile } from "@/app/author/profile-redirect";

export default async function LegacyAuthorSecurityPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return redirectToAuthorProfile(searchParams);
}
