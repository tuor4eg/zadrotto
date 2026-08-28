"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Archive, Compass, EyeOff, FileText, Heart, Loader2, X } from "lucide-react";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { ArchiveRatingPanel } from "@/app/media-rating-panel";
import {
  beginArchiveExplorationOnboardingAction,
  claimArchiveExplorationInviteAction,
  getArchiveExplorationMediaTypesAction,
  saveArchiveExplorationAutoShowAction,
  saveArchiveExplorationMediaTypesAction,
  saveArchiveExplorationRatingAction,
  saveArchiveExplorationStatusAction,
  startArchiveExplorationAction,
} from "@/app/archive-exploration/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ImageViewer } from "@/components/ui/image-viewer";
import { RatingExperienceFields } from "@/components/ui/rating-experience-fields";
import { RatingScoreButtons } from "@/components/ui/rating-score-buttons";
import {
  ARCHIVE_EXPLORATION_ONBOARDING_STEPS,
  ARCHIVE_EXPLORATION_RATING_LIMIT,
  type ArchiveExplorationMediaTypeOption,
  type ArchiveExplorationResult,
} from "@/lib/archive-exploration/model";

type ArchiveExplorationLauncherProps = {
  autoInvite?: boolean;
  className?: string;
  currentAuthor: boolean;
  iconOnly?: boolean;
};

