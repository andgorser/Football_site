"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticate, endSession, startSession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Введите email"),
  password: z.string().min(1, "Введите пароль"),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    // Скрытого поля next нет, когда на страницу входа зашли сами, а не были
    // на неё переброшены. formData.get вернёт null, а схема ждёт «строку или
    // ничего» — поэтому null приводим к undefined.
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте введённые данные" };
  }

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) return { error: "Неверный email или пароль" };

  await startSession(user);

  // Куда отправить после входа: туда, откуда пришли, иначе — в свой раздел.
  const fallback =
    user.role === "ADMIN"
      ? "/admin"
      : user.role === "REFEREE"
        ? "/referee"
        : user.role === "CAPTAIN"
          ? "/captain"
          : "/";

  const target = parsed.data.next?.startsWith("/") ? parsed.data.next : fallback;
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
