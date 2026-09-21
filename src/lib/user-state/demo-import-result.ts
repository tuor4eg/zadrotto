export type DemoImportSummary = {
  importedRatings: number
  importedStatuses: number
  skippedConflicts: number
  skippedUnavailable: number
}

export type DemoImportPresentation = {
  clearLocalProfile: boolean
  text: string | null
  tone: "success" | "error"
}

export function presentDemoImportResult(
  result: DemoImportSummary,
): DemoImportPresentation {
  const imported = result.importedRatings + result.importedStatuses

  if (result.skippedUnavailable > 0) {
    const importedText = imported > 0
      ? `Перенесено: ${imported}. `
      : ""
    return {
      clearLocalProfile: false,
      text: `${importedText}Не удалось перенести: ${result.skippedUnavailable}. Локальная история сохранена.`,
      tone: "error",
    }
  }

  if (imported === 0 && result.skippedConflicts === 0) {
    return { clearLocalProfile: true, text: null, tone: "success" }
  }

  const conflictText = result.skippedConflicts > 0
    ? ` Уже сохранено в аккаунте: ${result.skippedConflicts}.`
    : ""
  return {
    clearLocalProfile: true,
    text: `История перенесена в профиль: ${imported}.${conflictText}`,
    tone: "success",
  }
}
