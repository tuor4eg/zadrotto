"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit3, Trash2 } from "lucide-react";

import { FranchiseDuplicateCheck } from "@/components/franchise-duplicate-check";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input, Label } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { createFranchiseChildAction, deleteFranchiseChildAction, moveFranchiseChildAction } from "../../actions";
import { ChildPicker } from "./child-picker";

type ChildCandidate = { id: number; title: string; path: string; originalTitle: string | null };
type Descendant = { id: number; code: string; title: string; mediaItemsCount: number; children: Descendant[] };

function DescendantTable({ franchiseId, nodes }: { franchiseId: number; nodes: Descendant[] }) {
  const rows: Array<Descendant & { level: number }> = [];
  const collect = (items: Descendant[], level: number) => {
    items.forEach((item) => {
      rows.push({ ...item, level });
      collect(item.children, level + 1);
    });
  };

  collect(nodes, 0);

  return (
    <TableWrap>
      <Table className="table-fixed">
        <THead>
          <tr>
            <TH>Название</TH>
            <TH className="w-20">Записи</TH>
            <TH className="w-28 px-2 text-right">Действия</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((node) => {
            const canDelete = node.mediaItemsCount === 0 && node.children.length === 0;

            return (
              <TR key={node.id}>
                <TD className="min-w-0 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${node.level * 1.25}rem` }}>
                    <span aria-hidden="true" className="shrink-0 text-stone-400">↳</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-950">{node.title}</div>
                    </div>
                  </div>
                </TD>
                <TD><Badge variant="outline">{node.mediaItemsCount}</Badge></TD>
                <TD className="px-2">
                  <div className="flex flex-nowrap justify-end gap-1.5">
                    <Tooltip label="Изменить">
                      <Link
                        href={`/admin/series/${node.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "icon" })}
                        aria-label={`Изменить серию ${node.title}`}
                      >
                        <Edit3 />
                      </Link>
                    </Tooltip>
                    <Tooltip label={canDelete ? "Удалить" : "Нельзя удалить: есть записи или дочерние серии"}>
                      <ConfirmAction
                        action={deleteFranchiseChildAction}
                        fields={[{ name: "parentId", value: franchiseId }, { name: "franchiseId", value: node.id }]}
                        title="Удалить серию?"
                        description={`Серия «${node.title}» будет удалена.`}
                        triggerLabel="Удалить"
                        triggerAriaLabel={`Удалить серию ${node.title}`}
                        triggerIcon={<Trash2 />}
                        triggerSize="icon"
                        confirmLabel="Удалить"
                        disabled={!canDelete}
                        className="shrink-0"
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
  );
}

export function FranchiseChildrenTab({
  candidates,
  descendants,
  errorMessage,
  franchiseId,
  successMessage,
}: {
  candidates: ChildCandidate[];
  descendants: Descendant[];
  errorMessage?: string | null;
  franchiseId: number;
  successMessage?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);

  return <div className="grid gap-5">
    {successMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{successMessage}</p> : null}
    {errorMessage ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{errorMessage}</p> : null}
    <Card><CardHeader><CardTitle className="text-base">Текущие потомки</CardTitle></CardHeader><CardContent>{descendants.length > 0 ? <DescendantTable franchiseId={franchiseId} nodes={descendants} /> : <p className="text-sm text-stone-500">У этой серии пока нет потомков.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Перенести существующую серию</CardTitle></CardHeader><CardContent>
      <form action={moveFranchiseChildAction} className="grid gap-3"><input type="hidden" name="parentId" value={franchiseId} /><Label htmlFor="child-id">Серия</Label><ChildPicker options={candidates} /><Button type="submit" className="w-fit">Перенести в эту ветку</Button></form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Создать дочернюю серию</CardTitle></CardHeader><CardContent>
      <form action={createFranchiseChildAction} className="grid gap-4"><input type="hidden" name="parentId" value={franchiseId} /><div className="grid gap-2"><Label htmlFor="child-title">Название</Label><Input id="child-title" name="title" required value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="child-original-title">Оригинальное название</Label><Input id="child-original-title" name="originalTitle" value={originalTitle} onChange={(event) => setOriginalTitle(event.target.value)} /></div><FranchiseDuplicateCheck title={title} originalTitle={originalTitle} onBlockedChange={setDuplicateBlocked} /><div className="grid gap-2"><Label htmlFor="child-description">Описание</Label><textarea id="child-description" name="description" rows={4} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></div><Button type="submit" disabled={duplicateBlocked} className="w-fit">Создать дочернюю серию</Button></form>
    </CardContent></Card>
  </div>;
}
