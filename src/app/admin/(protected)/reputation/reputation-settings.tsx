"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  RefreshCw,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import {
  REPUTATION_ACTION_LABELS,
  REPUTATION_PREVIEW_SORTS,
  type ReputationPreviewConfig,
  type ReputationPreviewDirection,
  type ReputationPreviewResult,
  type ReputationPreviewRow,
  type ReputationPreviewSort,
} from "@/lib/reputation/model";
import {
  disableReputationAction,
  enableReputationAction,
  previewReputationAction,
  saveReputationConfigurationAction,
  type ReputationPreviewActionInput,
} from "./actions";
import { AdminToasts, type AdminToast } from "../admin-toasts";

const SORT_LABELS: Record<ReputationPreviewSort, string> = {
  author: "Автор",
  xp: "XP",
  level: "Уровень",
  trust: "Доверие",
  approvalRate: "Approval rate",
};

type PreviewQuery = Pick<
  ReputationPreviewActionInput,
  "direction" | "level" | "onlyCandidates" | "pageSize" | "sort"
>;

const INITIAL_PREVIEW_QUERY: PreviewQuery = {
  direction: "desc",
  level: null,
  onlyCandidates: false,
  pageSize: 25,
  sort: "xp",
};

export type ReputationSection = "levels" | "trust";

