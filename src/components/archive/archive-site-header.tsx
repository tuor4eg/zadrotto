"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { Shield, UserCircle } from "lucide-react";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";

type ArchiveSiteHeaderProps = {
  brandHref: string;
  compact?: boolean;
  controls?: ReactNode;
  currentAdminUser: boolean;
  currentAuthor: boolean;
  sticky?: boolean;
  variant: "main" | "catalog";
};

export function ArchiveSiteHeader({
  brandHref,
  compact = false,
  controls,
  currentAdminUser,
  currentAuthor,
  sticky = false,
  variant,
}: ArchiveSiteHeaderProps) {
  const router = useRouter();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const isCatalog = variant === "catalog";
  const ActionsContainer = isCatalog ? "div" : "nav";
  const authorLinkLabel = currentAuthor ? "Профиль" : "Войти";
  const actionClassName = `archive-control-surface inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
    isCatalog
      ? compact
        ? "w-9 px-0"
        : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
      : "gap-2 px-3"
  }`;

  const adminLink = currentAdminUser ? (
    <Link href="/admin" aria-label="Админка" className={actionClassName}>
      <Shield className="size-4" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : undefined}>
        Админка
      </span>
    </Link>
  ) : null;
  const authorAction = currentAuthor ? (
    <Link href="/author" aria-label={authorLinkLabel} className={actionClassName}>
      <UserCircle className="size-5" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : undefined}>
        {authorLinkLabel}
      </span>
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => setIsLoginOpen(true)}
      aria-label={authorLinkLabel}
      className={actionClassName}
    >
      <UserCircle className="size-5" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : undefined}>
        {authorLinkLabel}
      </span>
    </button>
  );

  return (
    <>
      <header
        className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${sticky ? "archive-sticky-header" : ""} ${
          isCatalog
            ? `archive-textured-block items-center lg:transition-[max-width,padding,width] lg:duration-200 ${
                compact
                  ? "mx-auto w-full max-w-none flex-wrap justify-center px-2 py-2 lg:ml-auto lg:mr-0 lg:max-w-[320px] lg:flex-nowrap lg:justify-center lg:px-2 lg:py-3"
                  : "mx-auto w-full max-w-none flex-wrap justify-center px-2 py-2 lg:ml-auto lg:justify-between lg:px-7 lg:py-5"
              }`
            : "archive-paper archive-panel px-5 py-5 lg:px-7"
        }`}
      >
        <Link
          href={brandHref}
          className={
            isCatalog
              ? `min-w-0 items-center gap-4 lg:transition-[max-width,opacity,transform] lg:duration-200 ${
                  compact
                    ? "hidden"
                    : "hidden lg:flex lg:max-w-[720px] lg:translate-x-0 lg:opacity-100"
                }`
              : "flex min-w-0 items-center gap-4"
          }
          aria-hidden={isCatalog && compact ? true : undefined}
        >
          <Image
            src="/site-logo.png"
            alt=""
            width={56}
            height={56}
            className="size-12 shrink-0 object-contain sm:size-14"
            priority
          />
          <div className="min-w-0 sm:translate-y-1.5">
            <h1 className="truncate font-serif text-2xl leading-tight text-stone-950 sm:text-4xl">
              Журнал, которого не было
            </h1>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-stone-600 sm:text-[10px]">
              База хранит факты. Журнал достает из них память.
            </p>
          </div>
        </Link>

        <ActionsContainer
          aria-label={isCatalog ? undefined : "Основная навигация"}
          className={
            isCatalog
              ? `grid w-full min-w-0 items-center gap-2 text-sm ${
                  currentAdminUser
                    ? "grid-cols-[minmax(0,1fr)_2.25rem_2.25rem]"
                    : "grid-cols-[minmax(0,1fr)_2.25rem]"
                } ${
                  compact
                    ? "lg:flex lg:flex-nowrap lg:justify-center"
                    : "lg:flex lg:w-auto lg:shrink-0 lg:flex-wrap lg:items-center lg:justify-end"
                }`
              : "flex shrink-0 gap-2"
          }
        >
          {controls}
          {isCatalog && adminLink && compact ? (
            <ArchiveTooltip className="min-w-0" label="Админка" side="bottom">
              {adminLink}
            </ArchiveTooltip>
          ) : (
            adminLink
          )}
          {isCatalog && compact ? (
            <ArchiveTooltip className="min-w-0" label={authorLinkLabel} side="bottom">
              {authorAction}
            </ArchiveTooltip>
          ) : (
            authorAction
          )}
        </ActionsContainer>
      </header>

      {isLoginOpen
        ? createPortal(
            <AuthorLoginModal
              onClose={() => setIsLoginOpen(false)}
              onSuccess={() => {
                setIsLoginOpen(false);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
