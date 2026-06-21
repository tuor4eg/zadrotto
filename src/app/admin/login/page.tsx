import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";
import { AdminLoginForm } from "./admin-login-form";

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
    (error === "invalid"
      ? "Неверный логин или пароль."
      : error === "rate-limit"
        ? "Слишком много попыток входа. Попробуй позже."
        : error === "rate-limit-unavailable"
          ? "Вход временно недоступен. Попробуй позже."
          : null);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#ece9e2_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col justify-center gap-6">
        <Link
          href="/"
          className={`${buttonVariants({ variant: "ghost", size: "sm" })} max-sm:hidden`}
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
            <AdminLoginForm errorMessage={errorMessage} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
