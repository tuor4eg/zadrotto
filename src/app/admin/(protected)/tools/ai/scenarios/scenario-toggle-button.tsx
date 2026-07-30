"use client";

import { Power, PowerOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/common/utils";
import { AdminToasts, type AdminToast } from "../../../admin-toasts";
import {
  toggleAiScenarioAction,
  type AiScenarioToggleState,
} from "./actions";

const EMPTY_STATE: AiScenarioToggleState = { error: null, success: null };

export function ScenarioToggleButton({
  enabled: initialEnabled,
  id,
  name,
}: {
  enabled: boolean;
  id: number;
  name: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState<AiScenarioToggleState>(EMPTY_STATE);
  const [isPending, startTransition] = useTransition();
  const messages = [
    ...(message.success
      ? [{ id: `scenario-toggle-success-${id}`, tone: "success" as const, text: message.success }]
      : []),
    ...(message.error
      ? [{ id: `scenario-toggle-error-${id}`, tone: "error" as const, text: message.error }]
      : []),
  ] satisfies AdminToast[];

  return (
    <>
      <AdminToasts messages={messages} />
      <Tooltip label={enabled ? "Выключить сценарий" : "Включить сценарий"}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={isPending}
          aria-label={`${enabled ? "Выключить" : "Включить"} сценарий ${name}`}
          className={cn(
            enabled &&
              "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          )}
          onClick={() => {
            const nextEnabled = !enabled;
            setMessage(EMPTY_STATE);
            startTransition(async () => {
              const result = await toggleAiScenarioAction(id, nextEnabled);
              setMessage(result);
              if (!result.error) {
                setEnabled(nextEnabled);
                router.refresh();
              }
            });
          }}
        >
          {enabled ? <Power className="size-4" /> : <PowerOff className="size-4" />}
        </Button>
      </Tooltip>
    </>
  );
}
