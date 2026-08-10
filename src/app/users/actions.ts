"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
} from "@/db/queries/friends";
import { requireAuthor } from "@/lib/auth/author-auth";

function readTargetId(formData: FormData) {
  const targetId = Number(formData.get("targetId"));
  return Number.isSafeInteger(targetId) && targetId > 0 ? targetId : null;
}

function safeReturnPath(formData: FormData, targetId: number) {
  const value = formData.get("returnTo");
  if (typeof value === "string" && (value.startsWith("/author/friends") || value === `/users/${targetId}`)) {
    return value;
  }
  return `/users/${targetId}`;
}

function finish(returnTo: string, result: "ok" | "error" | "conflict") {
  const url = new URL(returnTo, "http://local");
  url.searchParams.set("friendship", result);
  redirect(`${url.pathname}${url.search}`);
}

function revalidate(authorId: number, targetId: number) {
  revalidatePath("/author/friends");
  revalidatePath(`/users/${authorId}`);
  revalidatePath(`/users/${targetId}`);
}

export async function sendFriendRequestAction(formData: FormData) {
  const author = await requireAuthor();
  const targetId = readTargetId(formData);
  if (!targetId) redirect("/author/friends?tab=search&friendship=error");
  const returnTo = safeReturnPath(formData, targetId);
  const result = await sendFriendRequest(author.id, targetId);
  if (result === "ok") revalidate(author.id, targetId);
  finish(returnTo, result === "ok" ? "ok" : result === "conflict" ? "conflict" : "error");
}

export async function cancelFriendRequestAction(formData: FormData) {
  const author = await requireAuthor();
  const targetId = readTargetId(formData);
  if (!targetId) redirect("/author/friends?friendship=error");
  const returnTo = safeReturnPath(formData, targetId);
  const ok = await cancelFriendRequest(author.id, targetId);
  if (ok) revalidate(author.id, targetId);
  finish(returnTo, ok ? "ok" : "error");
}

export async function acceptFriendRequestAction(formData: FormData) {
  const author = await requireAuthor();
  const targetId = readTargetId(formData);
  if (!targetId) redirect("/author/friends?friendship=error");
  const returnTo = safeReturnPath(formData, targetId);
  const ok = await acceptFriendRequest(author.id, targetId);
  if (ok) revalidate(author.id, targetId);
  finish(returnTo, ok ? "ok" : "error");
}

export async function declineFriendRequestAction(formData: FormData) {
  const author = await requireAuthor();
  const targetId = readTargetId(formData);
  if (!targetId) redirect("/author/friends?friendship=error");
  const returnTo = safeReturnPath(formData, targetId);
  const ok = await declineFriendRequest(author.id, targetId);
  if (ok) revalidate(author.id, targetId);
  finish(returnTo, ok ? "ok" : "error");
}

export async function removeFriendAction(formData: FormData) {
  const author = await requireAuthor();
  const targetId = readTargetId(formData);
  if (!targetId) redirect("/author/friends?friendship=error");
  const returnTo = safeReturnPath(formData, targetId);
  const ok = await removeFriend(author.id, targetId);
  if (ok) revalidate(author.id, targetId);
  finish(returnTo, ok ? "ok" : "error");
}
