import "server-only";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  sessionMaxAge,
  signSession,
  verifySession,
  type SessionUser,
} from "@/lib/session";

export type { SessionUser };

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Проверяет логин и пароль. Возвращает null, не уточняя, что именно неверно. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.isActive) {
    // Всё равно считаем хэш, чтобы по времени ответа нельзя было понять,
    // существует такой email в базе или нет.
    await bcrypt.compare(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    teamId: user.teamId,
  };
}

export async function startSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Текущий пользователь или null. Безопасно вызывать на любой странице. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Требует любого авторизованного пользователя, иначе — на страницу входа. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  return user;
}

/** Требует одну из ролей. ADMIN проходит везде. */
export async function requireRole(roles: Role[], returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "ADMIN" && !roles.includes(user.role)) redirect("/403");
  return user;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "ADMIN";
}

/**
 * Может ли пользователь вести протокол матча.
 *
 * Сознательно НЕ проверяем назначение: в студенческой лиге судью меняют
 * за пять минут до игры, и упереться в «вы не назначены» посреди поля хуже,
 * чем разрешить лишнее. Подотчётность обеспечивает журнал: каждое действие
 * подписано автором, а чужой матч в интерфейсе явно помечен.
 */
export function canEditMatch(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "REFEREE";
}

/** Назначен ли пользователь судьёй именно этого матча — только для пометок в интерфейсе. */
export function isAssignedReferee(
  user: SessionUser | null,
  match: { refereeId: string | null },
): boolean {
  return !!user && !!match.refereeId && match.refereeId === user.id;
}
