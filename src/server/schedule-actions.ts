"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { PLAYED_STATUSES } from "@/lib/football";
import { fromDateTimeInput, moscowDayKey, shiftDayKey } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  matchTeamName,
  normalizeName,
  parseScheduleTable,
  type ParsedRow,
  type TeamOption,
} from "@/lib/schedule-table";

/**
 * Расписание регулярного этапа: генератор, пакетная правка тура и очистка.
 *
 * Главное отличие от прежнего генератора: он больше не выдумывает время.
 * Организаторы согласуют его в чатах и в таблицах уже после того, как известны
 * пары, поэтому генератор расставляет только даты туров и помечает матчи
 * «время уточняется» (`Match.kickoffTbd`).
 */

export type FormState = { error?: string; message?: string };

const fail = (error: string): FormState => ({ error });
const done = (message: string): FormState => ({ message });

/** Служебное время матча, у которого час ещё не согласован. */
const TBD_CLOCK = "12:00";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function audit(
  userId: string,
  action: string,
  entityId: string | number,
  summary: string,
  payload?: unknown,
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity: "Tournament",
      entityId: String(entityId),
      summary,
      payload: payload === undefined ? undefined : JSON.parse(JSON.stringify(payload)),
    },
  });
}

function revalidateSchedule(tournamentId: number) {
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath(`/admin/tournaments/${tournamentId}/schedule`);
  revalidatePath("/admin/matches");
  revalidatePath("/tournaments", "layout");
  revalidatePath("/referee");
  revalidatePath("/");
}

/** Дата тура с служебным временем: настоящее время проставят позже. */
function tbdKickoff(firstDay: string, roundIndex: number, stepDays: number): Date {
  return fromDateTimeInput(`${shiftDayKey(firstDay, roundIndex * stepDays)}T${TBD_CLOCK}`);
}

// ───────────────────────────── Генератор ────────────────────────────────────

/** Календарь в один круг методом «карусели». */
function roundRobinPairs(entryIds: number[]): Array<Array<[number, number]>> {
  const teams = [...entryIds];
  if (teams.length % 2 === 1) teams.push(-1); // фиктивная команда: кто с ней «играет», отдыхает
  const n = teams.length;
  const rotating = teams.slice(1);
  const rounds: Array<Array<[number, number]>> = [];

  for (let round = 0; round < n - 1; round++) {
    const order = [teams[0], ...rotating];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = order[i];
      const away = order[n - 1 - i];
      if (home === -1 || away === -1) continue;
      pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop()!);
  }
  return rounds;
}

/**
 * Создаёт круговое расписание: пары и номера туров.
 *
 * Время матчей не назначается: все матчи тура встают на дату тура с пометкой
 * «время уточняется». Шаг между турами — только черновая раскладка по
 * календарю, чтобы туры не свалились в один день.
 */
