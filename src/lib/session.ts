import { SignJWT, jwtVerify } from "jose";

// Этот файл не должен зависеть от Prisma и bcrypt: он используется в middleware,
// который выполняется в edge-окружении без доступа к Node.js-модулям.

export const SESSION_COOKIE = "msu_football_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // неделя

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "REFEREE" | "CAPTAIN" | "VIEWER";
  teamId: string | null;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Не задана переменная окружения AUTH_SECRET. Скопируйте .env.example в .env и заполните её.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.id !== "string" || typeof payload.role !== "string") return null;
    return {
      id: payload.id,
      email: String(payload.email ?? ""),
      fullName: String(payload.fullName ?? ""),
      role: payload.role as SessionUser["role"],
      teamId: (payload.teamId as string | null) ?? null,
    };
  } catch {
    // Просроченный, повреждённый или подделанный токен — всё это «нет сессии».
    return null;
  }
}

export const sessionMaxAge = SESSION_TTL_SECONDS;
