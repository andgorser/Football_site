"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlayerPosition } from "@prisma/client";

import { getCurrentUser, hashPassword } from "@/lib/auth";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";

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
  redirect(`/admin/tournaments/${id}`);
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

  const exists = await prisma.division.count({ where: { tournamentId, name } });
  if (exists) return fail("Такой дивизион уже есть");

  const count = await prisma.division.count({ where: { tournamentId } });
  await prisma.division.create({ data: { tournamentId, name, sortOrder: count + 1 } });
  await audit(user.id, "division.create", "Tournament", tournamentId, `Добавлен дивизион «${name}»`);

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath("/tournaments", "layout");
  return done("Дивизион добавлен");
}

export async function deleteDivision(divisionId: number): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: { tournamentId: true, name: true },
  });
  if (!division) return fail("Дивизион не найден");

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

export async function updateEntry(
  entryId: number,
  values: { divisionId: number | null; pointsAdjustment: number },
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const entry = await prisma.tournamentTeam.update({
    where: { id: entryId },
    data: {
      divisionId: values.divisionId,
      pointsAdjustment: Math.trunc(values.pointsAdjustment),
    },
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

// ───────────────────────────── Расписание ───────────────────────────────────

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

export async function generateSchedule(
  tournamentId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminUser();
  if (!user) return fail("Нужны права организатора");

  const divisionRaw = String(formData.get("divisionId") ?? "");
  const divisionId = divisionRaw ? Number(divisionRaw) : null;
  const firstRound = String(formData.get("firstRound") ?? "");
  const intervalDays = Number(formData.get("intervalDays") ?? 7);
  const matchGapMinutes = Number(formData.get("matchGapMinutes") ?? 120);

  if (!firstRound) return fail("Укажите дату и время первого тура");

  const entries = await prisma.tournamentTeam.findMany({
    where: { tournamentId, ...(divisionId ? { divisionId } : {}) },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (entries.length < 2) return fail("Нужно минимум две заявленные команды");

  const existing = await prisma.match.count({
    where: { tournamentId, ...(divisionId ? { divisionId } : {}) },
  });
  if (existing > 0) {
    return fail("Матчи для этого дивизиона уже созданы — удалите их, если нужно пересоздать");
  }

  const start = fromDateTimeInput(firstRound);
  const rounds = roundRobinPairs(entries.map((e) => e.id));

  const data = rounds.flatMap((pairs, roundIndex) =>
    pairs.map(([homeTeamId, awayTeamId], matchIndex) => ({
      tournamentId,
      divisionId,
      round: roundIndex + 1,
      homeTeamId,
      awayTeamId,
      kickoffAt: new Date(
        start.getTime() +
          roundIndex * intervalDays * 86_400_000 +
          matchIndex * matchGapMinutes * 60_000,
      ),
    })),
  );

  await prisma.match.createMany({ data });
  await audit(
    user.id,
    "schedule.generate",
    "Tournament",
    tournamentId,
    `Создано расписание: ${data.length} матчей в ${rounds.length} турах`,
  );

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath("/admin/matches");
  revalidatePath("/tournaments", "layout");
  revalidatePath("/");
  return done(`Создано ${data.length} матчей`);
}

// ───────────────────────────── Матчи ────────────────────────────────────────

const matchSchema = z.object({
  tournamentId: z.coerce.number().int(),
  divisionId: z.string().optional(),
  // Пусто — участники не трогаем: у матча плей-офф они приходят из сетки
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
  kickoffAt: z.string().min(1, "Укажите дату и время"),
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
  if (chosen.length > 0) {
    const entries = await prisma.tournamentTeam.findMany({
      where: { id: { in: chosen }, tournamentId: input.tournamentId },
      select: { id: true },
    });
    if (entries.length !== chosen.length) {
      return fail("Обе команды должны быть заявлены в этот турнир");
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
    divisionId: input.divisionId ? Number(input.divisionId) : null,
    // Пустое поле не затирает участника, подставленного сеткой
    ...(homeTeamId !== null ? { homeTeamId } : {}),
    ...(awayTeamId !== null ? { awayTeamId } : {}),
    kickoffAt: fromDateTimeInput(input.kickoffAt),
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
