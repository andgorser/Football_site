"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MatchStatus } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { EVENT_LABEL, isClockRunning, isPlayed, scoreFromEvents } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { propagateAfterResult } from "@/server/playoff";

/**
 * Серверные действия для ведения протокола матча.
 *
 * Каждое действие само проверяет права — полагаться только на middleware
 * нельзя: он смотрит лишь на путь и роль в токене, но не знает, назначен ли
 * этот судья именно на этот матч.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

// ───────────────────────────── Общие помощники ──────────────────────────────

async function loadEditableMatch(matchId: number) {
  const session = await getCurrentUser();
  if (!session) return { ok: false as const, error: "Нужно войти в систему" };

  // Роль и активность читаем из базы, а не из токена: токен живёт неделю,
  // и отключённый организатором судья иначе продолжал бы писать протоколы.
  const [actor, match] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, fullName: true, role: true, isActive: true },
    }),
    prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        refereeId: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        clockOffsetSec: true,
        periodStartedAt: true,
        tournament: { select: { halfDurationMin: true } },
      },
    }),
  ]);

  if (!actor || !actor.isActive) return { ok: false as const, error: "Аккаунт отключён" };
  if (actor.role !== "ADMIN" && actor.role !== "REFEREE") {
    return { ok: false as const, error: "Вести протокол могут только судья и организатор" };
  }
  if (!match) return { ok: false as const, error: "Матч не найден" };

  return { ok: true as const, user: { ...session, fullName: actor.fullName }, match };
}

/** Пересчитывает счёт матча по его событиям. */
async function recalcScore(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { homeTeamId: true, awayTeamId: true, status: true },
  });
  if (!match) return;
  // Пока участники плей-офф не определились, счёта у матча быть не может
  if (match.homeTeamId === null || match.awayTeamId === null) return;

  const events = await prisma.matchEvent.findMany({
    where: { matchId },
    select: { type: true, tournamentTeamId: true },
  });

  const score = scoreFromEvents(events, match.homeTeamId, match.awayTeamId);

  // У ещё не начатого матча счёта быть не должно — иначе «0:0» ошибочно
  // выглядел бы как сыгранная нулевая ничья.
  const shouldHaveScore = match.status !== "SCHEDULED" || events.length > 0;

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeScore: shouldHaveScore ? score.home : null,
      awayScore: shouldHaveScore ? score.away : null,
    },
  });
}

async function audit(
  userId: string,
  action: string,
  entity: string,
  entityId: string | number,
  summary: string,
  payload?: unknown,
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId: String(entityId),
      summary,
      payload: payload === undefined ? undefined : JSON.parse(JSON.stringify(payload)),
    },
  });
}

