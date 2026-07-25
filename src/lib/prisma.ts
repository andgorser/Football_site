import { PrismaClient } from "@prisma/client";

// В режиме разработки Next.js перезагружает модули на каждое изменение файла.
// Без этого кэша мы бы плодили десятки подключений к базе и быстро упёрлись
// в лимит соединений PostgreSQL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
