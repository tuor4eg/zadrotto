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
  const SiteHeaderContainer = isCatalog ? "div" : "header";
  const authorLinkLabel = currentAuthor ? "Профиль" : "Войти";
  const actionClassName = `archive-control-surface inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
    isCatalog
      ? compact
        ? "w-9 px-0"
        : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
      : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
  }`;

  const adminLink = currentAdminUser ? (
    <Link href="/admin" aria-label="Админка" className={actionClassName}>
      <Shield className="size-4" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : "sr-only lg:not-sr-only"}>
        Админка
      </span>
    </Link>
  ) : null;
  const authorAction = currentAuthor ? (
    <Link href="/author" aria-label={authorLinkLabel} className={actionClassName}>
      <UserCircle className="size-5" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : "sr-only lg:not-sr-only"}>
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
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : "sr-only lg:not-sr-only"}>
        {authorLinkLabel}
      </span>
    </button>
  );
  const catalogActions = (
    <div className="archive-catalog-header-actions flex shrink-0 items-center gap-2">
      {adminLink && compact ? (
        <ArchiveTooltip className="min-w-0" label="Админка" side="bottom">
          {adminLink}
        </ArchiveTooltip>
      ) : (
        adminLink
      )}
      {compact ? (
        <ArchiveTooltip className="min-w-0" label={authorLinkLabel} side="bottom">
          {authorAction}
        </ArchiveTooltip>
      ) : (
        authorAction
      )}
    </div>
  );

  return (
    <>
      <SiteHeaderContainer className={isCatalog
        ? `archive-catalog-header archive-textured-block ${sticky ? "archive-sticky-header" : ""} ${
            compact ? "archive-catalog-header-compact" : ""
          }`
        : "archive-main-brand-header archive-paper archive-panel flex items-center justify-between gap-3 px-3 py-3 pr-2 lg:gap-4 lg:px-7 lg:py-5"}
      >
        {isCatalog ? <div className="archive-catalog-brand-row">
          <header className="archive-catalog-brand-landmark min-w-0">
            <Link href={brandHref} className="archive-catalog-brand-link flex min-w-0 items-center gap-3">
              <Image
                src="/site-logo.png"
                alt=""
                width={56}
                height={56}
                className="size-11 shrink-0 object-contain lg:size-14"
                priority
              />
              <div className="min-w-0 lg:translate-y-1.5">
                <h1 className="truncate font-serif text-xl leading-tight text-stone-950 lg:text-4xl">
                  Журнал, которого не было
                </h1>
                <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 lg:block">
                  База хранит факты, журнал достает из них память
                </p>
              </div>
            </Link>
          </header>
          {catalogActions}
        </div> : <Link href={brandHref} className="flex min-w-0 items-center gap-3 lg:gap-4">
          <Image
            src="/site-logo.png"
            alt=""
            width={56}
            height={56}
            className="size-11 shrink-0 object-contain lg:size-14"
            priority
          />
          <div className="min-w-0 lg:translate-y-1.5">
            <h1 className="truncate font-serif text-xl leading-tight text-stone-950 lg:text-4xl">
              Журнал, которого не было
            </h1>
            <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 lg:block">
              База хранит факты, журнал достает из них память
            </p>
          </div>
        </Link>}

        {isCatalog ? (
          <div className="archive-catalog-controls-row">{controls}</div>
        ) : (
          <ActionsContainer aria-label="Основная навигация" className="flex shrink-0 gap-2">
            {controls}
            {adminLink}
            {authorAction}
          </ActionsContainer>
        )}
      </SiteHeaderContainer>

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