function revalidateMatch(matchId: number) {
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/referee/${matchId}`);
  revalidatePath("/referee");
  revalidatePath("/");
  revalidatePath("/stats");
  revalidatePath("/tournaments", "layout");
  revalidatePath("/teams", "layout");
}

/** Сколько секунд «натикало» к текущему моменту. */
function elapsedSeconds(match: {
  status: MatchStatus;
  clockOffsetSec: number;
  periodStartedAt: Date | null;
}): number {
  if (!isClockRunning(match.status) || !match.periodStartedAt) return match.clockOffsetSec;
  return match.clockOffsetSec + Math.floor((Date.now() - match.periodStartedAt.getTime()) / 1000);
}

// ───────────────────────────── Управление матчем ────────────────────────────

const statusSchema = z.enum([
  "SCHEDULED",
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
  "FINISHED",
  "POSTPONED",
  "CANCELLED",
  "WALKOVER",
]);

/**
 * Переводит матч в новый статус и правильно двигает игровые часы:
 * при паузе накопленное время сохраняется, при старте тайма отсчёт
 * начинается с фиксированной отметки (30' или 45' — по регламенту турнира).
 */
export async function setMatchStatus(
  matchId: number,
  nextStatus: z.infer<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(nextStatus);
  if (!parsed.success) return fail("Неизвестный статус матча");

  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);
  const { match, user } = loaded;

  const half = match.tournament.halfDurationMin * 60;
  const status = parsed.data;

  let clockOffsetSec = elapsedSeconds(match);
  let periodStartedAt: Date | null = null;

  switch (status) {
    case "FIRST_HALF":
      // Старт матча — часы с нуля; если тайм возобновляют, offset сохраняем.
      clockOffsetSec = match.status === "SCHEDULED" ? 0 : clockOffsetSec;
      periodStartedAt = new Date();
      break;
    case "HALF_TIME":
      // Перерыв: часы стоят, показываем ровно длину тайма.
      clockOffsetSec = Math.max(clockOffsetSec, half);
      break;
    case "SECOND_HALF":
      clockOffsetSec = Math.max(clockOffsetSec, half);
      periodStartedAt = new Date();
      break;
    case "EXTRA_TIME":
      clockOffsetSec = Math.max(clockOffsetSec, half * 2);
      periodStartedAt = new Date();
      break;
    case "PENALTY_SHOOTOUT":
    case "FINISHED":
    case "POSTPONED":
    case "CANCELLED":
    case "WALKOVER":
      break;
    case "SCHEDULED":
      clockOffsetSec = 0;
      break;
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { status, clockOffsetSec, periodStartedAt },
  });

  await recalcScore(matchId);
  // Откат статуса тоже важен: он может «расколдовать» уже заполненный слот
  await propagateAfterResult(matchId);
  await audit(user.id, "match.status", "Match", matchId, `Статус матча → ${status}`, { status });
  revalidateMatch(matchId);
  return ok;
}

/**
 * Судья берёт матч на себя.
 *
 * Перехватить матч у другого судьи можно — за пять минут до игры это обычное
 * дело. Но прежний судья попадает в журнал, поэтому подмена не остаётся
 * незамеченной, а в интерфейсе перед этим спрашивают подтверждение.
 */
export async function claimMatch(matchId: number): Promise<ActionResult> {
  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);
  const { user, match } = loaded;

  if (match.refereeId === user.id) return ok; // уже наш — повторное нажатие безвредно

  const previous = match.refereeId
    ? await prisma.user.findUnique({
        where: { id: match.refereeId },
        select: { fullName: true },
      })
    : null;

  await prisma.match.update({ where: { id: matchId }, data: { refereeId: user.id } });
  await audit(
    user.id,
    "match.referee.claim",
    "Match",
    matchId,
    `${user.fullName} взял матч${previous ? ` (был назначен ${previous.fullName})` : ""}`,
    { previousRefereeId: match.refereeId, newRefereeId: user.id },
  );

  revalidateMatch(matchId);
  revalidatePath("/admin/matches");
  return ok;
}

const noteSchema = z.string().trim().max(300);

/**
 * Комментарий к матчу: причина переноса, спорный момент, замечание.
 *
 * Переносить матч по времени может только организатор, но судья на поле
 * должен иметь возможность объяснить, что случилось, — иначе организатор
 * увидит статус «перенесён» без единого слова о причине.
 */
export async function setMatchNote(matchId: number, note: string): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return fail("Комментарий не длиннее 300 символов");

  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);

  await prisma.match.update({
    where: { id: matchId },
    data: { notes: parsed.data || null },
  });
  await audit(
    loaded.user.id,
    "match.note",
    "Match",
    matchId,
    parsed.data ? `Комментарий: ${parsed.data}` : "Комментарий удалён",
  );

  revalidateMatch(matchId);
  revalidatePath("/admin/matches");
  return ok;
}

/** Судья снимает себя с матча — если взял его по ошибке. */
export async function releaseMatch(matchId: number): Promise<ActionResult> {
  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);
  const { user, match } = loaded;

  if (match.refereeId !== user.id) {
    return fail("Снять с матча можно только себя");
  }

  await prisma.match.update({ where: { id: matchId }, data: { refereeId: null } });
  await audit(user.id, "match.referee.release", "Match", matchId, `${user.fullName} снялся с матча`);

  revalidateMatch(matchId);
  revalidatePath("/admin/matches");
  return ok;
}

const shootoutSchema = z.object({
  home: z.coerce.number().int().min(0).max(50),
  away: z.coerce.number().int().min(0).max(50),
});

export async function setShootoutScore(
  matchId: number,
  values: { home: number; away: number },
): Promise<ActionResult> {
  const parsed = shootoutSchema.safeParse(values);
  if (!parsed.success) return fail("Некорректный счёт серии пенальти");

  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeShootoutScore: parsed.data.home,
      awayShootoutScore: parsed.data.away,
    },
  });
  // Серия пенальти определяет победителя, значит двигает сетку
  await propagateAfterResult(matchId);
  await audit(
    loaded.user.id,
    "match.shootout",
    "Match",
    matchId,
    `Серия пенальти ${parsed.data.home}:${parsed.data.away}`,
  );
  revalidateMatch(matchId);
  return ok;
}

// ───────────────────────────── События матча ────────────────────────────────

const eventSchema = z.object({
  type: z.enum([
    "GOAL",
    "PENALTY_GOAL",
    "OWN_GOAL",
    "PENALTY_MISSED",
    "YELLOW_CARD",
    "SECOND_YELLOW_CARD",
    "RED_CARD",
    "SUBSTITUTION",
  ]),
  tournamentTeamId: z.coerce.number().int(),
  minute: z.coerce.number().int().min(0).max(150),
  extraMinute: z.coerce.number().int().min(0).max(30).nullable().optional(),
  playerId: z.coerce.number().int().nullable().optional(),
  assistPlayerId: z.coerce.number().int().nullable().optional(),
  relatedPlayerId: z.coerce.number().int().nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

export type EventInput = z.input<typeof eventSchema>;

/** Проверяет, что игрок действительно заявлен за указанную команду. */
async function assertRosterBelongs(
  ids: (number | null | undefined)[],
  tournamentTeamId: number,
): Promise<boolean> {
  const filtered = ids.filter((id): id is number => typeof id === "number");
  if (filtered.length === 0) return true;
  const count = await prisma.rosterEntry.count({
    where: { id: { in: filtered }, tournamentTeamId },
  });
  return count === new Set(filtered).size;
}

export async function addMatchEvent(
  matchId: number,
  input: EventInput,
): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Некорректные данные");

  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);
  const { match, user } = loaded;

  const data = parsed.data;
  if (data.tournamentTeamId !== match.homeTeamId && data.tournamentTeamId !== match.awayTeamId) {
    return fail("Эта команда не играет в данном матче");
  }
  if (
    !(await assertRosterBelongs(
      [data.playerId, data.assistPlayerId, data.relatedPlayerId],
      data.tournamentTeamId,
    ))
  ) {
    return fail("Игрок не заявлен за эту команду");
  }
  if (data.playerId && data.playerId === data.assistPlayerId) {
    return fail("Игрок не может отдать пас сам себе");
  }
  if (data.type === "SUBSTITUTION" && (!data.playerId || !data.relatedPlayerId)) {
    return fail("Для замены нужно указать обоих игроков");
  }

  const event = await prisma.matchEvent.create({
    data: {
      matchId,
      type: data.type,
      minute: data.minute,
      extraMinute: data.extraMinute || null,
      tournamentTeamId: data.tournamentTeamId,
      playerId: data.playerId ?? null,
      assistPlayerId: data.assistPlayerId ?? null,
      relatedPlayerId: data.relatedPlayerId ?? null,
      note: data.note || null,
      createdById: user.id,
    },
  });

  // Вышедший на замену автоматически попадает в состав на матч — вместе
  // со снимком номера и позиции, как и при обычном сохранении состава.
  if (data.type === "SUBSTITUTION" && data.playerId) {
    const entry = await prisma.rosterEntry.findUnique({
      where: { id: data.playerId },
      select: { shirtNumber: true, position: true },
    });
    await prisma.matchLineup.upsert({
      where: { matchId_rosterEntryId: { matchId, rosterEntryId: data.playerId } },
      create: {
        matchId,
        rosterEntryId: data.playerId,
        isStarting: false,
        shirtNumber: entry?.shirtNumber ?? null,
        position: entry?.position ?? null,
      },
      update: {},
    });
  }

  await recalcScore(matchId);
  if (isPlayed(match.status)) await propagateAfterResult(matchId);
  await audit(
    user.id,
    "event.create",
    "MatchEvent",
    event.id,
    `${EVENT_LABEL[data.type]}, ${data.minute}'`,
    data,
  );
  revalidateMatch(matchId);
  return ok;
}

