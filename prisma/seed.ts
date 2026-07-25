/**
 * Наполнение базы демонстрационными данными.
 *
 *   npm run db:seed
 *
 * Скрипт полностью очищает таблицы и создаёт заново: факультеты, команды,
 * игроков, чемпионат с двумя дивизионами и кубок. Часть туров «сыграна»
 * со всеми событиями, один матч идёт прямо сейчас, остальные впереди —
 * так сайт выглядит живым сразу после установки.
 *
 * Расписание строится относительно текущей даты, поэтому данные не
 * протухают, когда бы вы ни запустили скрипт.
 */

import { PrismaClient, type MatchEventType, type PlayerPosition } from "@prisma/client";
import bcrypt from "bcryptjs";

import { scoreFromEvents } from "../src/lib/football";

const prisma = new PrismaClient();

// ───────────────────────── Детерминированная случайность ────────────────────
// Свой генератор вместо Math.random(), чтобы каждый запуск давал одинаковую
// базу: так проще воспроизводить баги и сравнивать скриншоты.

let seedState = 20260214;
function random(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function chance(probability: number): boolean {
  return random() < probability;
}

// ───────────────────────────── Справочные данные ────────────────────────────

const FACULTIES = [
  { name: "Механико-математический факультет", shortName: "Мехмат" },
  { name: "Факультет вычислительной математики и кибернетики", shortName: "ВМК" },
  { name: "Физический факультет", shortName: "Физфак" },
  { name: "Химический факультет", shortName: "Химфак" },
  { name: "Биологический факультет", shortName: "Биофак" },
  { name: "Экономический факультет", shortName: "Экономфак" },
  { name: "Юридический факультет", shortName: "Юрфак" },
  { name: "Исторический факультет", shortName: "Истфак" },
  { name: "Философский факультет", shortName: "Философский" },
  { name: "Филологический факультет", shortName: "Филфак" },
  { name: "Географический факультет", shortName: "Геофак" },
  { name: "Геологический факультет", shortName: "Геолфак" },
  { name: "Факультет журналистики", shortName: "Журфак" },
  { name: "Факультет психологии", shortName: "Психфак" },
  { name: "Социологический факультет", shortName: "Соцфак" },
  { name: "Высшая школа бизнеса", shortName: "ВШБ" },
  { name: "Факультет фундаментальной медицины", shortName: "ФФМ" },
  { name: "Факультет глобальных процессов", shortName: "ФГП" },
];

const VENUES = [
  { name: "Спорткомплекс МГУ, поле №1", address: "Москва, Мичуринский пр-т, 1" },
  { name: "Спорткомплекс МГУ, поле №2", address: "Москва, Мичуринский пр-т, 1" },
  { name: "Манеж на Мичуринском", address: "Москва, Мичуринский пр-т, 2" },
  { name: "Поле у Главного здания", address: "Москва, Ленинские горы, 1" },
];

// Команды старшего дивизиона (индекс факультета, название, цвет)
const TOP_TEAMS = [
  { faculty: "Мехмат", name: "Мехмат", color: "#2563eb" },
  { faculty: "ВМК", name: "ВМК", color: "#0d9488" },
  { faculty: "Физфак", name: "Физфак", color: "#dc2626" },
  { faculty: "Экономфак", name: "Экономфак", color: "#16a34a" },
  { faculty: "Юрфак", name: "Юрфак", color: "#7c3aed" },
  { faculty: "Химфак", name: "Химфак", color: "#ea580c" },
  { faculty: "ВШБ", name: "ВШБ", color: "#0891b2" },
  { faculty: "Геофак", name: "Геофак", color: "#65a30d" },
];

const SECOND_TEAMS = [
  { faculty: "Биофак", name: "Биофак", color: "#059669" },
  { faculty: "Истфак", name: "Истфак", color: "#b45309" },
  { faculty: "Журфак", name: "Журфак", color: "#db2777" },
  { faculty: "Психфак", name: "Психфак", color: "#4f46e5" },
  { faculty: "Филфак", name: "Филфак", color: "#9333ea" },
  { faculty: "Соцфак", name: "Соцфак", color: "#0284c7" },
  { faculty: "ФФМ", name: "ФФМ", color: "#e11d48" },
  { faculty: "Геолфак", name: "Геолфак", color: "#78716c" },
];

const FIRST_NAMES = [
  "Александр", "Дмитрий", "Максим", "Иван", "Никита", "Артём", "Егор", "Михаил",
  "Данила", "Кирилл", "Илья", "Андрей", "Сергей", "Роман", "Тимофей", "Владимир",
  "Павел", "Антон", "Григорий", "Фёдор", "Пётр", "Николай", "Алексей", "Константин",
  "Матвей", "Ярослав", "Марк", "Глеб", "Арсений", "Всеволод",
];

const LAST_NAMES = [
  "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов",
  "Михайлов", "Новиков", "Фёдоров", "Морозов", "Волков", "Алексеев", "Лебедев",
  "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев", "Орлов",
  "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов",
  "Яковлев", "Григорьев", "Романов", "Воробьёв", "Сергеев", "Кузьмин", "Фролов",
  "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв", "Ильин", "Максимов",
  "Поляков", "Сорокин", "Виноградов", "Ковалёв", "Белов", "Медведев", "Антонов",
  "Тарасов", "Жуков", "Баранов", "Филиппов", "Комаров", "Давыдов", "Беляев",
  "Герасимов", "Богданов", "Осипов", "Сидоров", "Матвеев", "Титов", "Марков",
  "Миронов", "Крылов", "Куликов", "Карпов", "Власов", "Мельников", "Денисов",
];

const MIDDLE_NAMES = [
  "Александрович", "Дмитриевич", "Сергеевич", "Андреевич", "Иванович",
  "Михайлович", "Павлович", "Николаевич", "Владимирович", "Алексеевич",
];

/** Состав команды: 2 вратаря, 5 защитников, 6 полузащитников, 3 нападающих. */
const SQUAD_SHAPE: PlayerPosition[] = [
  "GK", "GK",
  "DF", "DF", "DF", "DF", "DF",
  "MF", "MF", "MF", "MF", "MF", "MF",
  "FW", "FW", "FW",
];

const DAY = 24 * 60 * 60 * 1000;

// ───────────────────────────── Вспомогательное ──────────────────────────────

function slugify(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", " ": "-",
  };
  return value
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? (/[a-z0-9-]/.test(ch) ? ch : ""))
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Круговой турнир методом «карусели»: n-1 туров, в каждом n/2 матчей. */
function roundRobin(teamIds: number[]): Array<Array<[number, number]>> {
  const teams = [...teamIds];
  const n = teams.length;
  const rounds: Array<Array<[number, number]>> = [];
  const rotating = teams.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const pairs: Array<[number, number]> = [];
    const order = [teams[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const home = order[i];
      const away = order[n - 1 - i];
      // Чередуем поле, чтобы команды не играли все матчи дома
      pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop()!);
  }
  return rounds;
}

