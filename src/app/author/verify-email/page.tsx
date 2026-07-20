import { Button } from "@/components/ui/button";
import { verifyAuthorEmailAction } from "./actions";

export default async function VerifyAuthorEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="archive-page min-h-screen px-4 py-12"><form action={verifyAuthorEmailAction} className="archive-paper mx-auto grid max-w-md gap-4 rounded-md border p-6"><h1 className="font-serif text-3xl">Подтверждение email</h1><p className="text-sm text-stone-600">Нажми кнопку, чтобы подтвердить адрес. Ссылка сработает только один раз.</p><input type="hidden" name="token" value={token} /><Button type="submit" disabled={!token}>Подтвердить email</Button></form></main>;
}
