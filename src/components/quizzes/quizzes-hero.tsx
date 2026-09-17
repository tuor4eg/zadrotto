import Image from "next/image";

import { QuizHeroStatistics } from "@/components/quizzes/quiz-hero-statistics";
import type { AuthorQuizStatistics } from "@/lib/quizzes/model";

export function QuizzesHero({ statistics }: { statistics: AuthorQuizStatistics }) {
  return (
    <section
      className="archive-paper archive-panel relative flex min-h-[320px] items-center overflow-hidden px-4 py-6 sm:px-5 lg:h-[360px] lg:py-7"
      aria-labelledby="quizzes-title"
    >
      <Image
        src="/back_quizzes.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 1023px) 100vw, 67vw"
        className="z-0 object-cover object-right lg:hidden"
        style={{ opacity: 0.25 }}
      />
      <div
        aria-hidden="true"
        className="hidden lg:block"
        style={{
          aspectRatio: "1600 / 900",
          backgroundImage: "url('/back_quizzes.webp')",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "auto 100%",
          height: "100%",
          maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.05) 18%, rgba(0,0,0,.22) 38%, rgba(0,0,0,.55) 56%, rgba(0,0,0,.84) 72%, #000 86%, #000 100%)",
          position: "absolute",
          right: 0,
          top: 0,
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.05) 18%, rgba(0,0,0,.22) 38%, rgba(0,0,0,.55) 56%, rgba(0,0,0,.84) 72%, #000 86%, #000 100%)",
          zIndex: 0,
        }}
      />

      <div className="relative z-20 flex h-full w-full flex-col lg:max-w-[58%]">
        <div>
          <h1
            id="quizzes-title"
            className="font-serif text-4xl leading-[0.95] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl"
          >
            Квизы
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-700 sm:text-lg sm:leading-7">
            Проверь свои знания или узнай что-то новое. Здесь тебя ждут интересные вопросы и хорошая компания
          </p>
        </div>
        <QuizHeroStatistics
          currentCorrectStreak={statistics.currentCorrectStreak}
          playedCount={statistics.playedCount}
          winnerCount={statistics.winnerCount}
        />
      </div>
    </section>
  );
}
