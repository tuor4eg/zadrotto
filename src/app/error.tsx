"use client";

import { ErrorFallback } from "./error-fallback";

export default function AppError({
  error,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorFallback error={error} scope="Архив" />;
}
