import type { ReactNode } from "react";
import Image from "next/image";

type QuizEmptyStateProps = {
  description: ReactNode;
  imageSrc: string;
  title: ReactNode;
};

export function QuizEmptyState({ description, imageSrc, title }: QuizEmptyStateProps) {
  return (
    <div className="mt-3 grid min-h-64 w-full grid-rows-[8.5rem_3.5rem_minmax(4rem,auto)] justify-items-center text-center">
      <div className="relative h-32 w-56 self-start">
        <Image src={imageSrc} alt="" fill sizes="224px" className="object-contain" />
      </div>
      <p className="max-w-sm self-start font-serif text-xl leading-6 text-stone-800 sm:text-2xl sm:leading-7">
        {title}
      </p>
      <p className="max-w-sm self-start text-sm leading-5 text-stone-500 sm:text-base sm:leading-6">
        {description}
      </p>
    </div>
  );
}