export async function generateSchedule(
  tournamentId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const divisionRaw = String(formData.get("divisionId") ?? "");
  const firstDay = String(formData.get("firstDay") ?? "");
  const stepDays = Number(formData.get("stepDays") ?? 7);

  if (!firstDay) return fail("Укажите дату первого тура");
  if (!Number.isInteger(stepDays) || stepDays < 0 || stepDays > 30) {
    return fail("Шаг между турами — от 0 до 30 дней");
  }

  const entries = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    select: { id: true, divisionId: true },
    orderBy: { id: "asc" },
  });
  if (entries.length < 2) return fail("Нужно минимум две заявленные команды");

  const divisions = await prisma.division.findMany({
    where: { tournamentId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, _count: { select: { childDivisions: true } } },
  });

  // Какие «корзины» разыгрывать. Раньше при выборе «весь турнир» команды разных
  // дивизионов сваливались в один общий круг — это была ловушка, а не задумка.
  let targets: Array<{ divisionId: number | null; name: string }>;
  if (divisionRaw) {
    const id = Number(divisionRaw);
    const division = divisions.find((d) => d.id === id);
    if (!division) return fail("Дивизион не найден");
    if (division._count.childDivisions > 0) {
      return fail(
        `«${division.name}» — завершённый этап, он разделён на половины. Создавайте расписание для них.`,
      );
    }
    targets = [{ divisionId: id, name: division.name }];
  } else if (divisions.length > 0) {
    // Дивизионы, уже разделённые на половины, свой этап отыграли
    targets = divisions
      .filter((d) => d._count.childDivisions === 0)
      .map((d) => ({ divisionId: d.id, name: d.name }));
    if (entries.filter((e) => e.divisionId === null).length >= 2) {
      targets.push({ divisionId: null, name: "Без дивизиона" });
    }
  } else {
    targets = [{ divisionId: null, name: "Турнир" }];
  }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const target of targets) {
    const ids = entries
      .filter((e) => (target.divisionId === null ? e.divisionId === null : e.divisionId === target.divisionId))
      .map((e) => e.id);

    if (ids.length < 2) {
      skipped.push(`${target.name}: меньше двух команд`);
      continue;
    }

    const existing = await prisma.match.count({
      where: { tournamentId, divisionId: target.divisionId, stage: "REGULAR" },
    });
    if (existing > 0) {
      skipped.push(`${target.name}: матчи уже есть (${existing})`);
      continue;
    }

    const rounds = roundRobinPairs(ids);
    const data = rounds.flatMap((pairs, roundIndex) =>
      pairs.map(([homeTeamId, awayTeamId]) => ({
        tournamentId,
        divisionId: target.divisionId,
        round: roundIndex + 1,
        homeTeamId,
        awayTeamId,
        kickoffAt: tbdKickoff(firstDay, roundIndex, stepDays),
        kickoffTbd: true,
      })),
    );

    await prisma.match.createMany({ data });
    created.push(`${target.name}: ${data.length} матчей в ${rounds.length} турах`);
  }

  if (created.length === 0) {
    return fail(
      skipped.length > 0
        ? `Ничего не создано. ${skipped.join("; ")}`
        : "Ничего не создано: нет подходящих команд",
    );
  }

  await audit(
    user.id,
    "schedule.generate",
    tournamentId,
    `Создано расписание — ${created.join("; ")}`,
  );
  revalidateSchedule(tournamentId);

  const tail = skipped.length > 0 ? ` Пропущено: ${skipped.join("; ")}.` : "";
  return done(`Создано расписание. ${created.join("; ")}.${tail} Время у матчей не назначено — проставьте его по турам или импортом.`);
}

// ───────────────────────────── Очистка ──────────────────────────────────────

/**
 * Удаляет расписание регулярного этапа, не трогая ничего ценного.
 *
 * Матч не удаляется, если он уже игрался, если по нему есть события или
 * составы, или если из него сетка плей-офф берёт участника. Поэтому кнопка
 * безопасна: сыгранное она физически не может стереть.
 */
