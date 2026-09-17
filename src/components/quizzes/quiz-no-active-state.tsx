import Image from "next/image";

export function QuizNoActiveState({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <div className={`relative w-full ${compact ? "h-28 max-w-56" : "h-44 max-w-sm"}`}>
        <Image
          src="/quiz_no_active_placeholder.webp"
          alt=""
          fill
          sizes={compact ? "224px" : "384px"}
          className="object-contain"
        />
      </div>
      <p className="mt-2 max-w-md font-serif text-xl leading-6 text-stone-800 sm:text-2xl sm:leading-7">
        Новый квиз уже готовится.
      </p>
      <p className="mt-2 max-w-md text-sm leading-5 text-stone-500 sm:text-base sm:leading-6">
        Загляни чуть позже — хорошие вопросы всегда возвращаются.
      </p>
    </div>
  );
}
