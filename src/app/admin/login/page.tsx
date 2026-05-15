import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogIn } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { getAdminFormErrorMessage } from "@/lib/app-error-messages";
import { loginAdmin } from "./actions";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const adminUser = await getCurrentAdminUser();

  if (adminUser) {
    redirect("/admin");
  }

  const { error } = await searchParams;
  const errorMessage =
    getAdminFormErrorMessage(error) ??
    (error === "invalid" ? "Неверный логин или пароль." : null);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#ece9e2_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col justify-center gap-6">
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft />
          К архиву
        </Link>

        <Card>
          <CardHeader>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">Админка</p>
            <CardTitle className="text-3xl">Вход</CardTitle>
            <CardDescription>Внутренний доступ к управлению архивом.</CardDescription>
          </CardHeader>

          <CardContent>
          <form action={loginAdmin} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-login">Логин</Label>
              <Input
                id="admin-login"
                name="login"
                type="text"
                autoComplete="username"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-password">Пароль</Label>
              <Input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {errorMessage ? (
              <Alert variant="destructive">{errorMessage}</Alert>
            ) : null}

            <Button
              type="submit"
            >
              <LogIn />
              Войти
            </Button>
          </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
