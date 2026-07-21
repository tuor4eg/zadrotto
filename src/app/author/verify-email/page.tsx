"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { verifyAuthorEmailAction } from "./actions";

export default function VerifyAuthorEmailPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const url = new URL(window.location.href);
    const token = new URLSearchParams(url.hash.slice(1)).get("token")
      ?? url.searchParams.get("token")
      ?? "";
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);

    if (!token || !formRef.current || !tokenRef.current) {
      router.replace("/author/login?verificationError=1");
      return;
    }

    tokenRef.current.value = token;
    formRef.current.requestSubmit();
  }, [router]);

  return (
    <main className="archive-page min-h-screen px-4 py-12">
      <form
        ref={formRef}
        action={verifyAuthorEmailAction}
        className="archive-paper mx-auto grid max-w-md gap-4 rounded-md border p-6"
      >
        <h1 className="font-serif text-3xl">Подтверждение email</h1>
        <p className="text-sm text-stone-600">Подтверждаем адрес…</p>
        <input ref={tokenRef} type="hidden" name="token" />
        <noscript>
          Для подтверждения email необходимо включить JavaScript и снова открыть ссылку из письма.
        </noscript>
      </form>
    </main>
  );
}
