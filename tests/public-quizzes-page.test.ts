import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("public quizzes section is restricted to registered authors", () => {
  const page = read("src/app/quizzes/page.tsx");
  const header = read("src/components/archive/public-site-header.tsx");

  assert.match(page, /const author = await requireAuthor\(\)/);
  assert.match(page, /<PublicSiteHeader \{\.\.\.headerState\.headerProps\} \/>/);
  assert.match(header, /\.\.\.\(author \? \[QUIZZES_MENU_ITEM\] : \[\]\)/);
  assert.match(header, /href: "\/quizzes", label: "Квизы"/);
});

test("public quizzes section separates the intro and current quiz widgets", () => {
  const page = read("src/app/quizzes/page.tsx");
  const widget = read("src/components/quizzes/quizzes-hero.tsx");
  const currentQuiz = read("src/app/main/archive-riddle.tsx");
  const noActiveState = read("src/components/quizzes/quiz-no-active-state.tsx");

  assert.match(page, /grid gap-3 lg:grid-cols-3[\s\S]*lg:col-span-2[\s\S]*<QuizzesHero statistics=\{statistics\} \/>[\s\S]*<ArchiveRiddle/);
  assert.match(page, /<ArchiveRiddle[\s\S]*quiz=\{activeQuiz\}/);
  assert.match(page, /<ArchiveRiddle[\s\S]*size="large"/);
  assert.match(widget, /min-h-\[320px\][^"\n]*lg:h-\[360px\]/);
  assert.match(currentQuiz, /className=\{`max-w-full rounded-md object-contain \$\{imageMaxHeightClassName\}`\}/);
  assert.match(currentQuiz, /setInterval\(\(\) => setNow\(new Date\(\)\), 1_000\)/);
  assert.match(currentQuiz, /<QuizNoActiveState compact=\{size === "default"\} \/>/);
  assert.match(currentQuiz, /quiz\.winner[\s\S]*<QuizWinner winner=\{quiz\.winner\}/);
  assert.match(currentQuiz, /quiz\?\.winner \? "max-h-\[210px\]" : "max-h-\[250px\]"/);
  assert.match(currentQuiz, /quiz\?\.winner \? "max-h-\[135px\]" : "max-h-\[170px\]"/);
  assert.match(currentQuiz, /absolute inset-x-3 bottom-2 flex justify-center/);
  assert.match(noActiveState, /src="\/quiz_no_active_placeholder\.webp"/);
  assert.match(noActiveState, /Новый квиз уже готовится\./);
  assert.match(noActiveState, /Загляни чуть позже — хорошие вопросы всегда возвращаются\./);
  assert.equal(existsSync("public/quiz_no_active_placeholder.webp"), true);
  assert.ok(statSync("public/quiz_no_active_placeholder.webp").size < 100_000);
  assert.match(widget, /src="\/back_quizzes\.webp"[\s\S]*style=\{\{ opacity: 0\.25 \}\}/);
  assert.match(widget, /backgroundSize: "auto 100%"/);
  assert.match(widget, />\s*Квизы\s*<\/h1>/);
  assert.match(widget, /Проверь свои знания или узнай что-то новое\. Здесь тебя ждут интересные вопросы и хорошая компания/);
  assert.doesNotMatch(widget, /CircleHelp/);
  assert.match(widget, /maskImage: "linear-gradient\(to right, transparent/);
  assert.equal(existsSync("public/back_quizzes.webp"), true);
  assert.ok(statSync("public/back_quizzes.webp").size < 300_000);
});

test("quiz hero promotes three key statistics without duplicating them below", () => {
  const hero = read("src/components/quizzes/quizzes-hero.tsx");
  const heroStatistics = read("src/components/quizzes/quiz-hero-statistics.tsx");
  const lowerStatistics = read("src/components/author/author-quiz-statistics.tsx");

  assert.match(hero, /<QuizHeroStatistics[\s\S]*playedCount=\{statistics\.playedCount\}[\s\S]*winnerCount=\{statistics\.winnerCount\}/);
  assert.match(heroStatistics, /icon: Gamepad2[\s\S]*label: "Сыграно"/);
  assert.match(heroStatistics, /icon: Trophy[\s\S]*label: "Побед"/);
  assert.match(heroStatistics, /icon: Flame[\s\S]*label: "Текущая серия"/);
  assert.match(heroStatistics, /size-9 shrink-0 sm:size-10/);
  assert.match(heroStatistics, /font-serif text-xl[^"\n]*sm:text-3xl/);
  assert.match(heroStatistics, /mt-auto[^"\n]*pt-6/);
  assert.match(heroStatistics, /\.filter\(\(item\) => item\.value > 0\)/);
  assert.match(heroStatistics, /if \(items\.length === 0\) return null/);
  assert.match(hero, /relative z-20 flex h-full w-full flex-col/);
  assert.doesNotMatch(lowerStatistics, /label: "(?:Сыграно|Побед|Текущая серия)"/);
});

test("public quizzes section contains three equal lower widgets and owns quiz statistics", () => {
  const page = read("src/app/quizzes/page.tsx");
  const statistics = read("src/components/author/author-quiz-statistics.tsx");
  const emptyState = read("src/components/quizzes/quiz-empty-state.tsx");

  assert.match(page, /getAuthorQuizStatistics\(author\.id\)/);
  assert.match(page, /getQuizLeaderboard\(\)/);
  assert.match(page, /grid flex-1 items-stretch gap-3 lg:grid-cols-3/);
  assert.match(page, /<AuthorQuizStatistics statistics=\{statistics\} \/>/);
  assert.match(page, /<QuizLeaderboard items=\{leaderboard\} \/>/);
  assert.match(page, /getQuizArchive\(\)/);
  assert.match(page, /<QuizArchiveList items=\{archiveItems\} \/>/);
  assert.match(statistics, /Твоя статистика/);
  assert.match(statistics, /label: "Общее время"[\s\S]*formatQuizDuration\(statistics\.totalTimeSeconds\)/);
  assert.match(statistics, /statistics\.playedCount === 0/);
  assert.match(statistics, /imageSrc="\/quiz_stat_placeholder\.webp"/);
  assert.match(statistics, /Пройди первый квиз —[\s\S]*здесь появится твоя статистика/);
  assert.match(statistics, /Сколько знаний в твоём инвентаре\?[\s\S]*Скоро узнаем!/);
  assert.equal(existsSync("public/quiz_stat_placeholder.webp"), true);
  assert.ok(statSync("public/quiz_stat_placeholder.webp").size < 100_000);
  assert.match(emptyState, /grid-rows-\[8\.5rem_3\.5rem_minmax\(4rem,auto\)\]/);
  assert.match(emptyState, /relative h-32 w-56/);
});

test("current quiz and archive widgets use the same column width", () => {
  const page = read("src/app/quizzes/page.tsx");

  assert.match(page, /grid gap-3 lg:grid-cols-3/);
  assert.match(page, /lg:col-span-2[\s\S]*<QuizzesHero/);
});

test("quiz archive renders a compact unlinked list", () => {
  const archive = read("src/components/quizzes/quiz-archive-list.tsx");
  const query = read("src/db/queries/quizzes.ts");

  assert.match(query, /getQuizArchive[\s\S]*lte\(quizzes\.endsAt, currentTime\)/);
  assert.match(query, /participantCount: sql<number>`count\(\*\)::int`/);
  assert.match(query, /winnerName: sql<string \| null>`max\(case when/);
  assert.match(query, /mediaTypesByQuizId/);
  assert.match(archive, /Архив квизов/);
  assert.match(archive, /Участников: \{item\.participantCount\.toLocaleString\("ru-RU"\)\}/);
  assert.match(archive, /item\.winnerName \?\? "Нет победителя"/);
  assert.doesNotMatch(archive, /<Link|href=/);
  assert.match(archive, /imageSrc="\/quiz_archieve_placeholder\.webp"/);
  assert.match(archive, /Здесь пока нет завершенных квизов/);
  assert.match(archive, /Самое время стать частью истории/);
  assert.equal(existsSync("public/quiz_archieve_placeholder.webp"), true);
  assert.ok(statSync("public/quiz_archieve_placeholder.webp").size < 100_000);
});

test("quiz leaderboard ranks authors by a single win count", () => {
  const leaderboard = read("src/components/quizzes/quiz-leaderboard.tsx");
  const query = read("src/db/queries/quizzes.ts");

  assert.match(query, /getQuizLeaderboard[\s\S]*isNotNull\(quizParticipants\.completedAt\)/);
  assert.match(query, /winnerCount: sql<number>`count\(\*\) filter \(where \$\{quizParticipants\.isWinner\} = true\)::int`/);
  assert.match(query, /totalTimeSeconds: sql<number>`sum\(extract\(epoch from \(\$\{quizParticipants\.completedAt\} - \$\{quizzes\.startsAt\}\)\)\) filter \(where \$\{quizParticipants\.isWinner\} = true\)::float`/);
  assert.match(query, /groupBy\(authors\.id, authors\.name, authors\.avatarObjectKey\)/);
  assert.match(query, /having\(sql`count\(\*\) filter \(where \$\{quizParticipants\.isWinner\} = true\) > 0`\)/);
  assert.match(query, /orderBy\([\s\S]*desc\(sql`count\(\*\) filter \(where \$\{quizParticipants\.isWinner\} = true\)`\),[\s\S]*asc\(sql`sum\(extract\(epoch from \(\$\{quizParticipants\.completedAt\} - \$\{quizzes\.startsAt\}\)\)\) filter \(where \$\{quizParticipants\.isWinner\} = true\)`\),[\s\S]*asc\(authors\.name\),[\s\S]*asc\(authors\.id\)/);
  assert.match(query, /limit\(limit\)/);
  assert.match(leaderboard, />\s*#\s*<[\s\S]*Пользователь[\s\S]*Результат[\s\S]*Время/);
  assert.match(leaderboard, /href=\{`\/users\/\$\{item\.authorId\}`\}/);
  assert.match(leaderboard, /\{item\.winnerCount\}/);
  assert.match(leaderboard, /formatQuizDuration\(item\.totalTimeSeconds\)/);
  assert.match(leaderboard, /w-36 pb-2 text-right font-normal/);
  assert.match(leaderboard, /whitespace-nowrap py-2 text-right/);
  assert.match(leaderboard, /imageSrc="\/quiz_win_placeholder\.webp"/);
  assert.match(leaderboard, /Пьедестал пока пустует/);
  assert.match(leaderboard, /Стань одним из первых, кто пройдёт квиз,[\s\S]*и попади в таблицу лучших![\s\S]*Всё только начинается/);
  assert.equal(existsSync("public/quiz_win_placeholder.webp"), true);
  assert.ok(statSync("public/quiz_win_placeholder.webp").size < 100_000);
});
