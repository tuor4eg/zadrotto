import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { forgotAuthorPasswordAction } from "./actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; unavailable?: string }> }) {
  const { sent, unavailable } = await searchParams;
  return <main className="archive-page min-h-screen px-4 py-12"><div className="archive-paper mx-auto max-w-md rounded-md border p-6"><h1 className="font-serif text-3xl">Восстановление пароля</h1>{sent ? <p className="mt-4">Если аккаунт найден, письмо уже отправлено.</p> : unavailable ? <p className="mt-4">Восстановление временно недоступно. Попробуй позже.</p> : <form action={forgotAuthorPasswordAction} className="mt-5 grid gap-3"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /><Button type="submit">Отправить ссылку</Button></form>}</div></main>;
}
