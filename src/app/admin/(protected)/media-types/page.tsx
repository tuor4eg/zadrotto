import Link from "next/link";
import { Edit3, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminMediaTypes } from "@/db/queries/media-types";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import {
  deleteMediaTypeAction,
  setMediaTypePublicAvailabilityAction,
} from "./actions";
import { getMediaTypeErrorMessage } from "./messages";

type MediaTypesPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    "visibility-updated"?: string;
  }>;
};

function getSuccessMessage(input: {
  created?: string;
  deleted?: string;
  "visibility-updated"?: string;
}) {
  if (input.created === "1") {
    return "Тип создан.";
  }

  if (input.deleted === "1") {
    return "Тип удален.";
  }

  if (input["visibility-updated"] === "1") {
    return "Публичная видимость типа изменена.";
  }

  return null;
}

export default async function MediaTypesPage({ searchParams }: MediaTypesPageProps) {
  const [params, mediaTypes] = await Promise.all([searchParams, getAdminMediaTypes()]);
  const errorMessage = getMediaTypeErrorMessage(params.error);
  const successMessage = getSuccessMessage(params);
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts
        clearParams={["created", "deleted", "error", "visibility-updated"]}
        messages={toastMessages}
      />

      <PageHeader
        title="Типы"
        description="Справочник типов записей: игры, фильмы, книги и любые будущие форматы."
        aside={
          <>
            <Badge variant="outline">{mediaTypes.length} всего</Badge>
            <Link href="/admin/media-types/new" className={buttonVariants()}>
              <Plus />
              Создать
            </Link>
          </>
        }
      />

      {mediaTypes.length === 0 ? (
        <EmptyState>Типы пока не добавлены.</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Тип</TH>
                <TH className="hidden w-44 sm:table-cell">Код</TH>
                <TH className="w-28">Записи</TH>
                <TH className="hidden w-28 md:table-cell">Носители</TH>
                <TH className="w-28 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {mediaTypes.map((mediaType) => {
                const canDelete =
                  mediaType.mediaItemsCount === 0 && mediaType.mediaCarriersCount === 0;

                return (
                  <TR key={mediaType.id}>
                    <TD className="min-w-0 overflow-hidden">
                      <div className="truncate font-medium text-stone-950">{mediaType.name}</div>
                      {mediaType.description ? (
                        <div className="mt-1 truncate text-xs text-stone-500">
                          {mediaType.description}
                        </div>
                      ) : null}
                      <div className="mt-1">
                        <Badge variant={mediaType.isPubliclyAvailable ? "outline" : "warning"}>
                          {mediaType.isPubliclyAvailable ? "Виден пользователям" : "Выключен"}
                        </Badge>
                      </div>
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <span className="font-mono text-xs text-stone-500">{mediaType.code}</span>
                    </TD>
                    <TD>
                      <Badge variant="outline">{mediaType.mediaItemsCount}</Badge>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <Badge variant="outline">{mediaType.mediaCarriersCount}</Badge>
                    </TD>
                    <TD className="px-2">
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        <Tooltip
                          label={mediaType.isPubliclyAvailable ? "Выключить" : "Включить"}
                        >
                          <ConfirmAction
                            action={setMediaTypePublicAvailabilityAction}
                            fields={[
                              { name: "mediaTypeId", value: mediaType.id },
                              {
                                name: "isPubliclyAvailable",
                                value: mediaType.isPubliclyAvailable ? "0" : "1",
                              },
                            ]}
                            title={
                              mediaType.isPubliclyAvailable
                                ? "Выключить тип?"
                                : "Включить тип?"
                            }
                            description={
                              mediaType.isPubliclyAvailable
                                ? `Тип «${mediaType.name}» исчезнет из публичного интерфейса у всех пользователей.`
                                : `Тип «${mediaType.name}» снова станет доступен с учётом личных настроек пользователей.`
                            }
                            triggerLabel={
                              mediaType.isPubliclyAvailable ? "Выключить" : "Включить"
                            }
                            triggerAriaLabel={
                              mediaType.isPubliclyAvailable
                                ? `Выключить тип ${mediaType.name}`
                                : `Включить тип ${mediaType.name}`
                            }
                            triggerIcon={
                              mediaType.isPubliclyAvailable ? <EyeOff /> : <Eye />
                            }
                            triggerSize="icon"
                            triggerVariant={
                              mediaType.isPubliclyAvailable ? "destructive" : "outline"
                            }
                            confirmVariant={
                              mediaType.isPubliclyAvailable ? "destructive" : "default"
                            }
                            confirmLabel={
                              mediaType.isPubliclyAvailable ? "Выключить тип" : "Включить тип"
                            }
                          />
                        </Tooltip>
                        <Tooltip label="Изменить">
                          <Link
                            href={`/admin/media-types/${mediaType.id}/edit`}
                            className={buttonVariants({ variant: "outline", size: "icon" })}
                            aria-label={`Изменить тип ${mediaType.name}`}
                          >
                            <Edit3 />
                          </Link>
                        </Tooltip>
                        <Tooltip
                          label={
                            canDelete
                              ? "Удалить"
                              : "Нельзя удалить: тип используется"
                          }
                        >
                          <ConfirmAction
                            action={deleteMediaTypeAction}
                            disabled={!canDelete}
                            fields={[{ name: "mediaTypeId", value: mediaType.id }]}
                            title="Удалить тип?"
                            description={`Тип «${mediaType.name}» будет удален. Это возможно только если он не выбран у записей и носителей.`}
                            triggerLabel="Удалить"
                            triggerAriaLabel={`Удалить тип ${mediaType.name}`}
                            triggerIcon={<Trash2 />}
                            triggerSize="icon"
                            confirmLabel="Удалить тип"
                          />
                        </Tooltip>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
