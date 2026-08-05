"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

export function ImageWithFallback({
  fallback,
  src,
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  alt: string;
  fallback: ReactNode;
  src?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();

  if (failedSrc === src || !src) return <>{fallback}</>;

  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} src={src} alt={alt} onError={() => setFailedSrc(src)} />;
}
