"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Shield, UserCircle } from "lucide-react";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { NotificationBadge } from "@/components/ui/notification-badge";
import { QuizModal } from "@/components/quizzes/quiz-modal";
import type { ActiveQuiz } from "@/lib/quizzes/model";
import { AUTHOR_RATING_TONE_CLASS_NAMES } from "@/lib/ratings/tone";

type ArchiveSiteHeaderProps = {
  brandHref: string;
  compact?: boolean;
  controls?: ReactNode;
  currentAdminUser: boolean;
  currentAuthor: boolean;
  incomingFriendRequestCount?: number;
  submittedRequestCount?: number;
  quiz?: { active: ActiveQuiz; isParticipating: boolean; unavailableMediaTypeNames: string[] } | null;
  sticky?: boolean;
  variant: "main" | "catalog";
};

export function ArchiveSiteHeader({
  brandHref,
  compact = false,
  controls,
  currentAdminUser,
  currentAuthor,
  incomingFriendRequestCount = 0,
  submittedRequestCount = 0,
  quiz = null,
  sticky = false,
  variant,
}: ArchiveSiteHeaderProps) {
  const router = useRouter();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const isCatalog = variant === "catalog";
  const ActionsContainer = isCatalog ? "div" : "nav";
  const SiteHeaderContainer = isCatalog ? "div" : "header";
  const authorLinkLabel = currentAuthor ? "Профиль" : "Войти";
  const actionLayoutClassName = `relative inline-flex h-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs uppercase tracking-[0.12em] shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] ${
    isCatalog
      ? compact
        ? "w-9 px-0"
        : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
      : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
  }`;
  const actionClassName = `archive-control-surface ${actionLayoutClassName} border-stone-300/80 text-stone-700 hover:border-stone-700 hover:bg-stone-50`;
  const quizActionClassName = `${actionLayoutClassName} ${AUTHOR_RATING_TONE_CLASS_NAMES.good} hover:border-emerald-950/40 hover:bg-emerald-800`;

  const adminLink = currentAdminUser ? (
    <Link href="/admin" aria-label="Админка" className={actionClassName}>
      <Shield className="size-4" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : "sr-only lg:not-sr-only"}>
        Админка
      </span>
      <NotificationBadge count={submittedRequestCount} className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4" />
    </Link>
  ) : null;
  const authorAction = currentAuthor ? (
    <Link href="/author" aria-label={authorLinkLabel} className={actionClassName}>
      <UserCircle className="size-5" />
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : "sr-only lg:not-sr-only"}>
        {authorLinkLabel}
      </span>
      <NotificationBadge count={incomingFriendRequestCount} className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4" />
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
  const quizAction = quiz ? (
    <button type="button" aria-label="Сыграем" className={quizActionClassName} onClick={() => setIsQuizOpen(true)}>
      <span className={isCatalog ? (compact ? "sr-only" : "sr-only lg:not-sr-only") : "sr-only lg:not-sr-only"}>Сыграем</span>
      <CircleHelp className="size-4" />
    </button>
  ) : null;
  const catalogActions = (
    <div className="archive-catalog-header-actions flex shrink-0 items-center gap-2">
      {quizAction ? <div className="lg:hidden">{quizAction}</div> : null}
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
        : "archive-main-brand-header archive-paper archive-panel grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 pr-2 lg:flex lg:justify-between lg:gap-4 lg:px-7 lg:py-5"}
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
                <h1 className="truncate font-serif text-[clamp(0.6875rem,3.75vw,1.25rem)] leading-tight text-stone-950 lg:text-4xl">
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
            <h1 className="truncate font-serif text-[clamp(0.6875rem,3.75vw,1.25rem)] leading-tight text-stone-950 lg:text-4xl">
              Журнал, которого не было
            </h1>
            <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 lg:block">
              База хранит факты, журнал достает из них память
            </p>
          </div>
        </Link>}

        {isCatalog ? (
          <div className="archive-catalog-controls-row">
            {quizAction && !compact ? <div className="hidden lg:mr-2 lg:block">{quizAction}</div> : null}
            {controls}
          </div>
        ) : (
          <ActionsContainer aria-label="Основная навигация" className="contents lg:flex lg:shrink-0 lg:gap-2">
            {controls ? <div className="col-span-2 row-start-2 min-w-0 lg:col-auto lg:row-auto lg:flex lg:gap-2">{quizAction ? <div className="hidden lg:mr-2 lg:block">{quizAction}</div> : null}<div className="min-w-0 w-full lg:flex-1">{controls}</div></div> : null}
            <div className="col-start-2 row-start-1 flex shrink-0 gap-2 lg:col-auto lg:row-auto">
              {quizAction ? <div className="lg:hidden">{quizAction}</div> : null}
              {adminLink}
              {authorAction}
            </div>
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
      {quiz && isQuizOpen
        ? <QuizModal
            isParticipating={quiz.isParticipating}
            onClose={() => setIsQuizOpen(false)}
            quiz={quiz.active}
            unavailableMediaTypeNames={quiz.unavailableMediaTypeNames}
          />
        : null}
    </>
  );
}
