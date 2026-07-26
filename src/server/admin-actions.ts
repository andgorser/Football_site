"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlayerPosition } from "@prisma/client";

import { getCurrentUser, hashPassword } from "@/lib/auth";
import { placeIsTight } from "@/lib/football";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getTournamentStandings } from "@/lib/stats";
import { completedDivisionIds, resolvePlayoffSlots } from "@/server/playoff";

/**
 * Действия администратора: турниры, команды, игроки, расписание, аккаунты.
 * Часть действий (заявка состава) доступна ещё и капитану своей команды —
 * это отдельно оговорено в каждой такой функции.
 */

export type FormState = { error?: string; message?: string };

const fail = (error: string): FormState => ({ error });
const done = (message: string): FormState => ({ message });

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

async function audit(
  userId: string,
  action: string,
  entity: string,
  entityId: string | number,
  summary: string,
) {
  await prisma.auditLog.create({
    data: { userId, action, entity, entityId: String(entityId), summary },
  });
}

/** Приводит строку из формы к позиции игрока. */
function toPosition(value: unknown): PlayerPosition | null {
  return value === "GK" || value === "DF" || value === "MF" || value === "FW" ? value : null;
}

/**
 * Игровой номер из формы: пусто — это «номера нет», мусор — ошибка.
 *
 * Проверка идёт через Number.isInteger, а не через сравнение с границами:
 * Number("abc") даёт NaN, а любое сравнение с NaN ложно, поэтому такой
 * «номер» проскочил бы диапазон и упал уже внутри Prisma.
 */
function parseShirtNumber(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  const value = Number(String(raw).trim());
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    return { ok: false, error: "Игровой номер должен быть целым числом от 1 до 99" };
  }
  return { ok: true, value };
}

/** Проверяет, что назначаемый судья существует, активен и вправе судить. */
async function resolveReferee(
  refereeId: string | null,
): Promise<{ ok: true; fullName: string | null } | { ok: false; error: string }> {
  if (!refereeId) return { ok: true, fullName: null };

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { fullName: true, role: true, isActive: true },
  });
  if (!referee) return { ok: false, error: "Пользователь не найден" };
  if (!referee.isActive) return { ok: false, error: "Аккаунт отключён — назначить нельзя" };
  if (referee.role !== "REFEREE" && referee.role !== "ADMIN") {
    return { ok: false, error: "Этот пользователь не судья" };
  }
  return { ok: true, fullName: referee.fullName };
}

/** Транслитерация названия в адрес страницы. */
function slugify(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const base = value
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? (/[a-z0-9]/.test(ch) ? ch : "-"))
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `id-${Date.now()}`;
}

/** Добавляет суффикс, если такой адрес уже занят. */
async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = base;
  let counter = 2;
  while (await exists(slug)) {
    slug = `${base}-${counter++}`;
    if (counter > 100) return `${base}-${Date.now()}`;
  }
  return slug;
}

// ───────────────────────────── Турниры ──────────────────────────────────────

const tournamentSchema = z.object({
  name: z.string().trim().min(2, "Слишком короткое название"),
  season: z.string().trim().min(1, "Укажите сезон"),
  format: z.enum(["LEAGUE", "GROUPS_PLAYOFF", "CUP"]),
  status: z.enum(["UPCOMING", "ONGOING", "FINISHED"]),
  startDate: z.string().min(1, "Укажите дату начала"),
  endDate: z.string().optional(),
  halfDurationMin: z.coerce.number().int().min(5).max(60),
  pointsForWin: z.coerce.number().int().min(0).max(10),
  pointsForDraw: z.coerce.number().int().min(0).max(10),
  description: z.string().trim().max(1000).optional(),
  seriesId: z.string().optional(),
});

export async function saveTournament(
  tournamentId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parsed = tournamentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const input = parsed.data;

  const seriesId = input.seriesId ? Number(input.seriesId) : null;
  // Проверяем сами, чтобы вместо ошибки внешнего ключа показать понятный текст
  if (seriesId !== null && !(await prisma.tournamentSeries.count({ where: { id: seriesId } }))) {
    return fail("Серия не найдена");
  }

  const data = {
    name: input.name,
    season: input.season,
    format: input.format,
    status: input.status,
    startDate: fromDateInput(input.startDate),
    endDate: input.endDate ? fromDateInput(input.endDate) : null,
    halfDurationMin: input.halfDurationMin,
    pointsForWin: input.pointsForWin,
    pointsForDraw: input.pointsForDraw,
    description: input.description || null,
    seriesId,
  };

  if (data.endDate && data.endDate < data.startDate) {
    return fail("Дата окончания раньше даты начала");
  }

  let id = tournamentId;
  if (tournamentId) {
    await prisma.tournament.update({ where: { id: tournamentId }, data });
    await audit(user.id, "tournament.update", "Tournament", tournamentId, `Турнир «${input.name}» изменён`);
  } else {
    const slug = await uniqueSlug(
      slugify(`${input.name}-${input.season}`),
      async (s) => (await prisma.tournament.count({ where: { slug: s } })) > 0,
    );
    const created = await prisma.tournament.create({ data: { ...data, slug } });
    id = created.id;
    await audit(user.id, "tournament.create", "Tournament", created.id, `Создан турнир «${input.name}»`);
  }

  revalidatePath("/admin/tournaments");
  revalidatePath("/tournaments", "layout");
  revalidatePath("/series", "layout");
  redirect(`/admin/tournaments/${id}`);
}

