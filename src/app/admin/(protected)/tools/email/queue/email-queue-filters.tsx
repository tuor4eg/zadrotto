"use client";

import { useRef } from "react";

import { Select } from "@/components/ui/form";
import {
  EMAIL_OUTBOX_STATUSES,
  EMAIL_OUTBOX_TEMPLATES,
  type EmailOutboxStatus,
  type EmailOutboxTemplate,
} from "@/lib/auth/author-account-model";

const STATUS_LABELS: Record<EmailOutboxStatus, string> = {
  pending: "Ожидает",
  sending: "Отправляется",
  sent: "Отправлено",
  failed: "Ошибка",
};

const TEMPLATE_LABELS: Record<EmailOutboxTemplate, string> = {
  verify_email: "Подтверждение email",
  reset_password: "Сброс пароля",
  email_changed: "Email изменён",
  registration_approved: "Регистрация одобрена",
  registration_rejected: "Регистрация отклонена",
};

export function EmailQueueFilters({
  pageSize,
  status,
  template,
}: {
  pageSize: number;
  status: EmailOutboxStatus | null;
  template: EmailOutboxTemplate | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} className="grid grid-cols-3 gap-2">
      <Select aria-label="Статус" name="status" defaultValue={status ?? ""} onChange={submit}>
        <option value="">Все статусы</option>
        {EMAIL_OUTBOX_STATUSES.map((value) => (
          <option key={value} value={value}>{STATUS_LABELS[value]}</option>
        ))}
      </Select>
      <Select aria-label="Шаблон" name="template" defaultValue={template ?? ""} onChange={submit}>
        <option value="">Все шаблоны</option>
        {EMAIL_OUTBOX_TEMPLATES.map((value) => (
          <option key={value} value={value}>{TEMPLATE_LABELS[value]}</option>
        ))}
      </Select>
      <Select aria-label="Писем на странице" name="pageSize" defaultValue={String(pageSize)} onChange={submit}>
        {[25, 50, 100].map((value) => <option key={value} value={value}>{value} на странице</option>)}
      </Select>
    </form>
  );
}
