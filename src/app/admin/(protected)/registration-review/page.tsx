import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { getPendingAuthorRegistrations } from "@/db/queries/author-auth";
import { EmptyState, PageHeader } from "../admin-ui";
import { reviewAuthorRegistrationAction } from "./actions";

export default async function RegistrationReviewPage() {
  const [registrations, profiles] = await Promise.all([
    getPendingAuthorRegistrations(),
    getAuthorAccessProfiles({ assignableOnly: true }),
  ]);
  return <div className="space-y-6">
    <PageHeader title="Регистрации авторов" description="Подтверждённые email, ожидающие решения администратора." />
    {registrations.length === 0 ? <EmptyState>Новых заявок нет.</EmptyState> : (
      <TableWrap><Table><THead><TR><TH>Автор</TH><TH>Логин</TH><TH>Email</TH><TH>Решение</TH></TR></THead><TBody>
        {registrations.map((item) => <TR key={item.authorId}>
          <TD>{item.authorName}</TD><TD>{item.login}</TD><TD>{item.email}</TD><TD>
            <form action={reviewAuthorRegistrationAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="authorId" value={item.authorId} />
              <Select name="accessProfileId" defaultValue={item.accessProfileId} className="w-48">
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </Select>
              <Button type="submit" name="decision" value="approve" size="sm" variant="positive">Одобрить</Button>
              <Button type="submit" name="decision" value="reject" size="sm" variant="destructive">Отклонить</Button>
            </form>
          </TD>
        </TR>)}
      </TBody></Table></TableWrap>
    )}
  </div>;
}