export async function clearRegularSchedule(
  tournamentId: number,
  divisionId: number | null,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const matches = await prisma.match.findMany({
    where: {
      tournamentId,
      stage: "REGULAR",
      ...(divisionId === null ? {} : { divisionId }),
    },
    select: {
      id: true,
      status: true,
      homeScore: true,
      _count: { select: { events: true, lineups: true } },
    },
  });
  if (matches.length === 0) return fail("Удалять нечего: матчей регулярного этапа нет");

  const candidates = matches.filter(
    (m) =>
      (m.status === "SCHEDULED" || m.status === "POSTPONED") &&
      m.homeScore === null &&
      m._count.events === 0 &&
      m._count.lineups === 0,
  );

  // Матч-источник сетки удалять нельзя: onDelete SetNull молча обнулил бы
  // участника в плей-офф. Проверяем разом, а не по одному матчу.
  const candidateIds = candidates.map((m) => m.id);
  const feeding = candidateIds.length
    ? await prisma.match.findMany({
        where: {
          OR: [
            { homeSourceMatchId: { in: candidateIds } },
            { awaySourceMatchId: { in: candidateIds } },
          ],
        },
        select: { homeSourceMatchId: true, awaySourceMatchId: true },
      })
    : [];
  const locked = new Set(
    feeding.flatMap((m) => [m.homeSourceMatchId, m.awaySourceMatchId]).filter((id): id is number => id !== null),
  );

  const toDelete = candidateIds.filter((id) => !locked.has(id));
  if (toDelete.length === 0) {
    return fail(`Нечего удалять: все ${matches.length} матчей защищены (сыграны, с событиями или нужны сетке)`);
  }

  await prisma.match.deleteMany({ where: { id: { in: toDelete } } });
  await audit(
    user.id,
    "schedule.clear",
    tournamentId,
    `Удалено ${toDelete.length} матчей регулярного этапа`,
  );
  revalidateSchedule(tournamentId);

  const kept = matches.length - toDelete.length;
  return done(
    kept > 0
      ? `Удалено ${toDelete.length} матчей, пропущено ${kept} (сыграны, с событиями или нужны сетке)`
      : `Удалено ${toDelete.length} матчей`,
  );
}

// ───────────────────────────── Правка тура ──────────────────────────────────

/** Матч, который пакетная правка не двигает. */
function isFrozen(status: string, events: number): boolean {
  return PLAYED_STATUSES.includes(status as never) || events > 0;
}

/**
 * Ставит дату (и при желании время и поле) всем матчам тура сразу.
 *
 * Пустое время означает «оставить как есть»: организатор может сначала
 * договориться о дне, а час назначить позже.
 */
export async function setRoundSchedule(
  tournamentId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const divisionRaw = String(formData.get("divisionId") ?? "");
  const divisionId = divisionRaw ? Number(divisionRaw) : null;
  const round = Number(formData.get("round") ?? 0);
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "").trim();
  const venueRaw = String(formData.get("venueId") ?? "");

  if (!Number.isInteger(round) || round < 1) return fail("Не указан тур");
  if (!date) return fail("Укажите дату тура");

  const matches = await prisma.match.findMany({
    where: { tournamentId, divisionId, round, stage: "REGULAR" },
    select: { id: true, status: true, _count: { select: { events: true } } },
    orderBy: { id: "asc" },
  });
  if (matches.length === 0) return fail("В этом туре нет матчей");

  const movable = matches.filter((m) => !isFrozen(m.status, m._count.events));
  if (movable.length === 0) return fail("Все матчи тура уже сыграны — расписание не меняем");

  // Время задано — снимаем пометку «уточняется»; не задано — оставляем
  // служебные 12:00 и пометку, чтобы заглушка не выглядела как настоящий час.
  const kickoffAt = fromDateTimeInput(`${date}T${time || TBD_CLOCK}`);
  const data: {
    kickoffAt: Date;
    kickoffTbd: boolean;
    venueId?: number | null;
  } = { kickoffAt, kickoffTbd: time === "" };

  if (venueRaw === "none") data.venueId = null;
  else if (venueRaw) data.venueId = Number(venueRaw);

  await prisma.match.updateMany({
    where: { id: { in: movable.map((m) => m.id) } },
    data,
  });
  await audit(
    user.id,
    "schedule.round",
    tournamentId,
    `Тур ${round}: дата ${date}${time ? `, время ${time}` : ", время уточняется"} — ${movable.length} матчей`,
  );
  revalidateSchedule(tournamentId);

  const skipped = matches.length - movable.length;
  return done(
    skipped > 0
      ? `Обновлено ${movable.length} матчей, пропущено ${skipped} (уже сыграны)`
      : `Обновлено ${movable.length} матчей`,
  );
}

