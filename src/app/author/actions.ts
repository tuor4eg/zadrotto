"use server";

import { redirect } from "next/navigation";

import { clearAuthorSessionCookie } from "@/lib/auth/author-auth";

export async function logoutAuthor() {
  await clearAuthorSessionCookie();

  redirect("/author/login");
}