export function ArchiveExplorationLauncher({
  autoInvite = false,
  className,
  currentAuthor,
  iconOnly = false,
}: ArchiveExplorationLauncherProps) {
  const router = useRouter();
  const requestedAutoInviteRef = useRef(false);
  const startAfterLoginRef = useRef(false);
  const ratingFormRef = useRef<HTMLFormElement>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [showMediaTypeSelection, setShowMediaTypeSelection] = useState(false);
  const [autoShowEnabled, setAutoShowEnabled] = useState(true);
  const [mediaTypeOptions, setMediaTypeOptions] = useState<
    ArchiveExplorationMediaTypeOption[] | null
  >(null);
  const [selectedMediaTypeIds, setSelectedMediaTypeIds] = useState<number[]>([]);
  const [mediaTypeSelectionError, setMediaTypeSelectionError] = useState<string | null>(null);
  const [result, setResult] = useState<ArchiveExplorationResult | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function startExploration() {
    setShowInvitation(false);
    setShowMediaTypeSelection(false);
    setIsOpen(true);
    setResult(null);
    startTransition(async () => {
      const nextResult = await startArchiveExplorationAction();
      if (nextResult.status === "onboarding") {
        setShowInvitation(true);
        return;
      }
      if (nextResult.status === "interests") {
        openMediaTypeSelection();
        return;
      }
      setResult(nextResult);
    });
  }

  function openMediaTypeSelection() {
    setShowInvitation(false);
    setShowMediaTypeSelection(true);
    setMediaTypeOptions(null);
    setMediaTypeSelectionError(null);
    startTransition(async () => {
      const response = await getArchiveExplorationMediaTypesAction();
      if (response.status === "error") {
        setMediaTypeSelectionError(response.message);
        return;
      }
      setMediaTypeOptions(response.mediaTypes);
      setSelectedMediaTypeIds(
        response.mediaTypes.filter(({ isEnabled }) => isEnabled).map(({ id }) => id),
      );
    });
  }

  function saveMediaTypeSelection() {
    if (selectedMediaTypeIds.length === 0) return;
    setMediaTypeSelectionError(null);
    startTransition(async () => {
      const nextResult = await saveArchiveExplorationMediaTypesAction(selectedMediaTypeIds);
      if (nextResult.status === "error") {
        setMediaTypeSelectionError(nextResult.message);
        return;
      }
      setShowMediaTypeSelection(false);
      setResult(nextResult);
      router.refresh();
    });
  }

  function beginArchiveExploration() {
    startTransition(async () => {
      setResult(await beginArchiveExplorationOnboardingAction());
      router.refresh();
    });
  }

  useEffect(() => {
    if (
      !currentAuthor ||
      !autoInvite ||
      requestedAutoInviteRef.current ||
      startAfterLoginRef.current
    ) return;
    requestedAutoInviteRef.current = true;
    startTransition(async () => {
      const claim = await claimArchiveExplorationInviteAction();
      if (claim.shouldShow) {
        setAutoShowEnabled(claim.autoShowEnabled);
        setIsOpen(true);
        if (claim.onboardingStep >= ARCHIVE_EXPLORATION_ONBOARDING_STEPS.ratings) {
          setShowInvitation(false);
          setResult(await startArchiveExplorationAction());
        } else if (claim.onboardingStep === ARCHIVE_EXPLORATION_ONBOARDING_STEPS.guide) {
          setShowInvitation(false);
          setResult({ status: "ready" });
        } else if (claim.onboardingStep === ARCHIVE_EXPLORATION_ONBOARDING_STEPS.interests) {
          setShowInvitation(false);
          setShowMediaTypeSelection(true);
          const response = await getArchiveExplorationMediaTypesAction();
          if (response.status === "error") {
            setMediaTypeSelectionError(response.message);
          } else {
            setMediaTypeOptions(response.mediaTypes);
            setSelectedMediaTypeIds(
              response.mediaTypes.filter(({ isEnabled }) => isEnabled).map(({ id }) => id),
            );
          }
        } else {
          setShowInvitation(true);
        }
      }
    });
  }, [autoInvite, currentAuthor]);

  useEffect(() => {
    if (currentAuthor && startAfterLoginRef.current) {
      startAfterLoginRef.current = false;
      startExploration();
    }
    // После входа запуск нужен только на переходе состояния авторизации.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAuthor]);

  function openManually() {
    if (!currentAuthor) {
      startAfterLoginRef.current = true;
      setIsLoginOpen(true);
      return;
    }
    if (showInvitation || showMediaTypeSelection) {
      setIsOpen(true);
      return;
    }
    startExploration();
  }

  function saveRating() {
    if (result?.status !== "candidate" || selectedScore === null) return;
    const formData = ratingFormRef.current ? new FormData(ratingFormRef.current) : null;
    const firstExperiencedValue = formData?.get("firstExperiencedValue");
    const firstExperiencedPrecision = formData?.get("firstExperiencedPrecision");
    startTransition(async () => {
      const nextResult = await saveArchiveExplorationRatingAction(result.candidate.code, selectedScore, {
        firstExperiencedValue:
          typeof firstExperiencedValue === "string" ? firstExperiencedValue : "",
        firstExperiencedPrecision:
          typeof firstExperiencedPrecision === "string" ? firstExperiencedPrecision : "",
      });
      if (nextResult.status !== "error") setSelectedScore(null);
      setResult(nextResult);
      router.refresh();
    });
  }

  function saveStatus(status: "skipped" | "wanted") {
    if (result?.status !== "candidate") return;
    startTransition(async () => {
      setResult(await saveArchiveExplorationStatusAction(result.candidate.code, status));
      router.refresh();
    });
  }

  function setAutoShow(nextEnabled: boolean) {
    setAutoShowEnabled(nextEnabled);
    startTransition(async () => {
      const saved = await saveArchiveExplorationAutoShowAction(nextEnabled);
      if (!saved.ok) setAutoShowEnabled(!nextEnabled);
    });
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="Исследовать архив"
        title="Исследовать архив"
        onClick={openManually}
      >
        <Compass className="size-4" />
        <span className={iconOnly ? "sr-only" : "hidden lg:inline"}>Исследовать</span>
      </button>

      {isLoginOpen && typeof document !== "undefined"
        ? createPortal(
            <AuthorLoginModal
              onClose={() => {
                startAfterLoginRef.current = false;
                setIsLoginOpen(false);
              }}
              onSuccess={() => {
                setIsLoginOpen(false);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[110] grid items-center justify-items-center overflow-y-auto bg-stone-950/60 p-3 sm:p-5">
          <button type="button" className="absolute inset-0" aria-label="Закрыть исследование" onClick={() => setIsOpen(false)} />
          <section className="archive-paper archive-panel relative z-10 w-full max-w-2xl p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="archive-exploration-title">
            <button
              type="button"
              style={{ right: 0, top: 0 }}
              className="absolute z-20 grid size-9 place-items-center rounded-md text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"
              aria-label="Закрыть"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4" />
            </button>

            {showInvitation ? (
              <>
                <div className="mx-auto max-w-lg pb-16 pt-8 text-center">
                  <Image
                    src="/mascot/deadz_hello.webp"
                    alt="Маскот архива приветствует автора"
                    width={160}
                    height={240}
                    className="mx-auto h-48 w-auto object-contain drop-shadow-lg"
                    priority
                  />
                  <h2 id="archive-exploration-title" className="mt-4 font-serif text-3xl">Привет, путешественник!</h2>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    Добро пожаловать в Архив — место, где «я это точно где-то видел» наконец
                    превращается в уверенность. Знакомое оцени, интересное отправь
                    в желаемое, а остальное пропускай без чувства вины. Архив не обидится.
                  </p>
                  <Button className="mt-6" disabled={pending} onClick={openMediaTypeSelection}>Начать</Button>
                </div>
                <label
                  style={{ bottom: "1rem", left: "1rem", position: "absolute" }}
                  className="flex cursor-pointer items-center gap-2 text-sm text-stone-700"
                >
                  <input type="checkbox" checked={!autoShowEnabled} onChange={(event) => setAutoShow(!event.target.checked)} />
                  Больше не показывать автоматически
                </label>
              </>
            ) : showMediaTypeSelection ? (
              <div className="pt-5">
                <h2 id="archive-exploration-title" className="pr-10 font-serif text-3xl">
                  Что тебе интересно?
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  Выбери типы записей, которые хочешь исследовать. Позже выбор можно изменить
                  в настройках профиля.
                </p>
                {mediaTypeOptions === null && !mediaTypeSelectionError ? (
                  <div className="grid min-h-48 place-items-center" role="status" aria-label="Загрузка типов записей">
                    <Loader2 className="size-7 animate-spin" />
                  </div>
                ) : (
                  <>
                    {mediaTypeOptions?.length === 0 ? (
                      <p className="mt-5 rounded-md border border-stone-300/80 bg-white/55 p-4 text-sm text-stone-600">
                        Сейчас нет доступных типов записей.
                      </p>
                    ) : (
                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      {mediaTypeOptions?.map((mediaType) => {
                        const isSelected = selectedMediaTypeIds.includes(mediaType.id);
                        return (
                          <label
                            key={mediaType.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                              isSelected
                                ? "border-red-900/45 bg-red-50/65"
                                : "border-stone-300/80 bg-white/55"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 size-4 rounded border-stone-300"
                              checked={isSelected}
                              onChange={(event) => {
                                setSelectedMediaTypeIds((current) =>
                                  event.target.checked
                                    ? [...current, mediaType.id]
                                    : current.filter((id) => id !== mediaType.id),
                                );
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block font-medium text-stone-950">{mediaType.name}</span>
                              {mediaType.description ? (
                                <span className="mt-1 block text-xs leading-5 text-stone-600">
                                  {mediaType.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    )}
                    {mediaTypeSelectionError ? (
                      <p className="mt-4 text-center text-sm text-red-900">{mediaTypeSelectionError}</p>
                    ) : null}
                    <div className="mt-5 flex justify-center">
                      <Button
                        disabled={pending || selectedMediaTypeIds.length === 0}
                        onClick={saveMediaTypeSelection}
                      >
                        {pending ? <Loader2 className="animate-spin" /> : null}
                        Продолжить
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : result?.status === "ready" ? (
              <div className="mx-auto max-w-lg py-10 text-center">
                <Image
                  src="/mascot/deadz_quiz_correct.webp"
                  alt="Маскот архива показывает, что всё готово"
                  width={168}
                  height={184}
                  className="mx-auto h-44 w-auto object-contain drop-shadow-lg"
                />
                <h2 id="archive-exploration-title" className="mt-4 font-serif text-3xl">
                  Всё готово
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  Сейчас покажем, как ставить оценки. Архив уже подобрал несколько записей
                  по твоим интересам — отмечай знакомые и переходи дальше.
                </p>
                <Button className="mt-6" disabled={pending} onClick={beginArchiveExploration}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Начать
                </Button>
              </div>
            ) : pending && !result ? (
              <div className="grid min-h-72 place-items-center" role="status" aria-label="Загрузка записи"><Loader2 className="size-7 animate-spin" /></div>
            ) : result?.status === "candidate" ? (
              <div>
                <h2 id="archive-exploration-title" className="pr-10 font-serif text-3xl">Исследовать архив</h2>
                <div
                  className="relative mt-5 h-9 overflow-hidden rounded-full border border-stone-400/80 bg-stone-50/80 shadow-inner"
                  role="progressbar"
                  aria-label="Прогресс онбординга"
                  aria-valuemin={0}
                  aria-valuemax={ARCHIVE_EXPLORATION_RATING_LIMIT}
                  aria-valuenow={result.ratingsCount}
                >
                  <span className="absolute inset-1 rounded-full border border-stone-400/70 bg-stone-200/80" />
                  <span
                    className="absolute inset-1 block rounded-full bg-[linear-gradient(to_right,#b91c1c_0%,#b45309_28%,#57534e_50%,#047857_80%,#065f46_100%)] transition-[clip-path] duration-300"
                    style={{
                      clipPath: `inset(0 ${100 - Math.min(100, (result.ratingsCount / ARCHIVE_EXPLORATION_RATING_LIMIT) * 100)}% 0 0)`,
                    }}
                  />
                  <span className="absolute inset-1 grid grid-cols-5 overflow-hidden rounded-full border border-stone-400/70" aria-hidden="true">
                    {Array.from({ length: ARCHIVE_EXPLORATION_RATING_LIMIT }, (_, index) => (
                      <span
                        key={index}
                        className={index === 0 ? "" : "border-l-2 border-stone-50/80"}
                      />
                    ))}
                  </span>
                  <span className="absolute inset-0 z-10 grid place-items-center">
                    <span className="rounded bg-stone-950/75 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white shadow-sm">
                      Оценок {result.ratingsCount} из {ARCHIVE_EXPLORATION_RATING_LIMIT}
                    </span>
                  </span>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="relative mx-auto aspect-[2/3] w-full max-w-[180px] overflow-hidden rounded-md border border-stone-300 bg-stone-100">
                    {result.candidate.coverThumbUrl ?? result.candidate.coverUrl ? (
                      <ImageViewer
                        src={result.candidate.coverUrl ?? result.candidate.coverThumbUrl ?? ""}
                        alt={`Обложка: ${result.candidate.title}`}
                        title={result.candidate.title}
                        overlayZIndex={120}
                        triggerClassName="relative block h-full w-full cursor-zoom-in"
                      >
                        <Image src={result.candidate.coverThumbUrl ?? result.candidate.coverUrl ?? ""} alt="" fill sizes="180px" className="object-cover" unoptimized />
                      </ImageViewer>
                    ) : <div className="grid h-full place-items-center px-3 text-center font-mono text-xs uppercase text-stone-500">Обложки пока нет</div>}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-wider text-stone-600">{result.candidate.mediaTypeName}{result.candidate.releaseYear ? ` · ${result.candidate.releaseYear}` : ""}</p>
                    <h3 className="mt-2 font-serif text-2xl leading-tight">{result.candidate.title}</h3>
                    <div className="mt-5 grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                      <div className="aspect-square min-w-0">
                        <ArchiveRatingPanel
                          compact
                          inverted
                          showStarsWhenCompact
                          displayFontClassName="font-serif"
                          label="Оценка архива"
                          labelFontClassName="font-mono"
                          ratingsCount={result.candidate.ratingsCount}
                          score={result.candidate.averageScore}
                        />
                      </div>
                      <div className="grid grid-rows-3 gap-2">
                        <Link
                          href={`/media/${result.candidate.code}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <FileText />
                          Открыть досье
                        </Link>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => saveStatus("wanted")}><Heart />В желаемое</Button>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => saveStatus("skipped")}><EyeOff />Пропустить</Button>
                      </div>
                    </div>
                  </div>
                </div>
                <form
                  ref={ratingFormRef}
                  className="mt-6 border-t border-stone-300/80 pt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRating();
                  }}
                >
                  <p className="mb-3 font-mono text-xs uppercase tracking-wider text-stone-600">Твоя оценка</p>
                  <RatingScoreButtons
                    disabled={pending}
                    selectedScore={selectedScore}
                    variant="archive"
                    onScoreClick={(score, { isSelected }) => setSelectedScore(isSelected ? null : score)}
                  />
                  <div className="mt-5">
                    <RatingExperienceFields
                      key={result.candidate.code}
                      releaseYear={result.candidate.releaseYear}
                      variant="archive"
                    />
                  </div>
                  <div className="mt-5 flex justify-center">
                    <Button type="submit" disabled={pending || selectedScore === null}>
                      {pending ? <Loader2 className="animate-spin" /> : null}
                      Дальше
                    </Button>
                  </div>
                </form>
              </div>
            ) : result?.status === "graduated" ? (
              <div className="py-14 text-center">
                <Image
                  src="/mascot/deadz_quiz_correct.webp"
                  alt="Маскот архива поздравляет автора"
                  width={168}
                  height={184}
                  className="mx-auto h-44 w-auto object-contain drop-shadow-lg"
                />
                <h2 id="archive-exploration-title" className="mt-4 font-serif text-3xl">
                  Отличная работа!
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-600">
                  Теперь ты знаешь, как приручить архив — или хотя бы убедительно делаешь вид.
                  Продолжай в том же духе.
                </p>
                <Button className="mt-6" onClick={() => setIsOpen(false)}>
                  Готово
                </Button>
              </div>
            ) : result?.status === "error" ? (
              <div className="py-16 text-center"><h2 id="archive-exploration-title" className="font-serif text-3xl">Не удалось продолжить</h2><p className="mt-3 text-sm text-red-900">{result.message}</p></div>
            ) : (
              <div className="py-16 text-center"><Archive className="mx-auto size-10 text-red-950/60" /><h2 id="archive-exploration-title" className="mt-4 font-serif text-3xl">Сейчас всё исследовано</h2><p className="mt-3 text-sm text-stone-600">Приходи позже — в архиве обязательно появится что-нибудь новое.</p></div>
            )}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
