"use client";

import { useEffect } from "react";

import { getRuntimeErrorMessage, getRuntimeErrorTitle } from "@/lib/app-error-messages";

type ErrorFallbackProps = {
  error: Error & { digest?: string };
  scope: string;
};

export function ErrorFallback({ error, scope }: ErrorFallbackProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col justify-center">
        <div className="border border-zinc-300 bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
            {scope}
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-zinc-950">
            {getRuntimeErrorTitle()}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {getRuntimeErrorMessage()}
          </p>
        </div>
      </section>
    </main>
  );
}
