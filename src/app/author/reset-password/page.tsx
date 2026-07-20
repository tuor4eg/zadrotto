import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { resetAuthorPasswordAction } from "./actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="archive-page min-h-screen px-4 py-12"><form action={resetAuthorPasswordAction} className="archive-paper mx-auto grid max-w-md gap-3 rounded-md border p-6"><h1 className="font-serif text-3xl">Новый пароль</h1><input type="hidden" name="token" value={token} /><Label htmlFor="password">Новый пароль</Label><PasswordField id="password" name="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /><Button type="submit">Сохранить пароль</Button></form></main>;
}