/** Сдвигает тур на несколько дней, сохраняя время каждого матча. */
export async function shiftRound(
  tournamentId: number,
  divisionId: number | null,
  round: number,
  days: number,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");
  if (!Number.isInteger(days) || days === 0) return fail("Некорректный сдвиг");

  const matches = await prisma.match.findMany({
    where: { tournamentId, divisionId, round, stage: "REGULAR" },
    select: { id: true, kickoffAt: true, status: true, _count: { select: { events: true } } },
  });
  if (matches.length === 0) return fail("В этом туре нет матчей");

  const movable = matches.filter((m) => !isFrozen(m.status, m._count.events));
  if (movable.length === 0) return fail("Все матчи тура уже сыграны — сдвигать нечего");

  // По одному матчу, а не сырым SQL: в туре три-восемь матчей, зато читаемо.
  await prisma.$transaction(
    movable.map((m) =>
      prisma.match.update({
        where: { id: m.id },
        data: { kickoffAt: new Date(m.kickoffAt.getTime() + days * 86_400_000) },
      }),
    ),
  );

  await audit(
    user.id,
    "schedule.shift",
    tournamentId,
    `Тур ${round} сдвинут на ${days > 0 ? "+" : ""}${days} дн. — ${movable.length} матчей`,
  );
  revalidateSchedule(tournamentId);

  const skipped = matches.length - movable.length;
  const day = moscowDayKey(new Date(movable[0].kickoffAt.getTime() + days * 86_400_000));
  return done(
    skipped > 0
      ? `Сдвинуто ${movable.length} матчей (теперь с ${day}), пропущено ${skipped} (уже сыграны)`
      : `Сдвинуто ${movable.length} матчей — теперь с ${day}`,
  );
}

// ───────────────────────────── Импорт из таблицы ────────────────────────────

/** Что случится (или случилось) с одной строкой вставленной таблицы. */
export type RowPlan = {
  line: number;
  status: "create" | "update" | "unchanged" | "skip" | "error";
  /** Человеческое описание: что за матч и что с ним будет */
  summary: string;
  matchId?: number;
  warnings?: string[];
};

export type ImportReport = {
  rows: RowPlan[];
  create: number;
  update: number;
  unchanged: number;
  skip: number;
  error: number;
  /** Площадки, которых нет в базе и которые придётся создать */
  newVenues: string[];
  /** true — это была только проверка, в базу ничего не писали */
  dryRun: boolean;
};

export type ImportState = { error?: string; message?: string; report?: ImportReport };

const MAX_IMPORT_CHARS = 200_000;
const MAX_IMPORT_ROWS = 500;

/** Ключ матча: тур и пара команд. Порядок команд отдельно — хозяева могли поменяться. */
const pairKey = (round: number | null, a: number, b: number) => `${round ?? "-"}:${a}:${b}`;

/**
 * Импорт расписания из таблицы: одно действие и для проверки, и для записи.
 *
 * Одно, а не два, — сознательно: иначе предпросмотр и запись со временем
 * разъедутся, и организатор увидит одно, а получит другое.
 *
 * Что импорт не делает никогда: не трогает сыгранные матчи и не переносит счёт.
 * Результат заносит судья в протоколе — единственный источник правды о матче
 * это его события.
 */
