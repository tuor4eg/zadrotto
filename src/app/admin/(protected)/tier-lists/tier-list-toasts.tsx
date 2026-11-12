import { AdminToasts, type AdminToast } from "../admin-toasts";

export function TierListToasts({ error, saved }: { error?: string; saved?: string }) {
  const messages: AdminToast[] = [
    ...(error ? [{ id: `tier-list-error-${error}`, tone: "error" as const, text: error }] : []),
    ...(saved === "1" ? [{ id: "tier-list-saved", tone: "success" as const, text: "Изменения сохранены." }] : []),
  ];

  return <AdminToasts clearParams={["error", "saved"]} messages={messages} />;
}
