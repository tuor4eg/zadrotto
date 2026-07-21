import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminEmailOutbox, getEmailOutboxStatusCounts } from "@/db/queries/email-outbox";
import { EMAIL_OUTBOX_STATUSES, EMAIL_OUTBOX_TEMPLATES, type EmailOutboxStatus, type EmailOutboxTemplate } from "@/lib/auth/author-account-model";
import { retryEmailOutboxAction } from "./actions";
import { EmailQueueFilters } from "./email-queue-filters";
import { ActivityLogTime } from "../../activity/activity-log-time";

const STATUS_LABELS = { pending: "Ожидает", sending: "Отправляется", sent: "Отправлено", failed: "Ошибка" } as const;
const TEMPLATE_LABELS: Record<EmailOutboxTemplate, string> = { verify_email: "Подтверждение email", reset_password: "Сброс пароля", email_changed: "Email изменён", registration_approved: "Регистрация одобрена", registration_rejected: "Регистрация отклонена" };

export default async function EmailQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [25, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 25;
  const status = EMAIL_OUTBOX_STATUSES.includes(query.status as EmailOutboxStatus) ? query.status as EmailOutboxStatus : null;
  const template = EMAIL_OUTBOX_TEMPLATES.includes(query.template as EmailOutboxTemplate) ? query.template as EmailOutboxTemplate : null;
  const [result, counts] = await Promise.all([getAdminEmailOutbox({ page, pageSize, status, template }), getEmailOutboxStatusCounts()]);
  const href = (targetPage: number) => `/admin/tools/email/queue?page=${targetPage}&pageSize=${pageSize}${status ? `&status=${status}` : ""}${template ? `&template=${template}` : ""}`;
  return <section className="space-y-5"><div><h2 className="font-serif text-3xl">Очередь</h2><p className="text-sm text-stone-600">Системные письма без содержимого и секретных данных.</p></div>
    {query.error ? <Alert variant="destructive">Не удалось повторить отправку.</Alert> : query.retried !== undefined ? <Alert>Возвращено в очередь: {query.retried}.</Alert> : null}
    <div className="flex flex-wrap gap-2">{counts.map((item) => <Badge key={item.status} variant="outline">{STATUS_LABELS[item.status as EmailOutboxStatus] ?? item.status}: {item.count}</Badge>)}</div>
    <EmailQueueFilters pageSize={pageSize} status={status} template={template} />
    {result.items.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-stone-500">Писем по выбранным фильтрам нет.</div> : <TableWrap className="overflow-x-auto"><Table><THead><tr><TH>ID</TH><TH>Шаблон / получатель</TH><TH>Статус</TH><TH>Попытки</TH><TH>Создано / следующий запуск</TH><TH>Отправлено / ошибка</TH><TH /></tr></THead><TBody>{result.items.map((item) => <TR key={item.id}><TD>{item.id}</TD><TD><div>{TEMPLATE_LABELS[item.template as EmailOutboxTemplate] ?? item.template}</div><div className="text-xs text-stone-500">{item.recipient}</div></TD><TD>{STATUS_LABELS[item.status as EmailOutboxStatus] ?? item.status}</TD><TD>{item.attempts}</TD><TD><div><ActivityLogTime value={item.createdAt.toISOString()} /></div><div className="text-xs"><ActivityLogTime value={item.nextAttemptAt.toISOString()} /></div></TD><TD><div>{item.sentAt ? <ActivityLogTime value={item.sentAt.toISOString()} /> : "—"}</div>{item.lastError ? <div className="max-w-64 break-words text-xs text-red-700">{item.lastError}</div> : null}</TD><TD>{item.status === "failed" ? <form action={retryEmailOutboxAction}><input type="hidden" name="id" value={item.id} /><Button type="submit" size="sm" variant="outline">Повторить</Button></form> : null}</TD></TR>)}</TBody></Table></TableWrap>}
    <div className="flex items-center justify-between"><Link className={buttonVariants({ variant: "outline" })} aria-disabled={result.page <= 1} href={href(Math.max(1, result.page - 1))}>Назад</Link><span className="text-sm">Страница {result.page} из {result.totalPages}</span><Link className={buttonVariants({ variant: "outline" })} aria-disabled={result.page >= result.totalPages} href={href(Math.min(result.totalPages, result.page + 1))}>Вперёд</Link></div>
  </section>;
}
