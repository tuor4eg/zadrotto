import type { EmailOutboxTemplate } from "@/lib/auth/author-account-model";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function renderAuthorEmail(input: {
  template: EmailOutboxTemplate;
  payload: Record<string, unknown>;
  siteUrl: string;
}) {
  const token = typeof input.payload.token === "string" ? input.payload.token : "";
  const paths: Partial<Record<EmailOutboxTemplate, string>> = {
    verify_email: `/author/verify-email#token=${encodeURIComponent(token)}`,
    reset_password: `/author/reset-password?token=${encodeURIComponent(token)}`,
  };
  const copy: Record<EmailOutboxTemplate, { subject: string; body: string }> = {
    verify_email: { subject: "Подтверди email", body: "Подтверди email, чтобы завершить настройку аккаунта." },
    reset_password: { subject: "Восстановление пароля", body: "Открой ссылку, чтобы задать новый пароль." },
    email_changed: { subject: "Email аккаунта изменён", body: "Email для входа в аккаунт был изменён." },
    registration_approved: { subject: "Регистрация одобрена", body: "Твоя заявка автора одобрена. Теперь можно войти." },
    registration_rejected: { subject: "Заявка рассмотрена", body: "Заявка автора не была одобрена." },
  };
  const content = copy[input.template];
  const path = paths[input.template];
  const link = path ? new URL(path, input.siteUrl).toString() : null;
  const text = link ? `${content.body}\n\n${link}` : content.body;
  const html = `<p>${escapeHtml(content.body)}</p>${link ? `<p><a href="${escapeHtml(link)}">Продолжить</a></p>` : ""}`;
  return { subject: content.subject, text, html };
}