export async function updateMatchEvent(
  eventId: number,
  input: EventInput,
): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Некорректные данные");

  const existing = await prisma.matchEvent.findUnique({
    where: { id: eventId },
    select: { matchId: true },
  });
  if (!existing) return fail("Событие не найдено");

  const loaded = await loadEditableMatch(existing.matchId);
  if (!loaded.ok) return fail(loaded.error);
  const { match, user } = loaded;

  const data = parsed.data;
  if (data.tournamentTeamId !== match.homeTeamId && data.tournamentTeamId !== match.awayTeamId) {
    return fail("Эта команда не играет в данном матче");
  }
  if (
    !(await assertRosterBelongs(
      [data.playerId, data.assistPlayerId, data.relatedPlayerId],
      data.tournamentTeamId,
    ))
  ) {
    return fail("Игрок не заявлен за эту команду");
  }
  if (data.playerId && data.playerId === data.assistPlayerId) {
    return fail("Игрок не может отдать пас сам себе");
  }

  await prisma.matchEvent.update({
    where: { id: eventId },
    data: {
      type: data.type,
      minute: data.minute,
      extraMinute: data.extraMinute || null,
      tournamentTeamId: data.tournamentTeamId,
      playerId: data.playerId ?? null,
      assistPlayerId: data.assistPlayerId ?? null,
      relatedPlayerId: data.relatedPlayerId ?? null,
      note: data.note || null,
    },
  });

  await recalcScore(existing.matchId);
  if (isPlayed(match.status)) await propagateAfterResult(existing.matchId);
  await audit(user.id, "event.update", "MatchEvent", eventId, "Событие изменено", data);
  revalidateMatch(existing.matchId);
  return ok;
}

