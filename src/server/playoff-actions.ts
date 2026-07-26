"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MatchSlotSource } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { fromDateTimeInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { resolvePlayoffSlots, type SlotReport } from "@/server/playoff";

/**
 * Конструктор сетки плей-офф: создание и правка матчей, у которых вместо
 * команды указан источник участника. Права — только у организатора.
 */

export type FormState = { error?: string; message?: string };

const fail = (error: string): FormState => ({ error });
const done = (message: string): FormState => ({ message });

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function audit(userId: string, action: string, entityId: string | number, summary: string) {
  await prisma.auditLog.create({
    data: { userId, action, entity: "Match", entityId: String(entityId), summary },
  });
}

function revalidateBracket(tournamentId: number) {
  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  revalidatePath("/admin/matches");
  revalidatePath("/tournaments", "layout");
  revalidatePath("/");
}

const slotSchema = z.object({
  source: z.enum(["TEAM", "DIVISION_PLACE", "MATCH_WINNER", "MATCH_LOSER"]),
  teamId: z.string().optional(),
  divisionId: z.string().optional(),
  place: z.string().optional(),
  matchId: z.string().optional(),
  label: z.string().trim().max(80).optional(),
});

const playoffMatchSchema = z.object({
  stage: z.enum([
    "PRELIMINARY",
    "ROUND_OF_32",
    "ROUND_OF_16",
    "QUARTER_FINAL",
    "SEMI_FINAL",
    "THIRD_PLACE",
    "FINAL",
  ]),
  bracketOrder: z.coerce.number().int().min(0).max(999).default(0),
  kickoffAt: z.string().min(1, "Укажите дату и время"),
  venueId: z.string().optional(),
  refereeId: z.string().optional(),
});

type SlotInput = z.infer<typeof slotSchema>;

function readSlot(formData: FormData, side: "home" | "away") {
  return slotSchema.safeParse({
    source: formData.get(`${side}Source`),
    teamId: formData.get(`${side}TeamId`),
    divisionId: formData.get(`${side}DivisionId`),
    place: formData.get(`${side}Place`),
    matchId: formData.get(`${side}MatchId`),
    label: formData.get(`${side}Label`),
  });
}

/** Не образуется ли цикл, если matchId начнёт зависеть от sourceId. */
async function createsCycle(matchId: number | null, sourceId: number): Promise<boolean> {
  if (!matchId) return false;
  if (matchId === sourceId) return true;

  let currentIds = [sourceId];
  for (let depth = 0; depth < 32 && currentIds.length > 0; depth++) {
    const rows = await prisma.match.findMany({
      where: { id: { in: currentIds } },
      select: { homeSourceMatchId: true, awaySourceMatchId: true },
    });
    const next = rows
      .flatMap((row) => [row.homeSourceMatchId, row.awaySourceMatchId])
      .filter((id): id is number => id !== null);
    if (next.includes(matchId)) return true;
    currentIds = next;
  }
  return false;
}

type SlotData = {
  source: MatchSlotSource;
  teamId: number | null;
  divisionId: number | null;
  place: number | null;
  matchId: number | null;
  label: string | null;
};

/** Проверяет одну сторону матча и приводит её к полям базы. */
/**
 * Сколько команд в дивизионе.
 *
 * У дивизиона, разделённого на половины, заявок уже не осталось — команды
 * уехали к потомкам. Но его таблица жива (она строится по сыгранным матчам),
 * и слот «1-е место первого этапа» обязан продолжать работать.
 */
async function divisionSize(divisionId: number, entryCount: number): Promise<number> {
  if (entryCount > 0) return entryCount;

  const matches = await prisma.match.findMany({
    where: { divisionId },
    select: { homeTeamId: true, awayTeamId: true },
  });
  const teams = new Set<number>();
  for (const match of matches) {
    if (match.homeTeamId !== null) teams.add(match.homeTeamId);
    if (match.awayTeamId !== null) teams.add(match.awayTeamId);
  }
  return teams.size;
}

async function buildSlot(
  input: SlotInput,
  context: { tournamentId: number; matchId: number | null; sideName: string },
): Promise<{ ok: true; data: SlotData } | { ok: false; error: string }> {
  const { tournamentId, matchId, sideName } = context;
  const label = input.label || null;

  if (input.source === "TEAM") {
    if (!input.teamId) return { ok: false, error: `${sideName}: выберите команду` };
    const entry = await prisma.tournamentTeam.findFirst({
      where: { id: Number(input.teamId), tournamentId },
      select: { id: true },
    });
    if (!entry) return { ok: false, error: `${sideName}: команда не заявлена в этот турнир` };
    return {
      ok: true,
      data: { source: "TEAM", teamId: entry.id, divisionId: null, place: null, matchId: null, label },
    };
  }

  if (input.source === "DIVISION_PLACE") {
    if (!input.divisionId) return { ok: false, error: `${sideName}: выберите дивизион` };
    const division = await prisma.division.findFirst({
      where: { id: Number(input.divisionId), tournamentId },
      select: { id: true, name: true, _count: { select: { entries: true } } },
    });
    if (!division) return { ok: false, error: `${sideName}: дивизион не из этого турнира` };

    const place = Number(input.place);
    if (!Number.isInteger(place) || place < 1) {
      return { ok: false, error: `${sideName}: укажите место числом, начиная с 1` };
    }
    const size = await divisionSize(division.id, division._count.entries);
    if (place > size) {
      return {
        ok: false,
        error: `${sideName}: в дивизионе «${division.name}» всего ${size} команд`,
      };
    }
    return {
      ok: true,
      data: {
        source: "DIVISION_PLACE",
        teamId: null,
        divisionId: division.id,
        place,
        matchId: null,
        label,
      },
    };
  }

  // MATCH_WINNER / MATCH_LOSER
  if (!input.matchId) return { ok: false, error: `${sideName}: выберите матч-источник` };
  const sourceId = Number(input.matchId);
  const source = await prisma.match.findFirst({
    where: { id: sourceId, tournamentId },
    select: { id: true },
  });
  if (!source) return { ok: false, error: `${sideName}: матч-источник не из этого турнира` };
  if (matchId && sourceId === matchId) {
    return { ok: false, error: `${sideName}: матч не может быть источником сам для себя` };
  }
  if (await createsCycle(matchId, sourceId)) {
    return {
      ok: false,
      error: `${sideName}: получится замкнутый круг — матч №${sourceId} уже зависит от этого матча`,
    };
  }

  return {
    ok: true,
    data: {
      source: input.source,
      teamId: null,
      divisionId: null,
      place: null,
      matchId: sourceId,
      label,
    },
  };
}

