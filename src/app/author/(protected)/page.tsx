import { redirect } from "next/navigation";

export default async function AuthorPage() {
  redirect("/author/profile");
}
