import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { getAiScenarioProfiles } from "@/db/queries/ai-scenarios";
import { aiProviderRegistry } from "@/lib/ai/registry";
import { getAiScenarioDefinition } from "@/lib/ai/scenarios/catalog";
import { EmptyState, PageHeader } from "../../../admin-ui";
import { AdminToasts, type AdminToast } from "../../../admin-toasts";
import { deleteAiScenarioAction } from "./actions";
import { ScenarioToggleButton } from "./scenario-toggle-button";

type AiScenariosPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AiScenariosPage({ searchParams }: AiScenariosPageProps) {
  const [params, profiles] = await Promise.all([searchParams, getAiScenarioProfiles()]);
  const providerLabels = new Map(
    aiProviderRegistry.list().map(({ code, label }) => [code, label]),
  );
  const toastMessages = [
    ...(params.created === "1"
      ? [{ id: "scenario-created", tone: "success" as const, text: "Сценарий создан." }]
      : []),
    ...(params.deleted === "1"
      ? [{ id: "scenario-deleted", tone: "success" as const, text: "Сценарий удалён." }]
      : []),
    ...(params.error
      ? [{
          id: "scenario-error",
          tone: "error" as const,
          text: params.error === "not-found"
            ? "Сценарий не найден."
            : "Не удалось выполнить действие.",
        }]
      : []),
  ] satisfies AdminToast[];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["created", "deleted", "error"]} messages={toastMessages} />
      <PageHeader
        title="Сценарии"
        description="Именованные профили моделей и параметров для серверных AI-задач."
        aside={
          <Link href="/admin/tools/ai/scenarios/new" className={buttonVariants()}>
            <Plus />
            Создать
          </Link>
        }
      />

      {profiles.length === 0 ? (
        <EmptyState>Сценарии пока не добавлены.</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Сценарий</TH>
                <TH className="hidden sm:table-cell">Провайдер и модель</TH>
                <TH className="w-24 text-center">Статус</TH>
                <TH className="w-40 text-right"><span className="sr-only">Действия</span></TH>
              </tr>
            </THead>
            <TBody>
              {profiles.map((profile) => (
                <TR key={profile.id}>
                  <TD className="min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-stone-950">
                        {getAiScenarioDefinition(profile.key)?.name ?? profile.name}
                      </span>
                      {!getAiScenarioDefinition(profile.key) ? (
                        <Badge variant="warning">Неподдерживаемый</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-stone-500">{profile.key}</div>
                    <div className="mt-1 truncate text-xs text-stone-500 sm:hidden">
                      {providerLabels.get(profile.providerCode) ?? profile.providerCode}
                      {" · "}
                      {profile.modelId ?? "Из настроек провайдера"}
                    </div>
                  </TD>
                  <TD className="hidden min-w-0 overflow-hidden sm:table-cell">
                    <div className="truncate text-sm text-stone-900">
                      {providerLabels.get(profile.providerCode) ?? profile.providerCode}
                    </div>
                    <div className="mt-1 truncate text-xs text-stone-500">
                      {profile.modelId ?? "Из настроек провайдера"}
                    </div>
                  </TD>
                  <TD className="text-center">
                    <Badge variant={profile.enabled ? "positive" : "outline"}>
                      {profile.enabled ? "Включён" : "Выключен"}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                    {getAiScenarioDefinition(profile.key) ? (
                      <ScenarioToggleButton
                        id={profile.id}
                        enabled={profile.enabled}
                        name={getAiScenarioDefinition(profile.key)!.name}
                      />
                    ) : null}
                    {getAiScenarioDefinition(profile.key) ? <Tooltip label="Изменить">
                      <Link
                        href={`/admin/tools/ai/scenarios/${profile.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "icon" })}
                        aria-label={`Изменить сценарий ${profile.name}`}
                      >
                        <Pencil />
                      </Link>
                    </Tooltip> : null}
                    <Tooltip label="Удалить сценарий">
                      <ConfirmAction
                        action={deleteAiScenarioAction}
                        title="Удалить сценарий?"
                        description="Сценарий будет удалён. Технические логи вызовов сохранятся."
                        confirmLabel="Удалить"
                        triggerLabel="Удалить"
                        triggerAriaLabel={`Удалить сценарий ${profile.name}`}
                        triggerIcon={<Trash2 />}
                        triggerSize="icon"
                        fields={[{ name: "id", value: profile.id }]}
                      />
                    </Tooltip>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