/** Полночь ближайшей субботы в прошлом/будущем относительно даты. */
function saturdayOffsetWeeks(base: Date, weeks: number): Date {
  const d = new Date(base);
  d.setUTCHours(9, 0, 0, 0); // 12:00 по Москве
  const daysToSaturday = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + daysToSaturday + weeks * 7);
  return d;
}

// ───────────────────────────── Основной сценарий ────────────────────────────

async function main() {
  const now = new Date();
  const password = process.env.SEED_PASSWORD ?? "football2025";
  const passwordHash = await bcrypt.hash(password, 10);

  console.log("Очищаю базу…");
  // Порядок важен: сначала зависимые таблицы.
  await prisma.auditLog.deleteMany();
  await prisma.matchEvent.deleteMany();
  await prisma.matchLineup.deleteMany();
  await prisma.match.deleteMany();
  await prisma.rosterEntry.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.division.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.faculty.deleteMany();

  console.log("Создаю справочники…");
  const faculties = new Map<string, number>();
  for (const f of FACULTIES) {
    const created = await prisma.faculty.create({ data: f });
    faculties.set(f.shortName, created.id);
  }

  const venues = [];
  for (const v of VENUES) venues.push(await prisma.venue.create({ data: v }));

  console.log("Создаю команды и игроков…");
  const allTeamDefs = [...TOP_TEAMS, ...SECOND_TEAMS];
  const teams = [];
  const usedNames = new Set<string>();

  for (const def of allTeamDefs) {
    const team = await prisma.team.create({
      data: {
        slug: slugify(def.name),
        name: `ФК «${def.name}»`,
        shortName: def.name,
        primaryColor: def.color,
        facultyId: faculties.get(def.faculty) ?? null,
        foundedYear: randomInt(1998, 2020),
        description: `Сборная команда факультета «${def.faculty}» по футболу.`,
      },
    });

    // Игроки команды
    const players = [];
    for (const position of SQUAD_SHAPE) {
      let firstName = pick(FIRST_NAMES);
      let lastName = pick(LAST_NAMES);
      let guard = 0;
      while (usedNames.has(`${lastName} ${firstName}`) && guard++ < 50) {
        firstName = pick(FIRST_NAMES);
        lastName = pick(LAST_NAMES);
      }
      usedNames.add(`${lastName} ${firstName}`);

      const course = randomInt(1, 6);
      const birthYear = now.getFullYear() - 17 - course - randomInt(0, 2);
      players.push(
        await prisma.player.create({
          data: {
            firstName,
            lastName,
            middleName: chance(0.7) ? pick(MIDDLE_NAMES) : null,
            birthDate: new Date(Date.UTC(birthYear, randomInt(0, 11), randomInt(1, 28))),
            msuStatus: chance(0.85) ? "STUDENT" : chance(0.5) ? "POSTGRAD" : "ALUMNI",
            facultyId: faculties.get(def.faculty) ?? null,
            course,
            preferredPosition: position,
          },
        }),
      );
    }

    teams.push({ team, def, players });
  }

  console.log("Создаю пользователей…");
  const admin = await prisma.user.create({
    data: {
      email: "admin@msu.football",
      passwordHash,
      fullName: "Андрей Горсер",
      role: "ADMIN",
    },
  });

  const referees = [];
  const refereeNames = [
    "Сергей Волошин",
    "Артём Кравцов",
    "Игорь Тимофеев",
    "Денис Панов",
  ];
  for (let i = 0; i < refereeNames.length; i++) {
    referees.push(
      await prisma.user.create({
        data: {
          email: `referee${i + 1}@msu.football`,
          passwordHash,
          fullName: refereeNames[i],
          role: "REFEREE",
        },
      }),
    );
  }

  for (const { team, players } of teams) {
    const captainPlayer = players[7];
    await prisma.user.create({
      data: {
        email: `captain.${team.slug}@msu.football`,
        passwordHash,
        fullName: `${captainPlayer.lastName} ${captainPlayer.firstName}`,
        role: "CAPTAIN",
        teamId: team.id,
      },
    });
  }

  await prisma.user.create({
    data: {
      email: "viewer@msu.football",
      passwordHash,
      fullName: "Болельщик",
      role: "VIEWER",
    },
  });

  console.log("Создаю чемпионат…");
  const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const season = `${seasonStartYear}/${String((seasonStartYear + 1) % 100).padStart(2, "0")}`;

  const championship = await prisma.tournament.create({
    data: {
      slug: `chempionat-mgu-${seasonStartYear}`,
      name: "Чемпионат МГУ по футболу",
      season,
      format: "LEAGUE",
      status: "ONGOING",
      startDate: saturdayOffsetWeeks(now, -5),
      endDate: saturdayOffsetWeeks(now, 3),
      halfDurationMin: 30,
      description:
        "Основной турнир сезона среди сборных факультетов. Два дивизиона, круговая система в один круг.",
    },
  });

  const topDivision = await prisma.division.create({
    data: { tournamentId: championship.id, name: "Высший дивизион", sortOrder: 1 },
  });
  const firstDivision = await prisma.division.create({
    data: { tournamentId: championship.id, name: "Первый дивизион", sortOrder: 2 },
  });

  // Заявки команд и игроков
  const entries: EntryMap = new Map();

  for (const { team, players } of teams) {
    const divisionId = TOP_TEAMS.some((t) => slugify(t.name) === team.slug)
      ? topDivision.id
      : firstDivision.id;

    const entry = await prisma.tournamentTeam.create({
      data: { tournamentId: championship.id, teamId: team.id, divisionId },
    });

    const rosterEntries = [];
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const created = await prisma.rosterEntry.create({
        data: {
          tournamentTeamId: entry.id,
          playerId: player.id,
          shirtNumber: i === 0 ? 1 : i + 1,
          position: player.preferredPosition,
          isCaptain: i === 7,
        },
      });
      rosterEntries.push({
        id: created.id,
        position: player.preferredPosition!,
        shirtNumber: created.shirtNumber,
      });
    }
    entries.set(team.slug, { id: entry.id, players: rosterEntries });
  }

  console.log("Строю расписание и играю матчи…");

  const PLAYED_ROUNDS = 4; // столько туров уже сыграно

  for (const [division, teamDefs] of [
    [topDivision, TOP_TEAMS],
    [firstDivision, SECOND_TEAMS],
  ] as const) {
    const entryIds = teamDefs.map((t) => entries.get(slugify(t.name))!.id);
    const rounds = roundRobin(entryIds);

    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
      const roundDate = saturdayOffsetWeeks(now, roundIndex - PLAYED_ROUNDS);
      const isPast = roundIndex < PLAYED_ROUNDS;
      const isCurrentRound = roundIndex === PLAYED_ROUNDS;

      for (let matchIndex = 0; matchIndex < rounds[roundIndex].length; matchIndex++) {
        const [homeEntryId, awayEntryId] = rounds[roundIndex][matchIndex];
        const kickoffAt = new Date(roundDate.getTime() + matchIndex * 2 * 60 * 60 * 1000);

        // Один матч текущего тура в высшем дивизионе идёт прямо сейчас
        const isLiveMatch =
          isCurrentRound && matchIndex === 0 && division.id === topDivision.id;

        const match = await prisma.match.create({
          data: {
            tournamentId: championship.id,
            divisionId: division.id,
            round: roundIndex + 1,
            homeTeamId: homeEntryId,
            awayTeamId: awayEntryId,
            kickoffAt: isLiveMatch ? new Date(now.getTime() - 52 * 60 * 1000) : kickoffAt,
            venueId: venues[matchIndex % venues.length].id,
            refereeId: referees[(roundIndex + matchIndex) % referees.length].id,
            status: isPast ? "FINISHED" : isLiveMatch ? "SECOND_HALF" : "SCHEDULED",
            periodStartedAt: isLiveMatch ? new Date(now.getTime() - 7 * 60 * 1000) : null,
            clockOffsetSec: isLiveMatch ? 30 * 60 : 0,
          },
        });

        if (!isPast && !isLiveMatch) continue;

        await playMatch(match.id, homeEntryId, awayEntryId, entries, {
          isLive: isLiveMatch,
          halfDuration: championship.halfDurationMin,
          authorId: referees[(roundIndex + matchIndex) % referees.length].id,
        });
      }
    }
  }

  console.log("Создаю кубок…");
  const cup = await prisma.tournament.create({
    data: {
      slug: `kubok-mgu-${seasonStartYear}`,
      name: "Кубок МГУ",
      season,
      format: "CUP",
      status: "UPCOMING",
      startDate: saturdayOffsetWeeks(now, 4),
      halfDurationMin: 30,
      description: "Кубковый турнир на выбывание. Участвуют команды обоих дивизионов.",
    },
  });

  const cupEntries: number[] = [];
  for (const { team } of teams.slice(0, 8)) {
    const entry = await prisma.tournamentTeam.create({
      data: { tournamentId: cup.id, teamId: team.id },
    });
    cupEntries.push(entry.id);

    // Заявка на кубок — те же игроки
    const source = entries.get(team.slug)!;
    const players = await prisma.rosterEntry.findMany({
      where: { tournamentTeamId: source.id },
      select: { playerId: true, shirtNumber: true, position: true, isCaptain: true },
    });
    for (const p of players) {
      await prisma.rosterEntry.create({ data: { tournamentTeamId: entry.id, ...p } });
    }
  }

  const cupDate = saturdayOffsetWeeks(now, 4);
  const quarterFinals = [];
  for (let i = 0; i < 4; i++) {
    quarterFinals.push(
      await prisma.match.create({
        data: {
          tournamentId: cup.id,
          stage: "QUARTER_FINAL",
          bracketOrder: i,
          homeTeamId: cupEntries[i * 2],
          awayTeamId: cupEntries[i * 2 + 1],
          kickoffAt: new Date(cupDate.getTime() + i * 2 * 60 * 60 * 1000),
          venueId: venues[i % venues.length].id,
          refereeId: referees[i % referees.length].id,
          status: "SCHEDULED",
        },
      }),
    );
  }

  // Дальше по сетке участники ещё не известны — записываем источники.
  // Именно так собирается плей-офф поверх дивизионов: матч создаётся заранее,
  // а команда подставится, когда определится победитель предыдущей стадии.
  const semiFinals = [];
  for (let i = 0; i < 2; i++) {
    semiFinals.push(
      await prisma.match.create({
        data: {
          tournamentId: cup.id,
          stage: "SEMI_FINAL",
          bracketOrder: i,
          kickoffAt: new Date(saturdayOffsetWeeks(now, 5).getTime() + i * 2 * 60 * 60 * 1000),
          venueId: venues[i % venues.length].id,
          refereeId: referees[i % referees.length].id,
          homeSource: "MATCH_WINNER",
          homeSourceMatchId: quarterFinals[i * 2].id,
          awaySource: "MATCH_WINNER",
          awaySourceMatchId: quarterFinals[i * 2 + 1].id,
        },
      }),
    );
  }

  await prisma.match.create({
    data: {
      tournamentId: cup.id,
      stage: "FINAL",
      kickoffAt: saturdayOffsetWeeks(now, 6),
      venueId: venues[0].id,
      refereeId: referees[0].id,
      homeSource: "MATCH_WINNER",
      homeSourceMatchId: semiFinals[0].id,
      awaySource: "MATCH_WINNER",
      awaySourceMatchId: semiFinals[1].id,
    },
  });

  await prisma.match.create({
    data: {
      tournamentId: cup.id,
      stage: "THIRD_PLACE",
      kickoffAt: new Date(saturdayOffsetWeeks(now, 6).getTime() - 2 * 60 * 60 * 1000),
      venueId: venues[1].id,
      refereeId: referees[1].id,
      homeSource: "MATCH_LOSER",
      homeSourceMatchId: semiFinals[0].id,
      awaySource: "MATCH_LOSER",
      awaySourceMatchId: semiFinals[1].id,
    },
  });

  // Плей-офф чемпионата — тот самый сценарий «дивизионы + общая сетка»:
  // победители дивизионов сразу в полуфинал, вторые и третьи места
  // сначала играют между собой.
  console.log("Создаю плей-офф чемпионата…");
  const playoffDate = saturdayOffsetWeeks(now, 3);
  const preliminary = [];
  for (const [homeDiv, homePlace, awayDiv, awayPlace] of [
    [topDivision.id, 2, firstDivision.id, 3],
    [firstDivision.id, 2, topDivision.id, 3],
  ] as const) {
    preliminary.push(
      await prisma.match.create({
        data: {
          tournamentId: championship.id,
          stage: "PRELIMINARY",
          bracketOrder: preliminary.length,
          kickoffAt: new Date(playoffDate.getTime() + preliminary.length * 2 * 60 * 60 * 1000),
          venueId: venues[0].id,
          refereeId: referees[preliminary.length % referees.length].id,
          homeSource: "DIVISION_PLACE",
          homeSourceDivisionId: homeDiv,
          homeSourcePlace: homePlace,
          awaySource: "DIVISION_PLACE",
          awaySourceDivisionId: awayDiv,
          awaySourcePlace: awayPlace,
        },
      }),
    );
  }

  const championshipSemis = [];
  for (const [divisionId, sourceMatch] of [
    [topDivision.id, preliminary[1]],
    [firstDivision.id, preliminary[0]],
  ] as const) {
    championshipSemis.push(
      await prisma.match.create({
        data: {
          tournamentId: championship.id,
          stage: "SEMI_FINAL",
          bracketOrder: championshipSemis.length,
          kickoffAt: new Date(
            saturdayOffsetWeeks(now, 4).getTime() + championshipSemis.length * 2 * 60 * 60 * 1000,
          ),
          venueId: venues[1].id,
          refereeId: referees[championshipSemis.length % referees.length].id,
          homeSource: "DIVISION_PLACE",
          homeSourceDivisionId: divisionId,
          homeSourcePlace: 1,
          awaySource: "MATCH_WINNER",
          awaySourceMatchId: sourceMatch.id,
        },
      }),
    );
  }

  await prisma.match.create({
    data: {
      tournamentId: championship.id,
      stage: "FINAL",
      kickoffAt: saturdayOffsetWeeks(now, 5),
      venueId: venues[0].id,
      refereeId: referees[0].id,
      homeSource: "MATCH_WINNER",
      homeSourceMatchId: championshipSemis[0].id,
      awaySource: "MATCH_WINNER",
      awaySourceMatchId: championshipSemis[1].id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "seed",
      entity: "Database",
      entityId: "-",
      summary: "База заполнена демонстрационными данными",
    },
  });

  const counts = {
    команд: await prisma.team.count(),
    игроков: await prisma.player.count(),
    матчей: await prisma.match.count(),
    событий: await prisma.matchEvent.count(),
    пользователей: await prisma.user.count(),
  };
  console.log("\nГотово:", counts);
  console.log(`\nВход для всех тестовых аккаунтов — пароль: ${password}`);
  console.log("  admin@msu.football          — организатор");
  console.log("  referee1@msu.football       — судья");
  console.log("  captain.mehmat@msu.football — капитан «Мехмата»");
}

