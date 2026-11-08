import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { forgotAuthorPasswordAction } from "./actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; unavailable?: string; notFound?: string; retryAfter?: string }> }) {
  const { sent, unavailable, notFound, retryAfter } = await searchParams;
  const retryAfterSeconds = Math.min(3600, Math.max(0, Math.ceil(Number(retryAfter) || 0)));
  return <main className="archive-page min-h-screen px-4 py-12"><div className="archive-paper mx-auto max-w-md rounded-md border p-6"><h1 className="font-serif text-3xl">Восстановление пароля</h1>{sent ? <p className="mt-4">Письмо со ссылкой для восстановления пароля отправлено.</p> : unavailable ? <p className="mt-4">Восстановление временно недоступно. Попробуй позже.</p> : <form action={forgotAuthorPasswordAction} className="mt-5 grid gap-3">{retryAfterSeconds > 0 ? <p role="alert" className="text-sm text-amber-800">Слишком много попыток. Попробуй через {retryAfterSeconds} сек.</p> : null}{notFound ? <p role="alert" className="text-sm text-amber-800">Пользователь с таким email не найден. Проверь адрес или зарегистрируйся.</p> : null}<Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /><Button type="submit">Отправить ссылку</Button></form>}</div></main>;
}
