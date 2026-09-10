"use client";

import { ErrorFallback } from "./error-fallback";
import { useReportPageUnavailable } from "@/components/external-interface/page-availability";

export default function AppError({
  error,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useReportPageUnavailable();
  return <ErrorFallback error={error} scope="Архив" />;
}