// ───────────────────────────── Серии турниров ───────────────────────────────

const seriesSchema = z.object({
  name: z.string().trim().min(2, "Слишком короткое название"),
  description: z.string().trim().max(1000).optional(),
  logoUrl: z.string().trim().max(500).optional(),
});

export async function saveSeries(
  seriesId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parsed = seriesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const input = parsed.data;

  const data = {
    name: input.name,
    description: input.description || null,
    logoUrl: input.logoUrl || null,
  };

  if (seriesId) {
    // Адрес не меняем при переименовании — иначе ломаются ссылки на историю
    await prisma.tournamentSeries.update({ where: { id: seriesId }, data });
    await audit(user.id, "series.update", "TournamentSeries", seriesId, `Серия «${input.name}» изменена`);
  } else {
    const slug = await uniqueSlug(
      slugify(input.name),
      async (s) => (await prisma.tournamentSeries.count({ where: { slug: s } })) > 0,
    );
    const created = await prisma.tournamentSeries.create({ data: { ...data, slug } });
    await audit(user.id, "series.create", "TournamentSeries", created.id, `Создана серия «${input.name}»`);
  }

  revalidatePath("/admin/series");
  revalidatePath("/series", "layout");
  revalidatePath("/tournaments", "layout");
  return done(seriesId ? "Серия сохранена" : "Серия создана");
}

export async function deleteSeries(seriesId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const series = await prisma.tournamentSeries.findUnique({
    where: { id: seriesId },
    select: { name: true },
  });
  if (!series) return fail("Серия не найдена");

  // Турниры останутся: связь стоит на SetNull, история сезонов не теряется
  await prisma.tournamentSeries.delete({ where: { id: seriesId } });
  await audit(user.id, "series.delete", "TournamentSeries", seriesId, `Удалена серия «${series.name}»`);

  revalidatePath("/admin/series");
  revalidatePath("/series", "layout");
  revalidatePath("/tournaments", "layout");
  return done("Серия удалена, турниры остались");
}

/**
 * Разбирает турниры без серии по сериям — по совпадению названия.
 *
 * Ничего не удаляет и не перепривязывает: запускать можно сколько угодно раз.
 * Турнир, который между годами переименовали, попадёт в отдельную серию —
 * такие объединяются вручную выбором серии в форме турнира.
 */
export async function groupTournamentsIntoSeries(): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const orphans = await prisma.tournament.findMany({
    where: { seriesId: null },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, slug: true },
  });
  if (orphans.length === 0) return done("Все турниры уже привязаны к сериям");

  const existing = await prisma.tournamentSeries.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s.id]));

  let linked = 0;
  let createdSeries = 0;

  for (const tournament of orphans) {
    const key = tournament.name.trim().toLowerCase();
    let seriesId = byName.get(key);

    if (seriesId === undefined) {
      const slug = await uniqueSlug(
        // Хвост с годом в адресе серии не нужен: она живёт дольше сезона
        slugify(tournament.name),
        async (s) => (await prisma.tournamentSeries.count({ where: { slug: s } })) > 0,
      );
      const created = await prisma.tournamentSeries.create({
        data: { slug, name: tournament.name },
        select: { id: true },
      });
      seriesId = created.id;
      byName.set(key, seriesId);
      createdSeries++;
    }

    await prisma.tournament.update({ where: { id: tournament.id }, data: { seriesId } });
    linked++;
  }

  await audit(
    user.id,
    "series.group",
    "TournamentSeries",
    0,
    `Турниры разложены по сериям: привязано ${linked}, создано серий ${createdSeries}`,
  );

  revalidatePath("/admin/series");
  revalidatePath("/series", "layout");
  revalidatePath("/tournaments", "layout");
  return done(`Привязано турниров: ${linked}. Создано серий: ${createdSeries}.`);
}

export async function createDivision(
  tournamentId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return fail("Слишком короткое название");

  // Пустое поле означает «как в турнире», поэтому пишем null, а не ноль.
  const halfRaw = String(formData.get("halfDurationMin") ?? "").trim();
  const halfDurationMin = halfRaw === "" ? null : Number(halfRaw);
  if (
    halfDurationMin !== null &&
    (!Number.isInteger(halfDurationMin) || halfDurationMin < 5 || halfDurationMin > 60)
  ) {
    return fail("Длительность тайма — от 5 до 60 минут");
  }

  const exists = await prisma.division.count({ where: { tournamentId, name } });
  if (exists) return fail("Такой дивизион уже есть");

  const count = await prisma.division.count({ where: { tournamentId } });
  await prisma.division.create({
    data: { tournamentId, name, sortOrder: count + 1, halfDurationMin },
  });
  await audit(user.id, "division.create", "Tournament", tournamentId, `Добавлен дивизион «${name}»`);

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Дивизион добавлен");
}

/**
 * Правка дивизиона: название и своя длительность тайма.
 *
 * Длительность нужна, когда в одном турнире соседствуют разные форматы:
 * дивизион 8×8 играет по 30 минут, а 6×6 — по 25. Пустое значение означает
 * «как в турнире», поэтому в базе лежит null, а не ноль.
 */
