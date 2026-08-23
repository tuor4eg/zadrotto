import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { BUG_REPORT_DESCRIPTION_MAX_LENGTH, BUG_REPORT_URL_MAX_LENGTH } from "@/lib/bug-reports/model";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { PageHeader } from "../../admin-ui";
import { createAdminBugReportAction } from "../actions";
import { ManualBugReportAuthorPicker } from "./author-picker";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Проверь пользователя, описание, страницу и начальный статус.",
  "invalid-author": "Выбранный пользователь недоступен для назначения багрепорта.",
  save: "Не удалось создать багрепорт.",
};

export default async function NewAdminBugReportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const toastMessages = error
    ? [{ id: "error", tone: "error" as const, text: ERROR_MESSAGES[error] ?? ERROR_MESSAGES.save }]
    : [] satisfies AdminToast[];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новый багрепорт"
        description="Добавь сообщение, полученное от пользователя через другой канал связи."
        aside={(
          <Link href="/admin/bug-reports" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Назад
          </Link>
        )}
      />

      <Card className="mt-5">
        <CardContent className="pt-5">
          <form action={createAdminBugReportAction} className="grid gap-5" noValidate>
            <AdminToasts clearParams={["error"]} messages={toastMessages} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="bug-report-author">Пользователь</Label>
              <ManualBugReportAuthorPicker id="bug-report-author" name="authorId" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bug-report-description">Описание</Label>
              <Textarea
                id="bug-report-description"
                name="description"
                maxLength={BUG_REPORT_DESCRIPTION_MAX_LENGTH}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bug-report-url">Страница</Label>
              <Input
                id="bug-report-url"
                name="url"
                maxLength={BUG_REPORT_URL_MAX_LENGTH}
                placeholder="/media/example"
              />
              <p className="text-sm text-stone-500">Необязательно. Если оставить пустым, сохранится «/».</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bug-report-status">Начальный статус</Label>
              <Select id="bug-report-status" name="initialStatus" defaultValue="confirmed" required>
                <option value="confirmed">Подтверждённый</option>
                <option value="new">Новый</option>
              </Select>
            </div>

            <div>
              <Button type="submit">
                <Save />
                Создать багрепорт
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