export async function savePlayoffMatch(
  tournamentId: number,
  matchId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parsed = playoffMatchSchema.safeParse({
    stage: formData.get("stage"),
    bracketOrder: formData.get("bracketOrder") || 0,
    kickoffAt: formData.get("kickoffAt"),
    venueId: formData.get("venueId"),
    refereeId: formData.get("refereeId"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");

  const homeInput = readSlot(formData, "home");
  const awayInput = readSlot(formData, "away");
  if (!homeInput.success || !awayInput.success) return fail("Проверьте источники участников");

  const home = await buildSlot(homeInput.data, { tournamentId, matchId, sideName: "Хозяева" });
  if (!home.ok) return fail(home.error);
  const away = await buildSlot(awayInput.data, { tournamentId, matchId, sideName: "Гости" });
  if (!away.ok) return fail(away.error);

  if (home.data.teamId !== null && home.data.teamId === away.data.teamId) {
    return fail("Команда не может играть сама с собой");
  }
  if (
    home.data.source === away.data.source &&
    home.data.matchId !== null &&
    home.data.matchId === away.data.matchId
  ) {
    return fail("Обе стороны ссылаются на один и тот же исход одного матча");
  }
  if (
    home.data.source === "DIVISION_PLACE" &&
    away.data.source === "DIVISION_PLACE" &&
    home.data.divisionId === away.data.divisionId &&
    home.data.place === away.data.place
  ) {
    return fail("Обе стороны указывают на одно и то же место в дивизионе");
  }

  const data = {
    tournamentId,
    stage: parsed.data.stage,
    bracketOrder: parsed.data.bracketOrder,
    kickoffAt: fromDateTimeInput(parsed.data.kickoffAt),
    venueId: parsed.data.venueId ? Number(parsed.data.venueId) : null,
    refereeId: parsed.data.refereeId || null,
    round: null,
    divisionId: null,
    homeTeamId: home.data.teamId,
    homeSource: home.data.source,
    homeSourceDivisionId: home.data.divisionId,
    homeSourcePlace: home.data.place,
    homeSourceMatchId: home.data.matchId,
    homeSourceLabel: home.data.label,
    awayTeamId: away.data.teamId,
    awaySource: away.data.source,
    awaySourceDivisionId: away.data.divisionId,
    awaySourcePlace: away.data.place,
    awaySourceMatchId: away.data.matchId,
    awaySourceLabel: away.data.label,
  };

  if (matchId) {
    await prisma.match.update({ where: { id: matchId }, data });
    await audit(user.id, "playoff.update", matchId, `Матч плей-офф №${matchId} изменён`);
  } else {
    const created = await prisma.match.create({ data });
    await audit(user.id, "playoff.create", created.id, `Создан матч плей-офф №${created.id}`);
  }

  await resolvePlayoffSlots(tournamentId);
  revalidateBracket(tournamentId);
  return done(matchId ? "Матч изменён" : "Матч добавлен в сетку");
}

export async function deletePlayoffMatch(matchId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { tournamentId: true, _count: { select: { events: true } } },
  });
  if (!match) return fail("Матч не найден");

  const dependent = await prisma.match.findFirst({
    where: { OR: [{ homeSourceMatchId: matchId }, { awaySourceMatchId: matchId }] },
    select: { id: true },
  });
  if (dependent) {
    return fail(`Этот матч — источник участника для матча №${dependent.id}. Сначала измените источник.`);
  }
  if (match._count.events > 0) {
    return fail("В матче уже есть протокол — сначала очистите его");
  }

  await prisma.match.delete({ where: { id: matchId } });
  await audit(user.id, "playoff.delete", matchId, `Матч плей-офф №${matchId} удалён`);

  revalidateBracket(match.tournamentId);
  return done("Матч удалён");
}

/** Перестановка матча внутри стадии — стрелками вверх и вниз. */
export async function movePlayoffMatch(matchId: number, delta: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { tournamentId: true, bracketOrder: true },
  });
  if (!match) return fail("Матч не найден");

  await prisma.match.update({
    where: { id: matchId },
    data: { bracketOrder: Math.max(0, match.bracketOrder + delta) },
  });

  revalidateBracket(match.tournamentId);
  return done("Порядок изменён");
}

export type ResolveResult = { error?: string; reports?: SlotReport[] };

/** Кнопка «Обновить участников» — возвращает отчёт для показа организатору. */
export async function resolveSlotsAction(tournamentId: number): Promise<ResolveResult> {
  const user = await requireAdminUser();
  if (!user) return { error: "Нужны права организатора" };

  const reports = await resolvePlayoffSlots(tournamentId);
  await audit(user.id, "playoff.resolve", tournamentId, `Сетка обновлена: ${reports.length} слотов`);
  revalidateBracket(tournamentId);
  return { reports };
}
