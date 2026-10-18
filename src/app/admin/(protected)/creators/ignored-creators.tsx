import { getCreatorExclusions } from "@/db/queries/creator-requests";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "../admin-ui";
import { reopenCreatorAction } from "./actions";

function ReopenCreatorForm({ exclusionId }: { exclusionId: number }) {
  return <form action={reopenCreatorAction}>
    <input type="hidden" name="exclusionId" value={exclusionId} />
    <Button type="submit" variant="outline" size="sm">Вернуть на апрув</Button>
  </form>;
}

export async function IgnoredCreators() {
  const exclusions = await getCreatorExclusions();
  if (!exclusions.length) return <EmptyState>Игнорируемых значений нет.</EmptyState>;
  return <section aria-label="Игнорируемые значения" className="grid gap-3">
    <div className="grid gap-3 md:hidden">
      {exclusions.map(value => <article key={value.id} className="grid gap-2 rounded-lg border border-stone-200 bg-white p-4">
        <span className="break-words font-medium">{value.externalCreatorName}</span>
        <p className="break-words text-sm text-stone-500">{value.provider}</p>
        {value.externalCreatorId ? <p className="break-all font-mono text-xs text-stone-500">ID {value.externalCreatorId}</p> : null}
        <ReopenCreatorForm exclusionId={value.id} />
      </article>)}
    </div>
    <TableWrap className="hidden md:block">
      <Table>
        <THead><TR><TH>Имя</TH><TH>Провайдер</TH><TH>ID провайдера</TH><TH>Действия</TH></TR></THead>
        <TBody>{exclusions.map(value => <TR key={value.id}>
          <TD><span className="break-words font-medium">{value.externalCreatorName}</span></TD>
          <TD>{value.provider}</TD>
          <TD className="break-all font-mono text-xs">{value.externalCreatorId ?? "—"}</TD>
          <TD><ReopenCreatorForm exclusionId={value.id} /></TD>
        </TR>)}</TBody>
      </Table>
    </TableWrap>
  </section>;
}