function numberFromInput(value: string, fallback: number) {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function SettingsSection({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3 border-b border-stone-100 pb-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700">
          {icon}
        </span>
        <div>
          <h3 className="font-semibold text-stone-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ReputationSettings({
  enabledAt,
  initialConfig,
  initialStatus,
  maxLockedLevel,
  section,
}: {
  enabledAt: string | null;
  initialConfig: ReputationPreviewConfig;
  initialStatus: "disabled" | "initializing" | "enabled";
  maxLockedLevel: number;
  section: ReputationSection;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [levelTab, setLevelTab] = useState<"xp" | "thresholds">("xp");
  const [trustTab, setTrustTab] = useState<"actions" | "parameters">("actions");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [confirmation, setConfirmation] = useState<"enable" | "disable" | null>(null);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const [isMutationPending, startMutation] = useTransition();

  const closePreview = useCallback(() => setIsPreviewOpen(false), []);

  function updateRule(
    actionCode: ReputationPreviewConfig["rules"][number]["actionCode"],
    field: "xp" | "trustPoints",
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      rules: current.rules.map((rule) =>
        rule.actionCode === actionCode
          ? { ...rule, [field]: Math.max(field === "trustPoints" ? 1 : 0, numberFromInput(value, rule[field])) }
          : rule,
      ),
    }));
  }

  function updateThreshold(index: number, value: string) {
    setConfig((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) =>
        levelIndex === index
          ? { ...level, xpThreshold: Math.max(0, numberFromInput(value, level.xpThreshold)) }
          : level,
      ),
    }));
  }

  function updateLevelName(index: number, name: string) {
    setConfig((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) =>
        levelIndex === index ? { ...level, name } : level,
      ),
    }));
  }

  function addLevel() {
    setConfig((current) => {
      const previous = current.levels.at(-1);
      return {
        ...current,
        levels: [...current.levels, {
          level: current.levels.length + 1,
          name: `Новый уровень ${current.levels.length + 1}`,
          xpThreshold: (previous?.xpThreshold ?? 0) + 500,
        }],
      };
    });
  }

  function removeLastLevel() {
    setConfig((current) => current.levels.length <= Math.max(1, maxLockedLevel)
      ? current
      : { ...current, levels: current.levels.slice(0, -1) });
  }

  function saveSettings() {
    setToast(null);
    startMutation(async () => {
      const result = await saveReputationConfigurationAction(config);
      setToast({
        id: `reputation-save-${Date.now()}`,
        tone: result.error ? "error" : "success",
        text: result.error ?? result.success ?? "Настройки сохранены.",
      });
    });
  }

  function enableSystem() {
    setConfirmation(null);
    setToast(null);
    startMutation(async () => {
      const result = await enableReputationAction(config);
      if (!result.error) setStatus("initializing");
      setToast({
        id: `reputation-enable-${Date.now()}`,
        tone: result.error ? "error" : "success",
        text: result.error ?? result.success ?? "Расчёт запущен.",
      });
    });
  }

  function disableSystem() {
    setConfirmation(null);
    setToast(null);
    startMutation(async () => {
      const result = await disableReputationAction();
      if (!result.error) setStatus("disabled");
      setToast({
        id: `reputation-disable-${Date.now()}`,
        tone: result.error ? "error" : "success",
        text: result.error ?? result.success ?? "Система приостановлена.",
      });
    });
  }

  function updateTrusted(
    field: keyof Omit<ReputationPreviewConfig["trusted"], "autoPromotionEnabled">,
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      trusted: {
        ...current.trusted,
        [field]: Math.max(field === "trustPoints" || field === "level" ? 1 : 0, numberFromInput(value, current.trusted[field])),
      },
    }));
  }

  return (
    <>
      <AdminToasts messages={toast ? [toast] : []} />
      <div className="grid gap-5">
        {section === "levels" ? <SettingsSection
          icon={<SlidersHorizontal className="size-4" />}
          title="Уровни"
          description="Пороги и XP используются только для расчёта уровня и сами по себе не меняют права автора."
        >
          <div className="grid gap-5">
            <div className="flex gap-2 border-b border-stone-200 pb-3" role="tablist" aria-label="Настройки уровней">
              <Button
                role="tab"
                aria-selected={levelTab === "xp"}
                aria-controls="level-xp-panel"
                size="sm"
                variant={levelTab === "xp" ? "default" : "ghost"}
                onClick={() => setLevelTab("xp")}
              >
                XP за действия
              </Button>
              <Button
                role="tab"
                aria-selected={levelTab === "thresholds"}
                aria-controls="level-thresholds-panel"
                size="sm"
                variant={levelTab === "thresholds" ? "default" : "ghost"}
                onClick={() => setLevelTab("thresholds")}
              >
                Пороги уровней
              </Button>
            </div>

            {levelTab === "xp" ? <div id="level-xp-panel" role="tabpanel">
              <div className="mt-3 grid gap-3 md:hidden">
                {config.rules.map((rule) => (
                  <div key={rule.actionCode} className="rounded-md border border-stone-200 p-3">
                    <div className="mb-3 text-sm font-medium text-stone-800">
                      {REPUTATION_ACTION_LABELS[rule.actionCode]}
                    </div>
                    <Label className="grid gap-2">
                      <span>XP</span>
                      <Input
                        type="number"
                        min={0}
                        value={rule.xp}
                        onChange={(event) => updateRule(rule.actionCode, "xp", event.currentTarget.value)}
                      />
                    </Label>
                  </div>
                ))}
              </div>
              <TableWrap className="mt-3 hidden overflow-hidden md:block">
                <Table>
                  <THead><tr><TH>Действие</TH><TH className="w-40">XP</TH></tr></THead>
                  <TBody>
                    {config.rules.map((rule) => (
                      <TR key={rule.actionCode}>
                        <TD className="font-medium text-stone-800">{REPUTATION_ACTION_LABELS[rule.actionCode]}</TD>
                        <TD>
                          <Input
                            aria-label={`XP: ${REPUTATION_ACTION_LABELS[rule.actionCode]}`}
                            type="number"
                            min={0}
                            value={rule.xp}
                            onChange={(event) => updateRule(rule.actionCode, "xp", event.currentTarget.value)}
                          />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </div> : null}

            {levelTab === "thresholds" ? <div id="level-thresholds-panel" role="tabpanel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm leading-6 text-stone-500">
                  Названия можно менять в любое время. XP-пороги достигнутых уровней заблокированы, новые уровни добавляются только сверху. У первого уровня порог всегда равен 0 XP.
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={addLevel}><Plus />Добавить уровень</Button>
                  <Button type="button" size="sm" variant="outline" disabled={config.levels.length <= Math.max(1, maxLockedLevel)} onClick={removeLastLevel}>Убрать верхний</Button>
                </div>
              </div>
              <TableWrap className="mt-3 overflow-hidden">
                <Table>
                  <THead>
                    <tr>
                      <TH className="w-32">Уровень</TH>
                      <TH>Название</TH>
                      <TH>Порог XP</TH>
                      <TH className="w-40">Состояние</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {config.levels.map((item, index) => {
                      const isAchievedLocked = item.level <= maxLockedLevel;
                      const isThresholdLocked = item.level === 1 || isAchievedLocked;
                      return (
                        <TR key={item.level}>
                          <TD className="font-medium text-stone-800">Уровень {item.level}</TD>
                          <TD>
                            <Input
                              aria-label={`Название уровня ${item.level}`}
                              maxLength={80}
                              value={item.name}
                              onChange={(event) => updateLevelName(index, event.currentTarget.value)}
                            />
                          </TD>
                          <TD>
                            <Input
                              aria-label={`Порог XP для уровня ${item.level}`}
                              className="max-w-48"
                              type="number"
                              min={index === 0 ? 0 : config.levels[index - 1].xpThreshold + 1}
                              disabled={isThresholdLocked}
                              value={item.xpThreshold}
                              onChange={(event) => updateThreshold(index, event.currentTarget.value)}
                            />
                          </TD>
                          <TD>
                            <Badge variant={isAchievedLocked ? "default" : "outline"}>
                              {isThresholdLocked ? "Порог заблокирован" : "Можно изменить"}
                            </Badge>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            </div> : null}
          </div>
        </SettingsSection> : null}

        {section === "trust" ? <SettingsSection
          icon={<ShieldCheck className="size-4" />}
          title="Доверие"
          description="Доверие показывает подтверждённый опыт автора в работе с каталогом и считается независимо от XP."
        >
          <div className="grid gap-5">
            <div className="flex gap-2 border-b border-stone-200 pb-3" role="tablist" aria-label="Настройки доверия">
              <Button
                role="tab"
                aria-selected={trustTab === "actions"}
                aria-controls="trust-actions-panel"
                size="sm"
                variant={trustTab === "actions" ? "default" : "ghost"}
                onClick={() => setTrustTab("actions")}
              >
                Доверие за действия
              </Button>
              <Button
                role="tab"
                aria-selected={trustTab === "parameters"}
                aria-controls="trust-parameters-panel"
                size="sm"
                variant={trustTab === "parameters" ? "default" : "ghost"}
                onClick={() => setTrustTab("parameters")}
              >
                Параметры Trusted
              </Button>
            </div>

            {trustTab === "actions" ? <div id="trust-actions-panel" role="tabpanel">
              <div className="grid gap-3 md:hidden">
              {config.rules.map((rule) => (
                <div key={rule.actionCode} className="rounded-md border border-stone-200 p-3">
                  <div className="mb-3 text-sm font-medium text-stone-800">
                    {REPUTATION_ACTION_LABELS[rule.actionCode]}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm text-stone-600">
                      <input
                        type="checkbox"
                        checked={rule.countsTowardTrust}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setConfig((current) => ({
                            ...current,
                            rules: current.rules.map((item) => item.actionCode === rule.actionCode
                              ? { ...item, countsTowardTrust: checked }
                              : item),
                          }));
                        }}
                      />
                      Учитывать в доверии
                    </label>
                    <Label className="grid gap-2">
                      <span>Баллы доверия</span>
                      <Input
                        type="number"
                        min={1}
                        disabled={!rule.countsTowardTrust}
                        value={rule.trustPoints}
                        onChange={(event) => updateRule(rule.actionCode, "trustPoints", event.currentTarget.value)}
                      />
                    </Label>
                  </div>
                </div>
              ))}
              </div>
              <TableWrap className="hidden overflow-hidden md:block">
                <Table>
                  <THead>
                    <tr><TH>Действие</TH><TH className="w-44">Учитывать</TH><TH className="w-36">Баллы</TH></tr>
                  </THead>
                  <TBody>
                    {config.rules.map((rule) => (
                      <TR key={rule.actionCode}>
                        <TD className="font-medium text-stone-800">{REPUTATION_ACTION_LABELS[rule.actionCode]}</TD>
                        <TD>
                          <label className="flex items-center gap-2 text-sm text-stone-600">
                            <input
                              type="checkbox"
                              checked={rule.countsTowardTrust}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setConfig((current) => ({
                                  ...current,
                                  rules: current.rules.map((item) => item.actionCode === rule.actionCode
                                    ? { ...item, countsTowardTrust: checked }
                                    : item),
                                }));
                              }}
                            />
                            Учитывать
                          </label>
                        </TD>
                        <TD>
                          <Input
                            aria-label={`Баллы доверия: ${REPUTATION_ACTION_LABELS[rule.actionCode]}`}
                            type="number"
                            min={1}
                            disabled={!rule.countsTowardTrust}
                            value={rule.trustPoints}
                            onChange={(event) => updateRule(rule.actionCode, "trustPoints", event.currentTarget.value)}
                          />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
              <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={config.trusted.autoPromotionEnabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setConfig((current) => ({
                      ...current,
                      trusted: { ...current.trusted, autoPromotionEnabled: checked },
                    }));
                  }}
                />
                Автоматически назначать профиль Trusted подходящим авторам
              </label>
            </div> : null}

            {trustTab === "parameters" ? <div id="trust-parameters-panel" role="tabpanel" className="grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Label className="grid content-start gap-2 rounded-md border border-stone-200 p-3">
                <span>Минимальный уровень</span>
                <Input type="number" min={1} max={config.levels.length} value={config.trusted.level} onChange={(event) => updateTrusted("level", event.currentTarget.value)} />
                <span className="text-xs font-normal leading-5 text-stone-500">
                  Требуемый уровень накопленного вклада. Сам по себе уровень не выдаёт никаких прав.
                </span>
              </Label>
              <Label className="grid content-start gap-2 rounded-md border border-stone-200 p-3">
                <span>Минимальное доверие</span>
                <Input type="number" min={1} value={config.trusted.trustPoints} onChange={(event) => updateTrusted("trustPoints", event.currentTarget.value)} />
                <span className="text-xs font-normal leading-5 text-stone-500">
                  Минимум баллов за успешные действия автора, учитываемые правилами доверия.
                </span>
              </Label>
              <Label className="grid content-start gap-2 rounded-md border border-stone-200 p-3">
                <span>Approval rate, %</span>
                <Input type="number" min={0} max={100} value={config.trusted.approvalRatePercent} onChange={(event) => updateTrusted("approvalRatePercent", event.currentTarget.value)} />
                <span className="text-xs font-normal leading-5 text-stone-500">
                  Минимальная доля успешных исходов: успешные ÷ (успешные + отклонённые).
                </span>
              </Label>
              <Label className="grid content-start gap-2 rounded-md border border-stone-200 p-3">
                <span>Возраст истории, дней</span>
                <Input type="number" min={0} value={config.trusted.historyDays} onChange={(event) => updateTrusted("historyDays", event.currentTarget.value)} />
                <span className="text-xs font-normal leading-5 text-stone-500">
                  Сколько дней должно пройти с первого учитываемого действия автора.
                </span>
                </Label>
              </div>
            </div> : null}

            <aside className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              <div className="font-medium">Как работает доверие</div>
              <p className="mt-1">
                Доверие начисляется только за подтверждённые действия с флагом «Учитывать». Эти же действия формируют approval rate. Количество баллов всегда положительное — минимум 1.
              </p>
              <p className="mt-1 text-sky-800">
                По умолчанию учитывается работа с каталогом: публикация записей, создание серий и изменение связей. Отключённые действия не дают доверия независимо от указанного количества баллов.
              </p>
            </aside>
          </div>
        </SettingsSection> : null}

        <SettingsSection
          icon={<Eye className="size-4" />}
          title="Запуск"
          description="Предпросмотр читает текущие данные и учитывает несохранённые значения выше, но ничего не записывает в базу."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-2xl text-sm leading-6 text-stone-500">
              <p>Результат не является снимком: новые действия авторов могут изменить цифры между расчётами.</p>
              <p className="mt-1">Состояние: <strong className="text-stone-800">{status === "enabled" ? "включена" : status === "initializing" ? "идёт первичный расчёт" : "выключена"}</strong>{enabledAt ? ` · первый запуск ${new Date(enabledAt).toLocaleDateString("ru-RU")}` : ""}</p>
              {status === "initializing" ? <a className="underline" href="/admin/tools/jobs/journal">Открыть журнал задач</a> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isMutationPending || status === "initializing"} onClick={saveSettings}><Save />Сохранить</Button>
              <Button type="button" variant="outline" disabled={isMutationPending} onClick={() => { setHasPreviewed(true); setIsPreviewOpen(true); }}><Eye />Предпросмотр результатов</Button>
              {status === "enabled" ? (
                <Button type="button" variant="outline" disabled={isMutationPending} onClick={() => setConfirmation("disable")}>Приостановить</Button>
              ) : (
                <Button type="button" disabled={isMutationPending || status === "initializing"} onClick={() => setConfirmation("enable")}>{status === "initializing" ? "Расчёт запущен" : "Включить систему"}</Button>
              )}
            </div>
          </div>
        </SettingsSection>
      </div>

      {isPreviewOpen ? (
        <ReputationPreviewModal config={config} onClose={closePreview} />
      ) : null}
      {confirmation === "enable" ? (
        <ConfirmDialog
          description={`Настройки будут сохранены, после чего запустится исторический расчёт для всех авторов. Условия Trusted: уровень от ${config.trusted.level}, доверие от ${config.trusted.trustPoints}, approval rate от ${config.trusted.approvalRatePercent}%, история от ${config.trusted.historyDays} дней.${hasPreviewed ? " Предпросмотр в этой сессии выполнен." : " Предпросмотр в этой сессии ещё не выполнялся."}`}
          onClose={() => setConfirmation(null)}
          title="Включить уровни и доверие?"
        >
          <Button disabled={isMutationPending} onClick={enableSystem} type="button">
            Включить систему
          </Button>
        </ConfirmDialog>
      ) : null}
      {confirmation === "disable" ? (
        <ConfirmDialog
          description="Новые начисления будут приостановлены. Уже рассчитанные XP, уровни, доверие и история действий сохранятся."
          onClose={() => setConfirmation(null)}
          title="Приостановить систему?"
        >
          <Button disabled={isMutationPending} onClick={disableSystem} type="button" variant="destructive">
            Приостановить
          </Button>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function ReputationPreviewModal({
  config,
  onClose,
}: {
  config: ReputationPreviewConfig;
  onClose: () => void;
}) {
  const titleId = useId();
  const [result, setResult] = useState<ReputationPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState<PreviewQuery>(INITIAL_PREVIEW_QUERY);
  const [cursorHistory, setCursorHistory] = useState<ReputationPreviewActionInput["cursor"][]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const isLoading = isInitialLoading || isPending;

  const requestPreview = useCallback(({
    cursor = null,
    nextPageIndex = 0,
    nextQuery,
    nextHistory = [null],
  }: {
    cursor?: ReputationPreviewActionInput["cursor"];
    nextHistory?: ReputationPreviewActionInput["cursor"][];
    nextPageIndex?: number;
    nextQuery: PreviewQuery;
  }) => {
    setError(null);
    startTransition(async () => {
      const response = await previewReputationAction({ config, cursor, ...nextQuery });
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(response.data);
      setCursorHistory(nextHistory);
      setPageIndex(nextPageIndex);
    });
  }, [config]);

  useEffect(() => {
    let active = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    void previewReputationAction({ config, cursor: null, ...INITIAL_PREVIEW_QUERY })
      .then((response) => {
        if (!active) return;
        if (response.error) setError(response.error);
        else setResult(response.data);
      })
      .catch(() => {
        if (active) setError("Не удалось рассчитать предпросмотр. Попробуй ещё раз.");
      })
      .finally(() => {
        if (active) setIsInitialLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [config, onClose]);

  function changeQuery(nextQuery: PreviewQuery) {
    setQuery(nextQuery);
    requestPreview({ nextQuery });
  }

  function goNext() {
    if (!result?.nextCursor) return;
    const nextHistory = [...cursorHistory.slice(0, pageIndex + 1), result.nextCursor];
    requestPreview({
      cursor: result.nextCursor,
      nextHistory,
      nextPageIndex: pageIndex + 1,
      nextQuery: query,
    });
  }

  function goPrevious() {
    if (pageIndex === 0) return;
    const previousIndex = pageIndex - 1;
    requestPreview({
      cursor: cursorHistory[previousIndex] ?? null,
      nextHistory: cursorHistory,
      nextPageIndex: previousIndex,
      nextQuery: query,
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-2 sm:p-4">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="Закрыть предпросмотр" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-4 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-stone-950">Предпросмотр уровней и доверия</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">Расчёт только читает данные и использует текущие значения формы.</p>
          </div>
          <Button autoFocus type="button" variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <PreviewFilters
            config={config}
            isPending={isLoading}
            query={query}
            onChange={changeQuery}
            onRefresh={() => requestPreview({ cursor: cursorHistory[pageIndex] ?? null, nextHistory: cursorHistory, nextPageIndex: pageIndex, nextQuery: query })}
          />

          {error ? (
            <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="font-medium">Расчёт не выполнен</div>
              <p className="mt-1 leading-6">{error}</p>
              <Button className="mt-3" type="button" size="sm" variant="outline" onClick={() => requestPreview({ nextQuery: query })}>
                Попробовать снова
              </Button>
            </div>
          ) : null}

          {isLoading && !result ? (
            <div className="mt-5 flex min-h-48 items-center justify-center gap-3 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-600">
              <LoaderCircle className="size-5 animate-spin" />
              Считаем вклад текущих авторов…
            </div>
          ) : result ? (
            <div className={isLoading ? "pointer-events-none opacity-60" : undefined} aria-busy={isLoading}>
              <PreviewSummary result={result} />
              {result.rows.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
                  По выбранным фильтрам авторов нет.
                </div>
              ) : (
                <>
                  <PreviewRows rows={result.rows} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-stone-500">Страница {pageIndex + 1} · показано {result.rows.length}</span>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={pageIndex === 0 || isLoading} onClick={goPrevious}>
                        <ChevronLeft />Назад
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={!result.hasMore || isLoading} onClick={goNext}>
                        Далее<ChevronRight />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PreviewFilters({
  config,
  isPending,
  onChange,
  onRefresh,
  query,
}: {
  config: ReputationPreviewConfig;
  isPending: boolean;
  onChange: (query: PreviewQuery) => void;
  onRefresh: () => void;
  query: PreviewQuery;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-4 lg:grid-cols-[minmax(10rem,1fr)_10rem_10rem_8rem_auto_auto] lg:items-end">
      <Label className="grid gap-2">
        <span>Сортировка</span>
        <Select value={query.sort} disabled={isPending} onChange={(event) => onChange({ ...query, sort: event.currentTarget.value as ReputationPreviewSort })}>
          {REPUTATION_PREVIEW_SORTS.map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}
        </Select>
      </Label>
      <Label className="grid gap-2">
        <span>Направление</span>
        <Select value={query.direction} disabled={isPending} onChange={(event) => onChange({ ...query, direction: event.currentTarget.value as ReputationPreviewDirection })}>
          <option value="desc">По убыванию</option>
          <option value="asc">По возрастанию</option>
        </Select>
      </Label>
      <Label className="grid gap-2">
        <span>Уровень</span>
        <Select value={query.level ?? "all"} disabled={isPending} onChange={(event) => onChange({ ...query, level: event.currentTarget.value === "all" ? null : Number(event.currentTarget.value) })}>
          <option value="all">Все уровни</option>
          {config.levels.map((item) => <option key={item.level} value={item.level}>Уровень {item.level}</option>)}
        </Select>
      </Label>
      <Label className="grid gap-2">
        <span>Строк</span>
        <Select value={query.pageSize} disabled={isPending} onChange={(event) => onChange({ ...query, pageSize: Number(event.currentTarget.value) as 25 | 50 })}>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </Select>
      </Label>
      <label className="flex h-10 items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={query.onlyCandidates} disabled={isPending} onChange={(event) => onChange({ ...query, onlyCandidates: event.currentTarget.checked })} />
        Только Trusted
      </label>
      <Button type="button" variant="outline" disabled={isPending} onClick={onRefresh}>
        {isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        Пересчитать
      </Button>
    </div>
  );
}

function PreviewSummary({ result }: { result: ReputationPreviewResult }) {
  const summary = result.summary;
  const calculatedAt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(summary.calculatedAt));
  return (
    <section className="mt-5" aria-label="Сводка расчёта">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <SummaryMetric label="Авторов" value={summary.authorsCount} />
        <SummaryMetric label="Максимум XP" value={summary.maxXp} />
        <SummaryMetric label="Макс. уровень" value={summary.maxLevel} />
        <SummaryMetric label="Средний уровень" value={summary.averageLevel.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} />
        <SummaryMetric label="Медианный уровень" value={summary.medianLevel} />
        <SummaryMetric label="Кандидатов Trusted" value={summary.candidatesCount} tone="positive" />
        <SummaryMetric label="Мало истории" value={summary.insufficientHistoryCount} tone={summary.insufficientHistoryCount > 0 ? "warning" : "default"} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Distribution title="По уровням" items={summary.levelDistribution.map((item) => ({ label: `L${item.level}`, authors: item.authors }))} />
        <Distribution title="По доверию" items={summary.trustDistribution.map((item) => ({ label: String(item.points), authors: item.authors }))} />
      </div>
      {summary.warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-medium">Ограничения исторических данных</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
            {summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-stone-500">Рассчитано: {calculatedAt}</p>
    </section>
  );
}

function SummaryMetric({ label, tone = "default", value }: { label: string; tone?: "default" | "positive" | "warning"; value: number | string }) {
  const toneClass = tone === "positive" ? "border-emerald-200 bg-emerald-50" : tone === "warning" ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white";
  return <div className={`rounded-md border p-3 ${toneClass}`}><div className="text-xs text-stone-500">{label}</div><div className="mt-1 text-xl font-semibold text-stone-950">{value}</div></div>;
}

function Distribution({ title, items }: { title: string; items: Array<{ authors: number; label: string }> }) {
  const visibleItems = items.slice(0, 20);
  return (
    <div className="rounded-md border border-stone-200 bg-white p-3">
      <div className="text-xs font-medium text-stone-500">{title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {visibleItems.length > 0 ? visibleItems.map((item) => <Badge key={item.label} variant="outline">{item.label}: {item.authors}</Badge>) : <span className="text-xs text-stone-400">Нет данных</span>}
        {items.length > visibleItems.length ? <Badge variant="outline">ещё {items.length - visibleItems.length}</Badge> : null}
      </div>
    </div>
  );
}

function PreviewRows({ rows }: { rows: ReputationPreviewRow[] }) {
  return (
    <>
      <div className="mt-5 grid gap-3 lg:hidden">
        {rows.map((row) => <PreviewAuthorCard key={row.authorId} row={row} />)}
      </div>
      <TableWrap className="mt-5 hidden overflow-x-auto lg:block">
        <Table className="min-w-[108rem] whitespace-nowrap">
          <THead>
            <tr>
              <TH>Автор</TH><TH>Оценки</TH><TH>Записи</TH><TH>Серии</TH><TH>Связи</TH><TH>Удаления</TH><TH>Рецензии</TH><TH>Багрепорты</TH><TH>Успешные</TH><TH>Отклонённые</TH><TH>XP</TH><TH>Уровень</TH><TH>Доверие</TH><TH>Approval rate</TH><TH>История</TH><TH>Trusted</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.authorId}>
                <TD><div className="font-medium text-stone-900">{row.authorName}</div><div className="text-xs text-stone-500">{row.authorCode}</div></TD>
                <TD>{row.ratings}</TD><TD>{row.mediaItems}</TD><TD>{row.createdSeries}</TD><TD>{row.linkedSeries}</TD><TD>{row.removedSeriesLinks}</TD><TD>{row.reviews}</TD><TD>{row.bugReports}</TD><TD>{row.successfulOutcomes}</TD><TD>{row.rejectedOutcomes}</TD><TD className="font-medium">{row.xp}</TD><TD>{row.level}</TD><TD>{row.trustPoints}</TD><TD>{formatApprovalRate(row.approvalRate)}</TD><TD>{formatHistory(row)}</TD><TD><TrustedBadge value={row.wouldBecomeTrusted} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </>
  );
}

function PreviewAuthorCard({ row }: { row: ReputationPreviewRow }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-medium text-stone-950">{row.authorName}</h3><p className="mt-0.5 text-xs text-stone-500">{row.authorCode}</p></div>
        <TrustedBadge value={row.wouldBecomeTrusted} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <Metric label="XP" value={row.xp} /><Metric label="Уровень" value={row.level} /><Metric label="Доверие" value={row.trustPoints} />
        <Metric label="Успешные / отклонённые" value={`${row.successfulOutcomes} / ${row.rejectedOutcomes}`} /><Metric label="Approval rate" value={formatApprovalRate(row.approvalRate)} /><Metric label="История" value={formatHistory(row)} />
      </dl>
      <div className="mt-4 border-t border-stone-100 pt-3 text-xs leading-5 text-stone-500">
        Оценки: {row.ratings} · записи: {row.mediaItems} · серии: {row.createdSeries} · связи: {row.linkedSeries} · удаления: {row.removedSeriesLinks} · рецензии: {row.reviews} · багрепорты: {row.bugReports}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-0.5 font-medium text-stone-800">{value}</dd></div>;
}

function TrustedBadge({ value }: { value: boolean }) {
  return <Badge variant={value ? "positive" : "outline"}>{value ? "Получит Trusted" : "Нет"}</Badge>;
}

function formatApprovalRate(value: number | null) {
  return value === null ? "Недостаточно данных" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function formatHistory(row: ReputationPreviewRow) {
  return row.firstQualifyingActionAt ? `${row.historyDays} дн.` : "Нет данных";
}