export async function updateDivision(
  divisionId: number,
  values: { name: string; halfDurationMin: number | null },
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const name = values.name.trim();
  if (name.length < 2) return fail("Слишком короткое название");

  const half = values.halfDurationMin;
  if (half !== null && (!Number.isInteger(half) || half < 5 || half > 60)) {
    return fail("Длительность тайма — от 5 до 60 минут");
  }

  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: { tournamentId: true, name: true },
  });
  if (!division) return fail("Дивизион не найден");

  const duplicate = await prisma.division.count({
    where: { tournamentId: division.tournamentId, name, id: { not: divisionId } },
  });
  if (duplicate) return fail("Дивизион с таким названием уже есть");

  await prisma.division.update({
    where: { id: divisionId },
    data: { name, halfDurationMin: half },
  });
  await audit(
    user.id,
    "division.update",
    "Tournament",
    division.tournamentId,
    `Изменён дивизион «${division.name}» → «${name}»`,
  );

  revalidatePath(`/admin/tournaments/${division.tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Сохранено");
}

export async function deleteDivision(divisionId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: { tournamentId: true, name: true, _count: { select: { childDivisions: true } } },
  });
  if (!division) return fail("Дивизион не найден");
  // Иначе onDelete: SetNull молча обнулил бы parentDivisionId у половин,
  // и перенесённые очки исчезли бы без единого сообщения.
  if (division._count.childDivisions > 0) {
    return fail("Сначала отмените разделение: иначе половины потеряют перенесённые очки");
  }

  await prisma.division.delete({ where: { id: divisionId } });
  await audit(
    user.id,
    "division.delete",
    "Tournament",
    division.tournamentId,
    `Удалён дивизион «${division.name}»`,
  );

  revalidatePath(`/admin/tournaments/${division.tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Дивизион удалён");
}

/**
 * Делит дивизион по итогам кругового этапа на верхнюю и нижнюю половину.
 *
 * Так играют в лиге: после «каждый с каждым» верхняя половина спорит за призы,
 * нижняя — за выживание, и набранные очки при этом сохраняются. Перенос нигде
 * не записывается: он считается из матчей первого этапа, которые остаются
 * привязанными к дивизиону-предку. Поэтому таблица первого этапа продолжает
 * жить как архив, а половины стартуют с его цифр.
 */
export async function splitDivision(
  divisionId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: {
      id: true,
      tournamentId: true,
      name: true,
      _count: { select: { childDivisions: true } },
    },
  });
  if (!division) return fail("Дивизион не найден");
  if (division._count.childDivisions > 0) return fail("Этот дивизион уже разделён");

  const topCount = Number(formData.get("topCount") ?? 0);
  const topName = String(formData.get("topName") ?? "").trim();
  const bottomName = String(formData.get("bottomName") ?? "").trim();
  const archiveName = String(formData.get("archiveName") ?? "").trim() || division.name;

  if (!topName || !bottomName) return fail("Укажите названия обеих половин");
  if (new Set([topName, bottomName, archiveName]).size < 3) {
    return fail("Названия половин и архива должны различаться");
  }

  // Места ещё могут поменяться, пока дивизион не доигран
  const completed = await completedDivisionIds(division.tournamentId);
  if (!completed.has(divisionId)) {
    return fail("В дивизионе есть недоигранные матчи — места ещё могут поменяться");
  }

  const standings = await getTournamentStandings(division.tournamentId);
  const table = standings.find((d) => d.divisionId === divisionId);
  if (!table || table.rows.length < 4) return fail("В дивизионе слишком мало команд для разделения");

  if (!Number.isInteger(topCount) || topCount < 1 || topCount >= table.rows.length) {
    return fail(`Верхняя половина — от 1 до ${table.rows.length - 1} команд`);
  }

  const topRows = table.rows.slice(0, topCount);
  const bottomRows = table.rows.slice(topCount);

  try {
    await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.division.aggregate({
        where: { tournamentId: division.tournamentId },
        _max: { sortOrder: true },
      });
      const base = (maxOrder._max.sortOrder ?? 0) + 1;

      const top = await tx.division.create({
        data: {
          tournamentId: division.tournamentId,
          name: topName,
          sortOrder: base,
          parentDivisionId: divisionId,
        },
        select: { id: true },
      });
      const bottom = await tx.division.create({
        data: {
          tournamentId: division.tournamentId,
          name: bottomName,
          sortOrder: base + 1,
          parentDivisionId: divisionId,
        },
        select: { id: true },
      });

      await tx.tournamentTeam.updateMany({
        where: { id: { in: topRows.map((r) => r.entryId) } },
        data: { divisionId: top.id },
      });
      await tx.tournamentTeam.updateMany({
        where: { id: { in: bottomRows.map((r) => r.entryId) } },
        data: { divisionId: bottom.id },
      });

      if (archiveName !== division.name) {
        await tx.division.update({ where: { id: divisionId }, data: { name: archiveName } });
      }
    });
  } catch {
    // Чаще всего сюда попадает конфликт уникальности названия дивизиона
    return fail("Не удалось разделить: проверьте, что таких названий ещё нет в турнире");
  }

  await audit(
    user.id,
    "division.split",
    "Tournament",
    division.tournamentId,
    `Дивизион «${division.name}» разделён: ${topName} — ${topRows.map((r) => r.teamShortName).join(", ")}; ${bottomName} — ${bottomRows.map((r) => r.teamShortName).join(", ")}`,
  );

  await resolvePlayoffSlots(division.tournamentId);
  revalidatePath(`/admin/tournaments/${division.tournamentId}`);
  revalidatePath("/tournaments", "layout");

  const warning = placeIsTight(table.rows, topCount)
    ? ` Внимание: места ${topCount} и ${topCount + 1} делятся по личным встречам — проверьте границу.`
    : "";
  return done(
    `Разделено: ${topRows.length} команд в «${topName}», ${bottomRows.length} в «${bottomName}». Очки и статистика первого этапа перенесены.${warning}`,
  );
}

