import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Вход" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Вход в систему</h1>
      <p className="mb-6 text-sm text-muted">
        Аккаунты выдаёт организатор турнира. Чтобы смотреть результаты, вход не нужен.
      </p>
      <LoginForm next={next} />
    </div>
  );
}