export async function importSchedule(
  tournamentId: number,
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireAdminUser();
  if (!user) return { error: "Нужны права организатора" };

  const text = String(formData.get("text") ?? "");
  const dryRun = !!formData.get("dryRun");
  const createVenues = !!formData.get("createVenues");
  const allowPartial = !!formData.get("partial");

  if (!text.trim()) return { error: "Вставьте таблицу с расписанием" };
  if (text.length > MAX_IMPORT_CHARS) {
    return { error: "Слишком большая таблица — вставляйте частями (до 500 строк)" };
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, startDate: true },
  });
  if (!tournament) return { error: "Турнир не найден" };

  const parsed = parseScheduleTable(text, {
    defaultYear: Number(moscowDayKey(tournament.startDate).slice(0, 4)),
  });
  if (parsed.errors.length > 0) return { error: parsed.errors.join(" ") };
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return { error: `Слишком много строк (${parsed.rows.length}) — вставляйте частями до ${MAX_IMPORT_ROWS}` };
  }

  const [entries, divisions, venues, referees, existing] = await Promise.all([
    prisma.tournamentTeam.findMany({
      where: { tournamentId },
      select: { id: true, divisionId: true, team: { select: { name: true, shortName: true, slug: true } } },
    }),
    prisma.division.findMany({ where: { tournamentId }, select: { id: true, name: true } }),
    prisma.venue.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["REFEREE", "ADMIN"] } },
      select: { id: true, fullName: true },
    }),
    prisma.match.findMany({
      where: { tournamentId, stage: "REGULAR" },
      select: {
        id: true,
        round: true,
        divisionId: true,
        homeTeamId: true,
        awayTeamId: true,
        kickoffAt: true,
        kickoffTbd: true,
        venueId: true,
        refereeId: true,
        notes: true,
        status: true,
        _count: { select: { events: true } },
      },
    }),
  ]);

  if (entries.length < 2) return { error: "В турнире нет заявленных команд" };

  const teamOptions: TeamOption[] = entries.map((e) => ({
    id: e.id,
    name: e.team.name,
    shortName: e.team.shortName,
    slug: e.team.slug,
  }));
  const entryDivision = new Map(entries.map((e) => [e.id, e.divisionId]));
  const venueByName = new Map(venues.map((v) => [normalizeName(v.name), v.id]));
  const divisionByName = new Map(divisions.map((d) => [normalizeName(d.name), d.id]));
  const refereeByName = new Map(referees.map((r) => [normalizeName(r.fullName), r.id]));

  const byPair = new Map<string, (typeof existing)[number]>();
  for (const match of existing) {
    if (match.homeTeamId === null || match.awayTeamId === null) continue;
    byPair.set(pairKey(match.round, match.homeTeamId, match.awayTeamId), match);
  }

  const rows: RowPlan[] = [];
  const newVenues = new Set<string>();
  const takenMatchIds = new Map<number, number>(); // matchId → строка, которая его заняла
  // Площадка может ещё не существовать, поэтому вместо venueId временно несём
  // её название в служебном поле — оно заменяется на id уже внутри транзакции.
  const creates: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: number; data: Record<string, unknown> }> = [];

  /** Ищет матч под строку: сначала точная пара, потом перевёрнутая. */
  function findMatch(row: ParsedRow, home: number, away: number) {
    const direct = byPair.get(pairKey(row.round, home, away));
    if (direct) return { match: direct, swapped: false };

    const reversed = byPair.get(pairKey(row.round, away, home));
    if (reversed) return { match: reversed, swapped: true };

    if (row.round === null) {
      // Тур не указан — ищем пару по всему турниру, но только если она одна
      const candidates = existing.filter(
        (m) =>
          (m.homeTeamId === home && m.awayTeamId === away) ||
          (m.homeTeamId === away && m.awayTeamId === home),
      );
      if (candidates.length === 1) {
        return { match: candidates[0], swapped: candidates[0].homeTeamId !== home };
      }
      if (candidates.length > 1) return { ambiguous: true as const };
    }
    return null;
  }

  for (const row of parsed.rows) {
    const warnings = [...row.warnings];
    const errors = [...row.errors];

    const homeMatch = matchTeamName(row.home, teamOptions);
    const awayMatch = matchTeamName(row.away, teamOptions);

    const describe = (raw: string, result: ReturnType<typeof matchTeamName>) => {
      if (result.kind === "ambiguous") {
        return `«${raw}» подходит нескольким командам: ${result.candidates.map((c) => c.name).join(", ")}`;
      }
      const hint = result.kind === "none" && result.suggestions.length > 0
        ? ` Может быть: ${result.suggestions.map((s) => s.name).join(", ")}?`
        : "";
      return `команда «${raw}» не найдена в заявке турнира.${hint}`;
    };

    if (homeMatch.kind === "none" || homeMatch.kind === "ambiguous") errors.push(describe(row.home, homeMatch));
    if (awayMatch.kind === "none" || awayMatch.kind === "ambiguous") errors.push(describe(row.away, awayMatch));
    if (homeMatch.kind === "partial") warnings.push(`«${row.home}» опознана по началу названия`);
    if (awayMatch.kind === "partial") warnings.push(`«${row.away}» опознана по началу названия`);

    if (errors.length > 0) {
      rows.push({ line: row.line, status: "error", summary: errors.join(" "), warnings });
      continue;
    }

    const homeId = (homeMatch as { id: number }).id;
    const awayId = (awayMatch as { id: number }).id;
    if (homeId === awayId) {
      rows.push({ line: row.line, status: "error", summary: "команда играет сама с собой", warnings });
      continue;
    }

    const label = `${row.home} — ${row.away}`;

    // Площадка
    let venueId: number | null | undefined;
    if (row.venue) {
      const known = venueByName.get(normalizeName(row.venue));
      if (known !== undefined) venueId = known;
      else if (createVenues) {
        newVenues.add(row.venue.trim());
        venueId = undefined; // проставим после создания площадок
      } else {
        rows.push({
          line: row.line,
          status: "error",
          summary: `${label}: поля «${row.venue}» нет в базе. Включите «создавать площадки» или исправьте название.`,
          warnings,
        });
        continue;
      }
    }

    // Судья: опечатка в фамилии не должна ронять весь импорт расписания
    let refereeId: string | undefined;
    if (row.referee) {
      const known = refereeByName.get(normalizeName(row.referee));
      if (known) refereeId = known;
      else warnings.push(`судья «${row.referee}» не найден — оставлен прежний`);
    }

    const found = findMatch(row, homeId, awayId);
    if (found && "ambiguous" in found) {
      rows.push({
        line: row.line,
        status: "error",
        summary: `${label}: такая пара есть в нескольких турах — укажите тур`,
        warnings,
      });
      continue;
    }

    if (!found) {
      if (row.date === null || row.round === null) {
        rows.push({
          line: row.line,
          status: "error",
          summary: `${label}: матча нет в расписании, а для создания нужны тур и дата`,
          warnings,
        });
        continue;
      }

      const divisionId = row.division
        ? (divisionByName.get(normalizeName(row.division)) ?? null)
        : (entryDivision.get(homeId) ?? null);

      creates.push({
        tournamentId,
        divisionId,
        round: row.round,
        homeTeamId: homeId,
        awayTeamId: awayId,
        kickoffAt: fromDateTimeInput(`${row.date}T${row.time ?? TBD_CLOCK}`),
        kickoffTbd: row.time === null,
        ...(venueId !== undefined ? { venueId } : {}),
        ...(row.venue && venueId === undefined ? { __venueName: row.venue } : {}),
        ...(refereeId ? { refereeId } : {}),
        ...(row.notes ? { notes: row.notes } : {}),
      });
      rows.push({
        line: row.line,
        status: "create",
        summary: `${label}: новый матч, тур ${row.round}, ${row.date}${row.time ? ` ${row.time}` : " (время уточняется)"}`,
        warnings,
      });
      continue;
    }

    const match = found.match;

    const twin = takenMatchIds.get(match.id);
    if (twin !== undefined) {
      rows.push({
        line: row.line,
        status: "error",
        summary: `${label}: этот матч уже описан строкой ${twin}`,
        warnings,
      });
      continue;
    }
    takenMatchIds.set(match.id, row.line);

    if (PLAYED_STATUSES.includes(match.status) || match._count.events > 0) {
      rows.push({
        line: row.line,
        status: "skip",
        matchId: match.id,
        summary: `${label}: матч уже сыгран — расписание не меняем`,
        warnings,
      });
      continue;
    }

    // Дата не указана — оставляем прежний день, меняем только время
    const day = row.date ?? moscowDayKey(match.kickoffAt);
    const kickoffAt = fromDateTimeInput(`${day}T${row.time ?? TBD_CLOCK}`);
    const kickoffTbd = row.time === null;

    const changes: string[] = [];
    const data: Record<string, unknown> = {};

    if (kickoffAt.getTime() !== match.kickoffAt.getTime() || kickoffTbd !== match.kickoffTbd) {
      data.kickoffAt = kickoffAt;
      data.kickoffTbd = kickoffTbd;
      changes.push(kickoffTbd ? `дата ${day}, время уточняется` : `${day} ${row.time}`);
    }
    if (found.swapped) {
      data.homeTeamId = homeId;
      data.awayTeamId = awayId;
      changes.push("поменялись хозяева");
    }
    if (venueId !== undefined && venueId !== match.venueId) {
      data.venueId = venueId;
      changes.push(`поле «${row.venue}»`);
    }
    if (row.venue && venueId === undefined) changes.push(`поле «${row.venue}» (будет создано)`);
    if (refereeId && refereeId !== match.refereeId) {
      data.refereeId = refereeId;
      changes.push(`судья ${row.referee}`);
    }
    if (row.notes && row.notes !== match.notes) {
      data.notes = row.notes;
      changes.push("примечание");
    }
    if (row.round !== null && row.round !== match.round) {
      data.round = row.round;
      changes.push(`тур ${row.round}`);
    }

    const pendingVenue = row.venue && venueId === undefined;
    if (changes.length === 0 && !pendingVenue) {
      rows.push({ line: row.line, status: "unchanged", matchId: match.id, summary: `${label}: без изменений`, warnings });
      continue;
    }

    updates.push({
      id: match.id,
      data: pendingVenue ? { ...data, __venueName: row.venue } : data,
    });
    rows.push({
      line: row.line,
      status: "update",
      matchId: match.id,
      summary: `${label}: ${changes.join(", ")}`,
      warnings,
    });
  }

  const count = (status: RowPlan["status"]) => rows.filter((r) => r.status === status).length;
  const report: ImportReport = {
    rows,
    create: count("create"),
    update: count("update"),
    unchanged: count("unchanged"),
    skip: count("skip"),
    error: count("error"),
    newVenues: [...newVenues],
    dryRun,
  };

  const summary = `создать ${report.create}, обновить ${report.update}, без изменений ${report.unchanged}, пропустить ${report.skip}, ошибок ${report.error}`;

  if (dryRun) {
    return { message: `Проверка: ${summary}`, report };
  }

  if (report.error > 0 && !allowPartial) {
    return {
      error: `В таблице ${report.error} ошибок — ничего не записано. Исправьте строки или включите «импортировать только корректные строки».`,
      report,
    };
  }
  if (report.create === 0 && report.update === 0) {
    return { message: `Менять нечего: ${summary}`, report };
  }

  await prisma.$transaction(
    async (tx) => {
      // Сначала площадки: их id нужен обеим группам записей
      const venueIdByName = new Map(venueByName);
      for (const name of newVenues) {
        const created = await tx.venue.create({ data: { name }, select: { id: true, name: true } });
        venueIdByName.set(normalizeName(created.name), created.id);
      }

      for (const create of creates) {
        const data = { ...create };
        if (data.__venueName) {
          data.venueId = venueIdByName.get(normalizeName(String(data.__venueName))) ?? null;
          delete data.__venueName;
        }
        await tx.match.create({ data: data as Parameters<typeof tx.match.create>[0]["data"] });
      }

      for (const update of updates) {
        const data = { ...update.data };
        if (data.__venueName) {
          data.venueId = venueIdByName.get(normalizeName(String(data.__venueName))) ?? null;
          delete data.__venueName;
        }
        await tx.match.update({
          where: { id: update.id },
          data: data as Parameters<typeof tx.match.update>[0]["data"],
        });
      }
    },
    { timeout: 20_000 },
  );

  await audit(
    user.id,
    "schedule.import",
    tournamentId,
    `Импорт расписания: ${summary}`,
    { rows: report.rows, newVenues: report.newVenues },
  );
  revalidateSchedule(tournamentId);

  return { message: `Импортировано: ${summary}`, report: { ...report, dryRun: false } };
}