/** Отменяет разделение, пока у половин нет матчей: случайный клик не должен быть необратим. */
export async function mergeSplitBack(parentDivisionId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parent = await prisma.division.findUnique({
    where: { id: parentDivisionId },
    select: {
      tournamentId: true,
      name: true,
      childDivisions: {
        select: { id: true, name: true, _count: { select: { matches: true } } },
      },
    },
  });
  if (!parent) return fail("Дивизион не найден");
  if (parent.childDivisions.length === 0) return fail("Этот дивизион не разделён");

  const withMatches = parent.childDivisions.filter((child) => child._count.matches > 0);
  if (withMatches.length > 0) {
    return fail(
      `У половин уже есть матчи (${withMatches.map((c) => c.name).join(", ")}) — сначала удалите их расписание`,
    );
  }

  const childIds = parent.childDivisions.map((c) => c.id);
  await prisma.$transaction([
    prisma.tournamentTeam.updateMany({
      where: { divisionId: { in: childIds } },
      data: { divisionId: parentDivisionId },
    }),
    prisma.division.deleteMany({ where: { id: { in: childIds } } }),
  ]);

  await audit(
    user.id,
    "division.merge",
    "Tournament",
    parent.tournamentId,
    `Разделение дивизиона «${parent.name}» отменено`,
  );

  revalidatePath(`/admin/tournaments/${parent.tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Разделение отменено, команды вернулись в дивизион");
}

// ───────────────────────────── Заявка команд ────────────────────────────────

export async function addTeamToTournament(
  tournamentId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const teamId = String(formData.get("teamId") ?? "");
  const divisionRaw = String(formData.get("divisionId") ?? "");
  const divisionId = divisionRaw ? Number(divisionRaw) : null;

  if (!teamId) return fail("Выберите команду");

  const exists = await prisma.tournamentTeam.count({ where: { tournamentId, teamId } });
  if (exists) return fail("Эта команда уже заявлена");

  await prisma.tournamentTeam.create({ data: { tournamentId, teamId, divisionId } });
  await audit(user.id, "entry.create", "Tournament", tournamentId, "Команда заявлена в турнир");

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Команда заявлена");
}

/**
 * Черновик заявок нового сезона: копирует участников и составы из другого турнира.
 *
 * Действие **никогда ничего не удаляет и не обновляет** — оно может только
 * дописать недостающее. Поэтому повторный запуск безопасен и ничего не затрёт,
 * даже если состав уже правили руками. Не превращать в синхронизацию.
 */
export async function copyEntriesFromTournament(
  targetTournamentId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const sourceRaw = String(formData.get("sourceTournamentId") ?? "");
  const sourceId = sourceRaw ? Number(sourceRaw) : 0;
  // Незачёкнутый checkbox в FormData просто отсутствует
  const withRoster = formData.get("withRoster") !== null;
  const withDivisions = formData.get("withDivisions") !== null;

  if (!sourceId) return fail("Выберите турнир-источник");
  if (sourceId === targetTournamentId) return fail("Это тот же самый турнир");

  // Сначала все чтения, потом все записи — чтобы уложиться в таймаут транзакции
  const [source, target] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: sourceId },
      select: {
        name: true,
        season: true,
        divisions: { select: { name: true, sortOrder: true } },
        entries: {
          select: {
            teamId: true,
            division: { select: { name: true } },
            roster: {
              select: {
                playerId: true,
                shirtNumber: true,
                position: true,
                isCaptain: true,
              },
            },
          },
        },
      },
    }),
    prisma.tournament.findUnique({
      where: { id: targetTournamentId },
      select: {
        divisions: { select: { id: true, name: true } },
        entries: {
          select: {
            id: true,
            teamId: true,
            roster: { select: { playerId: true, shirtNumber: true, isCaptain: true } },
          },
        },
      },
    }),
  ]);

  if (!source) return fail("Турнир-источник не найден");
  if (!target) return fail("Турнир не найден");
  if (source.entries.length === 0) return fail("В выбранном турнире нет заявленных команд");

  const key = (name: string) => name.trim().toLowerCase();
  const divisionByName = new Map(target.divisions.map((d) => [key(d.name), d.id]));
  const entryByTeam = new Map(target.entries.map((e) => [e.teamId, e]));

  let addedTeams = 0;
  let existingTeams = 0;
  let addedDivisions = 0;
  let addedPlayers = 0;
  let existingPlayers = 0;
  let numbersDropped = 0;

  if (withDivisions) {
    for (const division of source.divisions) {
      if (divisionByName.has(key(division.name))) continue;
      const created = await prisma.division.create({
        data: {
          tournamentId: targetTournamentId,
          name: division.name,
          sortOrder: division.sortOrder,
        },
        select: { id: true },
      });
      divisionByName.set(key(division.name), created.id);
      addedDivisions++;
    }
  }

  for (const entry of source.entries) {
    let targetEntry = entryByTeam.get(entry.teamId);

    if (targetEntry) {
      existingTeams++;
    } else {
      const divisionId = entry.division ? (divisionByName.get(key(entry.division.name)) ?? null) : null;
      const created = await prisma.tournamentTeam.create({
        data: { tournamentId: targetTournamentId, teamId: entry.teamId, divisionId },
        select: {
          id: true,
          teamId: true,
          roster: { select: { playerId: true, shirtNumber: true, isCaptain: true } },
        },
      });
      targetEntry = created;
      entryByTeam.set(entry.teamId, created);
      addedTeams++;
    }

    if (!withRoster) continue;

    const takenPlayers = new Set(targetEntry.roster.map((r) => r.playerId));
    const takenNumbers = new Set(
      targetEntry.roster.map((r) => r.shirtNumber).filter((n): n is number => n !== null),
    );
    let hasCaptain = targetEntry.roster.some((r) => r.isCaptain);

    const toCreate: Array<{
      tournamentTeamId: number;
      playerId: string;
      shirtNumber: number | null;
      position: PlayerPosition | null;
      isCaptain: boolean;
    }> = [];

    for (const player of entry.roster) {
      if (takenPlayers.has(player.playerId)) {
        existingPlayers++;
        continue;
      }
      takenPlayers.add(player.playerId);

      // Номер занят — оставляем пустым. Молча перенумеровать игрока хуже:
      // организатор не заметит подмены, а пустое поле сразу видно. Номер
      // в проекте и так необязателен.
      let shirtNumber = player.shirtNumber;
      if (shirtNumber !== null && takenNumbers.has(shirtNumber)) {
        shirtNumber = null;
        numbersDropped++;
      }
      if (shirtNumber !== null) takenNumbers.add(shirtNumber);

      const isCaptain = player.isCaptain && !hasCaptain;
      if (isCaptain) hasCaptain = true;

      toCreate.push({
        tournamentTeamId: targetEntry.id,
        playerId: player.playerId,
        shirtNumber,
        position: player.position,
        isCaptain,
      });
    }

    if (toCreate.length > 0) {
      await prisma.rosterEntry.createMany({ data: toCreate, skipDuplicates: true });
      addedPlayers += toCreate.length;
    }
  }

  if (addedTeams === 0 && addedPlayers === 0 && addedDivisions === 0) {
    return done("Всё уже перенесено, менять нечего");
  }

  const parts = [`Добавлено ${addedTeams} команд`];
  if (existingTeams > 0) parts.push(`${existingTeams} уже были заявлены`);
  if (addedDivisions > 0) parts.push(`создано дивизионов: ${addedDivisions}`);
  if (withRoster) {
    parts.push(`перенесено игроков: ${addedPlayers}`);
    if (numbersDropped > 0) parts.push(`у ${numbersDropped} снят номер (был занят)`);
    if (existingPlayers > 0) parts.push(`${existingPlayers} уже были в заявке`);
  }
  const summary = `${parts.join(", ")}.`;

  await audit(
    user.id,
    "entry.copy",
    "Tournament",
    targetTournamentId,
    `Перенос из «${source.name} ${source.season}»: ${summary}`,
  );

  revalidatePath(`/admin/tournaments/${targetTournamentId}`);
  revalidatePath("/tournaments", "layout");
  revalidatePath("/teams", "layout");
  revalidatePath("/series", "layout");
  return done(summary);
}

/**
 * Правка заявки команды. Снятые очки (`pointsAdjustment`) отсюда намеренно
 * не правятся: в лиге они нужны редко, а безымянное поле в строке путало.
 * Если очки придётся снять — значение ставится прямо в базе.
 */
export async function updateEntry(
  entryId: number,
  values: { divisionId: number | null },
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const entry = await prisma.tournamentTeam.update({
    where: { id: entryId },
    data: { divisionId: values.divisionId },
    select: { tournamentId: true },
  });
  await audit(user.id, "entry.update", "TournamentTeam", entryId, "Заявка команды изменена");

  revalidatePath(`/admin/tournaments/${entry.tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Сохранено");
}

export async function removeEntry(entryId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const entry = await prisma.tournamentTeam.findUnique({
    where: { id: entryId },
    select: {
      tournamentId: true,
      _count: { select: { homeMatches: true, awayMatches: true } },
    },
  });
  if (!entry) return fail("Заявка не найдена");
  if (entry._count.homeMatches + entry._count.awayMatches > 0) {
    return fail("У команды уже есть матчи в этом турнире — сначала удалите их");
  }

  await prisma.tournamentTeam.delete({ where: { id: entryId } });
  await audit(user.id, "entry.delete", "Tournament", entry.tournamentId, "Команда снята с турнира");

  revalidatePath(`/admin/tournaments/${entry.tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Команда снята с турнира");
}

// Генератор расписания, пакетная правка туров и импорт живут отдельно —
// в src/server/schedule-actions.ts.

// ───────────────────────────── Площадки ─────────────────────────────────────

/**
 * Поля и стадионы. Раньше их можно было завести только напрямую в базе,
 * а импорт расписания создаёт площадки по названиям из таблицы — значит,
 * опечатку нужно уметь исправить, не лазая в psql.
 */
export async function saveVenue(
  venueId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (name.length < 2) return fail("Слишком короткое название");

  const duplicate = await prisma.venue.findFirst({
    where: { name, ...(venueId ? { id: { not: venueId } } : {}) },
    select: { id: true },
  });
  if (duplicate) return fail("Площадка с таким названием уже есть");

  if (venueId) {
    await prisma.venue.update({ where: { id: venueId }, data: { name, address: address || null } });
    await audit(user.id, "venue.update", "Venue", venueId, `Площадка переименована в «${name}»`);
  } else {
    const created = await prisma.venue.create({ data: { name, address: address || null } });
    await audit(user.id, "venue.create", "Venue", created.id, `Добавлена площадка «${name}»`);
  }

  revalidatePath("/admin/venues");
  revalidatePath("/admin/matches");
  return done(venueId ? "Площадка сохранена" : "Площадка добавлена");
}

export async function deleteVenue(venueId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true, _count: { select: { matches: true } } },
  });
  if (!venue) return fail("Площадка не найдена");
  // onDelete: SetNull молча отвязал бы площадку от матчей — лучше запретить
  if (venue._count.matches > 0) {
    return fail(`Площадка занята: на ней ${venue._count.matches} матчей. Сначала перенесите их.`);
  }

  await prisma.venue.delete({ where: { id: venueId } });
  await audit(user.id, "venue.delete", "Venue", venueId, `Удалена площадка «${venue.name}»`);

  revalidatePath("/admin/venues");
  return done("Площадка удалена");
}

// ───────────────────────────── Матчи ────────────────────────────────────────

const matchSchema = z.object({
  tournamentId: z.coerce.number().int(),
  divisionId: z.string().optional(),
  // Пусто — участники не трогаем: у матча плей-офф они приходят из сетки
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
  kickoffAt: z.string().min(1, "Укажите дату и время"),
  // Незачёкнутый checkbox в FormData просто отсутствует
  kickoffTbd: z.string().optional(),
  venueId: z.string().optional(),
  refereeId: z.string().optional(),
  round: z.string().optional(),
  notes: z.string().trim().max(300).optional(),
  stage: z.enum([
    "REGULAR",
    "PRELIMINARY",
    "ROUND_OF_32",
    "ROUND_OF_16",
    "QUARTER_FINAL",
    "SEMI_FINAL",
    "THIRD_PLACE",
    "FINAL",
  ]),
});

export async function saveMatch(
  matchId: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parsed = matchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const input = parsed.data;

  const homeTeamId = input.homeTeamId ? Number(input.homeTeamId) : null;
  const awayTeamId = input.awayTeamId ? Number(input.awayTeamId) : null;

  if (homeTeamId !== null && homeTeamId === awayTeamId) {
    return fail("Команда не может играть сама с собой");
  }

  const chosen = [homeTeamId, awayTeamId].filter((id): id is number => id !== null);
  let commonDivisionId: number | null = null;
  if (chosen.length > 0) {
    const entries = await prisma.tournamentTeam.findMany({
      where: { id: { in: chosen }, tournamentId: input.tournamentId },
      select: { id: true, divisionId: true },
    });
    if (entries.length !== chosen.length) {
      return fail("Обе команды должны быть заявлены в этот турнир");
    }
    // Дивизион обеих команд совпал — его и подставим, если поле оставили пустым
    if (entries.length === 2 && entries[0].divisionId === entries[1].divisionId) {
      commonDivisionId = entries[0].divisionId;
    }
  }
  // Новый матч без участников имеет смысл только в сетке плей-офф,
  // где команды подставляются по источникам.
  if (!matchId && chosen.length < 2 && input.stage === "REGULAR") {
    return fail("Для матча регулярного этапа выберите обе команды");
  }

  const referee = await resolveReferee(input.refereeId || null);
  if (!referee.ok) return fail(referee.error);

  const data = {
    tournamentId: input.tournamentId,
    // Матч учитывается в таблице того дивизиона, что записан здесь, поэтому
    // пустое поле при однозначных командах лучше заполнить самим.
    divisionId: input.divisionId ? Number(input.divisionId) : commonDivisionId,
    // Пустое поле не затирает участника, подставленного сеткой
    ...(homeTeamId !== null ? { homeTeamId } : {}),
    ...(awayTeamId !== null ? { awayTeamId } : {}),
    kickoffAt: fromDateTimeInput(input.kickoffAt),
    kickoffTbd: !!input.kickoffTbd,
    venueId: input.venueId ? Number(input.venueId) : null,
    refereeId: input.refereeId || null,
    round: input.round ? Number(input.round) : null,
    stage: input.stage,
    notes: input.notes || null,
  };

  if (matchId) {
    await prisma.match.update({ where: { id: matchId }, data });
    await audit(user.id, "match.update", "Match", matchId, "Матч изменён");
  } else {
    const created = await prisma.match.create({ data });
    await audit(user.id, "match.create", "Match", created.id, "Матч создан");
  }

  revalidatePath("/admin/matches");
  revalidatePath("/");
  revalidatePath("/tournaments", "layout");
  return done("Матч сохранён");
}

export async function deleteMatch(matchId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  // Иначе onDelete: SetNull молча обнулил бы участника в сетке плей-офф
  const dependent = await prisma.match.findFirst({
    where: { OR: [{ homeSourceMatchId: matchId }, { awaySourceMatchId: matchId }] },
    select: { id: true },
  });
  if (dependent) {
    return fail(
      `Этот матч — источник участника для матча №${dependent.id}. Сначала измените источник в сетке плей-офф.`,
    );
  }

  await prisma.match.delete({ where: { id: matchId } });
  await audit(user.id, "match.delete", "Match", matchId, "Матч удалён");

  revalidatePath("/admin/matches");
  revalidatePath("/");
  revalidatePath("/tournaments", "layout");
  return done("Матч удалён");
}

export async function assignReferee(matchId: number, refereeId: string | null): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { referee: { select: { fullName: true } } },
  });
  if (!match) return fail("Матч не найден");

  const referee = await resolveReferee(refereeId);
  if (!referee.ok) return fail(referee.error);

  await prisma.match.update({ where: { id: matchId }, data: { refereeId } });
  await audit(
    user.id,
    "match.referee",
    "Match",
    matchId,
    referee.fullName
      ? `Судья: ${referee.fullName}${match.referee ? ` (был: ${match.referee.fullName})` : ""}`
      : `Судья снят${match.referee ? ` (был: ${match.referee.fullName})` : ""}`,
  );

  revalidatePath("/admin/matches");
  revalidatePath("/referee");
  revalidatePath(`/referee/${matchId}`);
  revalidatePath(`/matches/${matchId}`);
  return done(referee.fullName ? "Судья назначен" : "Судья снят");
}

// ───────────────────────────── Команды ──────────────────────────────────────

const teamSchema = z.object({
  name: z.string().trim().min(2, "Слишком короткое название"),
  shortName: z.string().trim().min(2, "Укажите короткое название").max(30),
  facultyId: z.string().optional(),
  primaryColor: z.string().trim().optional(),
  foundedYear: z.string().optional(),
  logoUrl: z.string().trim().optional(),
  description: z.string().trim().max(1000).optional(),
});

export async function saveTeam(
  teamId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const input = parsed.data;

  const data = {
    name: input.name,
    shortName: input.shortName,
    facultyId: input.facultyId ? Number(input.facultyId) : null,
    primaryColor: input.primaryColor || null,
    foundedYear: input.foundedYear ? Number(input.foundedYear) : null,
    logoUrl: input.logoUrl || null,
    description: input.description || null,
  };

  if (teamId) {
    await prisma.team.update({ where: { id: teamId }, data });
    await audit(user.id, "team.update", "Team", teamId, `Команда «${input.name}» изменена`);
  } else {
    const slug = await uniqueSlug(
      slugify(input.shortName),
      async (s) => (await prisma.team.count({ where: { slug: s } })) > 0,
    );
    const created = await prisma.team.create({ data: { ...data, slug } });
    await audit(user.id, "team.create", "Team", created.id, `Создана команда «${input.name}»`);
  }

  revalidatePath("/admin/teams");
  revalidatePath("/teams", "layout");
  return done("Команда сохранена");
}

// ───────────────────────────── Игроки ───────────────────────────────────────

const playerSchema = z.object({
  firstName: z.string().trim().min(2, "Укажите имя"),
  lastName: z.string().trim().min(2, "Укажите фамилию"),
  middleName: z.string().trim().optional(),
  birthDate: z.string().optional(),
  facultyId: z.string().optional(),
  course: z.string().optional(),
  msuStatus: z.enum(["STUDENT", "POSTGRAD", "ALUMNI", "STAFF", "GUEST"]),
  preferredPosition: z.string().optional(),
  photoUrl: z.string().trim().optional(),
});

export async function savePlayer(
  playerId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const parsed = playerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const input = parsed.data;

  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    middleName: input.middleName || null,
    birthDate: input.birthDate ? fromDateInput(input.birthDate) : null,
    facultyId: input.facultyId ? Number(input.facultyId) : null,
    course: input.course ? Number(input.course) : null,
    msuStatus: input.msuStatus,
    preferredPosition: toPosition(input.preferredPosition),
    photoUrl: input.photoUrl || null,
  };

  if (playerId) {
    await prisma.player.update({ where: { id: playerId }, data });
    await audit(user.id, "player.update", "Player", playerId, `Игрок ${input.lastName} изменён`);
  } else {
    const created = await prisma.player.create({ data });
    await audit(user.id, "player.create", "Player", created.id, `Добавлен игрок ${input.lastName}`);
  }

  revalidatePath("/admin/players");
  return done("Игрок сохранён");
}

// ───────────────────────────── Заявка состава ───────────────────────────────

/** Доступ к заявке: организатор или капитан этой самой команды. */
async function canManageRoster(tournamentTeamId: number) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "ADMIN") return user;
  if (user.role !== "CAPTAIN" || !user.teamId) return null;

  const entry = await prisma.tournamentTeam.findUnique({
    where: { id: tournamentTeamId },
    select: { teamId: true },
  });
  return entry && entry.teamId === user.teamId ? user : null;
}

export async function addRosterEntry(
  tournamentTeamId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await canManageRoster(tournamentTeamId);
  if (!user) return fail("Нет прав на изменение этой заявки");

  const playerId = String(formData.get("playerId") ?? "");
  const position = String(formData.get("position") ?? "");

  if (!playerId) return fail("Выберите игрока");

  // Номер необязателен: у части студенческих команд его просто нет.
  const parsedNumber = parseShirtNumber(formData.get("shirtNumber"));
  if (!parsedNumber.ok) return fail(parsedNumber.error);
  const shirtNumber = parsedNumber.value;

  const duplicate = await prisma.rosterEntry.count({ where: { tournamentTeamId, playerId } });
  if (duplicate) return fail("Этот игрок уже в заявке");

  if (shirtNumber !== null) {
    const numberTaken = await prisma.rosterEntry.count({
      where: { tournamentTeamId, shirtNumber },
    });
    if (numberTaken) return fail(`Номер ${shirtNumber} уже занят`);
  }

  await prisma.rosterEntry.create({
    data: {
      tournamentTeamId,
      playerId,
      shirtNumber,
      position: toPosition(position),
    },
  });
  await audit(user.id, "roster.add", "TournamentTeam", tournamentTeamId, "Игрок добавлен в заявку");

  revalidatePath("/captain");
  revalidatePath("/admin/tournaments", "layout");
  revalidatePath("/teams", "layout");
  return done("Игрок добавлен в заявку");
}

export async function removeRosterEntry(rosterEntryId: number): Promise<FormState> {
  const entry = await prisma.rosterEntry.findUnique({
    where: { id: rosterEntryId },
    select: { tournamentTeamId: true, _count: { select: { events: true, lineups: true } } },
  });
  if (!entry) return fail("Запись не найдена");

  const user = await canManageRoster(entry.tournamentTeamId);
  if (!user) return fail("Нет прав на изменение этой заявки");

  if (entry._count.events > 0 || entry._count.lineups > 0) {
    return fail("Игрок уже участвовал в матчах — его нельзя убрать из заявки");
  }

  await prisma.rosterEntry.delete({ where: { id: rosterEntryId } });
  await audit(user.id, "roster.remove", "TournamentTeam", entry.tournamentTeamId, "Игрок убран из заявки");

  revalidatePath("/captain");
  revalidatePath("/admin/tournaments", "layout");
  revalidatePath("/teams", "layout");
  return done("Игрок убран из заявки");
}

export async function updateRosterEntry(
  rosterEntryId: number,
  values: { shirtNumber: number | null; position: string | null; isCaptain: boolean },
): Promise<FormState> {
  const entry = await prisma.rosterEntry.findUnique({
    where: { id: rosterEntryId },
    select: { tournamentTeamId: true },
  });
  if (!entry) return fail("Запись не найдена");

  const user = await canManageRoster(entry.tournamentTeamId);
  if (!user) return fail("Нет прав на изменение этой заявки");

  // Значение приходит прямо из браузера, поэтому проверяем его так же
  // строго, как данные формы: NaN и дробные числа сюда тоже долетают.
  const parsedNumber = parseShirtNumber(values.shirtNumber);
  if (!parsedNumber.ok) return fail(parsedNumber.error);
  const shirtNumber = parsedNumber.value;

  if (shirtNumber !== null) {
    const taken = await prisma.rosterEntry.count({
      where: {
        tournamentTeamId: entry.tournamentTeamId,
        shirtNumber,
        id: { not: rosterEntryId },
      },
    });
    if (taken) return fail(`Номер ${shirtNumber} уже занят`);
  }

  // Капитан в команде один
  if (values.isCaptain) {
    await prisma.rosterEntry.updateMany({
      where: { tournamentTeamId: entry.tournamentTeamId },
      data: { isCaptain: false },
    });
  }

  await prisma.rosterEntry.update({
    where: { id: rosterEntryId },
    data: {
      shirtNumber,
      position: toPosition(values.position),
      isCaptain: values.isCaptain,
    },
  });
  await audit(
    user.id,
    "roster.update",
    "TournamentTeam",
    entry.tournamentTeamId,
    `Изменена карточка игрока в заявке (номер: ${shirtNumber ?? "нет"})`,
  );

  revalidatePath("/captain");
  revalidatePath("/admin/tournaments", "layout");
  revalidatePath("/teams", "layout");
  return done("Сохранено");
}

// ───────────────────────────── Пользователи ─────────────────────────────────

const userSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  fullName: z.string().trim().min(3, "Укажите имя и фамилию"),
  role: z.enum(["ADMIN", "REFEREE", "CAPTAIN", "VIEWER"]),
  teamId: z.string().optional(),
  password: z.string().optional(),
});

export async function saveUser(
  userId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdminUser();
  if (!admin) return fail("Нужны права организатора");

  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Проверьте поля");
  const input = parsed.data;

  if (input.role === "CAPTAIN" && !input.teamId) {
    return fail("Для капитана нужно выбрать команду");
  }
  if (input.password && input.password.length < 8) {
    return fail("Пароль должен быть не короче 8 символов");
  }

  const taken = await prisma.user.count({
    where: { email: input.email, ...(userId ? { id: { not: userId } } : {}) },
  });
  if (taken) return fail("Пользователь с таким email уже есть");

  const data = {
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    teamId: input.role === "CAPTAIN" ? input.teamId || null : null,
  };

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    });
    await audit(admin.id, "user.update", "User", userId, `Аккаунт ${input.email} изменён`);
  } else {
    if (!input.password) return fail("Задайте пароль для нового пользователя");
    const created = await prisma.user.create({
      data: { ...data, passwordHash: await hashPassword(input.password) },
    });
    await audit(admin.id, "user.create", "User", created.id, `Создан аккаунт ${input.email}`);
  }

  revalidatePath("/admin/users");
  return done("Пользователь сохранён");
}

export async function toggleUserActive(userId: string): Promise<FormState> {
  const admin = await requireAdminUser();
  if (!admin) return fail("Нужны права организатора");
  if (admin.id === userId) return fail("Нельзя отключить собственный аккаунт");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, email: true } });
  if (!user) return fail("Пользователь не найден");

  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  await audit(
    admin.id,
    "user.toggle",
    "User",
    userId,
    `${user.isActive ? "Отключён" : "Включён"} аккаунт ${user.email}`,
  );

  revalidatePath("/admin/users");
  return done(user.isActive ? "Аккаунт отключён" : "Аккаунт включён");
}
