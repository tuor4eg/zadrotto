import { UserPlus, UserMinus, UserCheck, X } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { Button } from "@/components/ui/button";
import type { FriendshipViewState } from "@/lib/friends/model";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction,
  sendFriendRequestAction,
} from "./actions";

function Form({ action, children, returnTo, targetId }: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  returnTo: string;
  targetId: number;
}) {
  return <form action={action}><input type="hidden" name="targetId" value={targetId} /><input type="hidden" name="returnTo" value={returnTo} />{children}</form>;
}

export function FriendshipControls({ compact = false, iconOnly = false, returnTo, state, targetId }: {
  compact?: boolean;
  iconOnly?: boolean;
  returnTo: string;
  state: FriendshipViewState;
  targetId: number;
}) {
  const size = compact ? "sm" : "default";
  if (state === "self") return null;
  if (iconOnly) {
    const actions = state === "none"
      ? [{ action: sendFriendRequestAction, label: "Добавить в друзья", description: "Отправить заявку в друзья?", icon: <UserPlus />, destructive: false }]
      : state === "friends"
        ? [{ action: removeFriendAction, label: "Удалить из друзей", description: "Удалить пользователя из друзей?", icon: <UserMinus />, destructive: true }]
        : state === "outgoing"
          ? [{ action: cancelFriendRequestAction, label: "Отменить заявку", description: "Отменить отправленную заявку в друзья?", icon: <X />, destructive: true }]
          : [
              { action: acceptFriendRequestAction, label: "Принять заявку", description: "Добавить пользователя в друзья?", icon: <UserCheck />, destructive: false },
              { action: declineFriendRequestAction, label: "Отклонить заявку", description: "Отклонить заявку в друзья?", icon: <X />, destructive: true },
            ];
    return <>{actions.map((item) => (
      <ArchiveTooltip key={item.label} label={item.label} portal>
        <ConfirmAction action={item.action} title={item.label} description={item.description}
          confirmLabel={item.label} confirmVariant={item.destructive ? "destructive" : "positive"}
          triggerLabel={item.label} triggerAriaLabel={item.label} triggerIcon={item.icon}
          triggerSize="icon" triggerVariant="outline"
          fields={[{ name: "targetId", value: targetId }, { name: "returnTo", value: returnTo }]} />
      </ArchiveTooltip>
    ))}</>;
  }

  if (state === "none") return <Form action={sendFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" size={size}>Добавить в друзья</Button></Form>;
  if (state === "outgoing") return <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-stone-600">Заявка отправлена</span><Form action={cancelFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="outline" size={size}>Отменить</Button></Form></div>;
  if (state === "incoming") return <div className="flex flex-wrap gap-2"><Form action={acceptFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="positive" size={size}>Принять</Button></Form><Form action={declineFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="outline" size={size}>Отклонить</Button></Form></div>;
  return <div className="flex flex-wrap items-center gap-2"><Form action={removeFriendAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="destructive" size={size}>Удалить из друзей</Button></Form></div>;
}
