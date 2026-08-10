import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
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

export function FriendshipControls({ compact = false, returnTo, state, targetId }: {
  compact?: boolean;
  returnTo: string;
  state: FriendshipViewState;
  targetId: number;
}) {
  const size = compact ? "sm" : "default";
  if (state === "self") return <Link href="/author/profile" className={buttonVariants({ variant: "outline", size })}>Настройки профиля</Link>;
  if (state === "none") return <Form action={sendFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" size={size}>Добавить в друзья</Button></Form>;
  if (state === "outgoing") return <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-stone-600">Заявка отправлена</span><Form action={cancelFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="outline" size={size}>Отменить</Button></Form></div>;
  if (state === "incoming") return <div className="flex flex-wrap gap-2"><Form action={acceptFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="positive" size={size}>Принять</Button></Form><Form action={declineFriendRequestAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="outline" size={size}>Отклонить</Button></Form></div>;
  return <div className="flex flex-wrap items-center gap-2"><Form action={removeFriendAction} returnTo={returnTo} targetId={targetId}><Button type="submit" variant="destructive" size={size}>Удалить из друзей</Button></Form></div>;
}
