import { Badge } from "@/components/ui/badge";
export const creatorRequestStatusLabels = { pending: "Ожидает решения", applying: "Применяется", processed: "Обработано", failed: "Ошибка применения" };
export function CreatorRequestStatus({ status }: { status: keyof typeof creatorRequestStatusLabels }) {
  return <Badge variant={status === "failed" ? "destructive" : "outline"}>{creatorRequestStatusLabels[status]}</Badge>;
}