export async function deleteMatchEvent(eventId: number): Promise<ActionResult> {
  const existing = await prisma.matchEvent.findUnique({
    where: { id: eventId },
    select: { matchId: true, type: true, minute: true },
  });
  if (!existing) return fail("Событие не найдено");

  const loaded = await loadEditableMatch(existing.matchId);
  if (!loaded.ok) return fail(loaded.error);

  await prisma.matchEvent.delete({ where: { id: eventId } });
  await recalcScore(existing.matchId);
  if (isPlayed(loaded.match.status)) await propagateAfterResult(existing.matchId);
  await audit(
    loaded.user.id,
    "event.delete",
    "MatchEvent",
    eventId,
    `Удалено: ${EVENT_LABEL[existing.type]}, ${existing.minute}'`,
  );
  revalidateMatch(existing.matchId);
  return ok;
}

// ───────────────────────────── Составы ──────────────────────────────────────

const lineupSchema = z.object({
  starting: z.array(z.coerce.number().int()),
  bench: z.array(z.coerce.number().int()),
});

/** Сохраняет состав одной команды на матч: стартовый и запасные. */
export async function saveLineup(
  matchId: number,
  tournamentTeamId: number,
  input: { starting: number[]; bench: number[] },
): Promise<ActionResult> {
  const parsed = lineupSchema.safeParse(input);
  if (!parsed.success) return fail("Некорректный состав");

  const loaded = await loadEditableMatch(matchId);
  if (!loaded.ok) return fail(loaded.error);
  const { match, user } = loaded;

  if (tournamentTeamId !== match.homeTeamId && tournamentTeamId !== match.awayTeamId) {
    return fail("Эта команда не играет в данном матче");
  }

  const all = [...parsed.data.starting, ...parsed.data.bench];
  if (!(await assertRosterBelongs(all, tournamentTeamId))) {
    return fail("В составе есть игроки, не заявленные за эту команду");
  }
  if (parsed.data.starting.length > 11) {
    return fail("В стартовом составе не может быть больше 11 игроков");
  }

  const teamRoster = await prisma.rosterEntry.findMany({
    where: { tournamentTeamId },
    select: { id: true, shirtNumber: true, position: true },
  });
  const rosterById = new Map(teamRoster.map((r) => [r.id, r]));

  await prisma.$transaction([
    // Убираем из состава только игроков этой команды, чужой состав не трогаем
    prisma.matchLineup.deleteMany({
      where: { matchId, rosterEntryId: { in: teamRoster.map((r) => r.id) } },
    }),
    prisma.matchLineup.createMany({
      data: all.map((rosterEntryId) => ({
        matchId,
        rosterEntryId,
        isStarting: parsed.data.starting.includes(rosterEntryId),
        shirtNumber: rosterById.get(rosterEntryId)?.shirtNumber ?? null,
        position: rosterById.get(rosterEntryId)?.position ?? null,
      })),
    }),
  ]);

  await audit(
    user.id,
    "lineup.save",
    "Match",
    matchId,
    `Состав сохранён: ${parsed.data.starting.length} в старте, ${parsed.data.bench.length} в запасе`,
  );
  revalidateMatch(matchId);
  return ok;
}
