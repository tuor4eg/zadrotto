import { CircleHelp, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTHOR_RATING_TONE_CLASS_NAMES } from "@/lib/ratings/tone";

export function QuizRules() {
  return (
          <div className="mx-auto max-w-xl text-sm leading-6 text-stone-700">
            <ol className="list-decimal space-y-3 pl-5">
              <li>Раз в день в 12:00 (MSK) публикуются вопросы квиза.</li>
              <li>
                Чтобы начать участие, нужно нажать следующую кнопку:
                <div className="mt-2 text-center">
                  <Button
                    className="archive-control-surface border-stone-300/80 font-mono text-xs uppercase tracking-wider text-stone-700 disabled:opacity-100"
                    disabled
                    variant="outline"
                  >
                    Искать ответ в архиве
                  </Button>
                </div>
              </li>
              <li>
                После этого в архиве нужно отыскать запись, которая, на ваш взгляд, является ответом на вопрос, и нажать кнопку:
                <div className="mt-2 text-center">
                  <Button
                    className={`h-9 border px-4 font-mono uppercase tracking-[0.08em] disabled:opacity-100 ${AUTHOR_RATING_TONE_CLASS_NAMES.good}`}
                    disabled
                    size="sm"
                    variant="positive"
                  >
                    Проверить догадку
                    <CircleHelp />
                  </Button>
                </div>
              </li>
              <li>
                За правильный ответ вы получаете столько очков, сколько осталось попыток, включая успешную. Например, при трёх попытках: с первой — 3 очка, со второй — 2, с последней — 1. Если неправильно, можно попробовать ещё, пока не кончатся все попытки. Оставшиеся попытки отображаются на экране как сердечко × число.
                <div className="mt-3 flex justify-center">
                  <span aria-label="Осталось попыток: 3" className="archive-paper-surface flex items-center gap-1 rounded-full border border-red-900/25 bg-stone-50/90 px-3 py-2 shadow-sm">
                    <Heart aria-hidden="true" className="size-5 shrink-0 fill-red-700 text-red-800 drop-shadow-sm" />
                    <span aria-hidden="true" className="whitespace-nowrap font-medium tabular-nums text-red-900">× 3</span>
                  </span>
                </div>
              </li>
            </ol>
          </div>
  );
}
