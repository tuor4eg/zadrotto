import { Loader2 } from "lucide-react";

type FranchiseSuggestionStatusProps = {
  visible: boolean;
};

export function FranchiseSuggestionStatus({ visible }: FranchiseSuggestionStatusProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      Подбираем подходящие серии…
    </div>
  );
}