// ───────────────────────── Симуляция одного матча ───────────────────────────

type RosterPlayer = { id: number; position: PlayerPosition; shirtNumber: number | null };
type EntryMap = Map<string, { id: number; players: RosterPlayer[] }>;

async function playMatch(
  matchId: number,
  homeEntryId: number,
  awayEntryId: number,
  entries: EntryMap,
  options: { isLive: boolean; halfDuration: number; authorId: string },
) {
  const rosters = new Map<number, RosterPlayer[]>();
  for (const value of entries.values()) rosters.set(value.id, value.players);

  const home = rosters.get(homeEntryId)!;
  const away = rosters.get(awayEntryId)!;
  const fullTime = options.halfDuration * 2;
  const maxMinute = options.isLive ? options.halfDuration + 7 : fullTime;

  // Составы: 11 в старте (1 ВР, 4 ЗЩ, 4 ПЗ, 2 НП), остальные в запасе
  for (const roster of [home, away]) {
    const byPosition = (p: PlayerPosition) => roster.filter((r) => r.position === p);
    const starters = [
      ...byPosition("GK").slice(0, 1),
      ...byPosition("DF").slice(0, 4),
      ...byPosition("MF").slice(0, 4),
      ...byPosition("FW").slice(0, 2),
    ];
    const starterIds = new Set(starters.map((s) => s.id));
    for (const player of roster) {
      await prisma.matchLineup.create({
        data: {
          matchId,
          rosterEntryId: player.id,
          isStarting: starterIds.has(player.id),
          // Снимок номера и позиции на момент подачи состава
          shirtNumber: player.shirtNumber,
          position: player.position,
        },
      });
    }
  }

  const events: { type: MatchEventType; tournamentTeamId: number }[] = [];

  // Голы. Хозяева забивают чуть чаще — обычное преимущество своего поля.
  const homeGoals = randomInt(0, 4);
  const awayGoals = Math.max(0, randomInt(0, 4) - (chance(0.35) ? 1 : 0));

  const scorerWeights: Record<PlayerPosition, number> = { GK: 0, DF: 1, MF: 3, FW: 5 };

  async function addGoals(entryId: number, roster: typeof home, count: number) {
    for (let i = 0; i < count; i++) {
      const isOwnGoal = chance(0.04);
      const isPenalty = !isOwnGoal && chance(0.1);
      const minute = randomInt(1, maxMinute);

      // Выбор автора с учётом позиции
      const pool = roster.flatMap((p) => Array(scorerWeights[p.position]).fill(p));
      const scorer = pool.length ? pick(pool) : roster[0];
      const assistant =
        !isOwnGoal && !isPenalty && chance(0.55)
          ? roster.filter((p) => p.id !== scorer.id)[randomInt(0, roster.length - 2)]
          : null;

      const type: MatchEventType = isOwnGoal
        ? "OWN_GOAL"
        : isPenalty
          ? "PENALTY_GOAL"
          : "GOAL";

      // Автогол записывается на команду автора, а очки — сопернику
      const teamOfEvent = isOwnGoal
        ? entryId === homeEntryId
          ? awayEntryId
          : homeEntryId
        : entryId;
      const rosterOfEvent = isOwnGoal ? (entryId === homeEntryId ? away : home) : roster;
      const actualScorer = isOwnGoal ? pick(rosterOfEvent.filter((p) => p.position !== "GK")) : scorer;

      await prisma.matchEvent.create({
        data: {
          matchId,
          type,
          minute,
          tournamentTeamId: teamOfEvent,
          playerId: actualScorer.id,
          assistPlayerId: assistant?.id ?? null,
          createdById: options.authorId,
        },
      });
      events.push({ type, tournamentTeamId: teamOfEvent });
    }
  }

  await addGoals(homeEntryId, home, homeGoals);
  await addGoals(awayEntryId, away, awayGoals);

  // Карточки
  for (const [entryId, roster] of [
    [homeEntryId, home],
    [awayEntryId, away],
  ] as const) {
    const yellowCount = randomInt(0, 3);
    for (let i = 0; i < yellowCount; i++) {
      await prisma.matchEvent.create({
        data: {
          matchId,
          type: "YELLOW_CARD",
          minute: randomInt(5, maxMinute),
          tournamentTeamId: entryId,
          playerId: pick(roster).id,
          createdById: options.authorId,
        },
      });
    }
    if (chance(0.08)) {
      await prisma.matchEvent.create({
        data: {
          matchId,
          type: "RED_CARD",
          minute: randomInt(30, maxMinute),
          tournamentTeamId: entryId,
          playerId: pick(roster).id,
          createdById: options.authorId,
        },
      });
    }
  }

  // Замены — только в завершённых матчах, чтобы живой матч выглядел «в процессе»
  if (!options.isLive) {
    for (const [entryId, roster] of [
      [homeEntryId, home],
      [awayEntryId, away],
    ] as const) {
      const subs = randomInt(1, 3);
      const bench = roster.slice(11);
      for (let i = 0; i < Math.min(subs, bench.length); i++) {
        await prisma.matchEvent.create({
          data: {
            matchId,
            type: "SUBSTITUTION",
            minute: randomInt(Math.floor(fullTime / 2), fullTime),
            tournamentTeamId: entryId,
            playerId: bench[i].id,
            relatedPlayerId: roster[randomInt(1, 10)].id,
            createdById: options.authorId,
          },
        });
      }
    }
  }

  const score = scoreFromEvents(events, homeEntryId, awayEntryId);
  await prisma.match.update({
    where: { id: matchId },
    data: { homeScore: score.home, awayScore: score.away },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
