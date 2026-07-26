import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { ScheduleImport } from "@/components/admin/ScheduleImport";
import { Card, CardHeader, Field, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { isPlayed } from "@/lib/football";
import { formatDayMonth, formatTime, moscowDayKey, pluralize, toDateInput } from "@/lib/format";
import { buildScheduleTable } from "@/lib/schedule-table";
import { prisma } from "@/lib/prisma";
import {
  clearRegularSchedule,
  generateSchedule,
  setRoundSchedule,
  shiftRound,
} from "@/server/schedule-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Расписание — управление" };

type RoundMatch = {
  id: number;
  round: number | null;
  kickoffAt: Date;
  kickoffTbd: boolean;
  status: string;
  venueName: string | null;
  played: boolean;
};

export default async function AdminSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournamentId = Number(id);
  if (!Number.isInteger(tournamentId)) notFound();

  const [tournament, venues] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        season: true,
        startDate: true,
        divisions: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
      },
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!tournament) notFound();

  const [matches, entries] = await Promise.all([
    prisma.match.findMany({
      where: { tournamentId, stage: "REGULAR" },
      orderBy: [{ round: "asc" }, { kickoffAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        round: true,
        divisionId: true,
        kickoffAt: true,
        kickoffTbd: true,
        status: true,
        notes: true,
        venue: { select: { name: true } },
        referee: { select: { fullName: true } },
        division: { select: { name: true } },
        homeTeam: { select: { team: { select: { name: true } } } },
        awayTeam: { select: { team: { select: { name: true } } } },
      },
    }),
    prisma.tournamentTeam.findMany({
      where: { tournamentId },
      orderBy: { team: { name: "asc" } },
      select: { id: true, team: { select: { name: true, shortName: true, slug: true } } },
    }),
  ]);

  const teamOptions = entries.map((entry) => ({
    id: entry.id,
    name: entry.team.name,
    shortName: entry.team.shortName,
    slug: entry.team.slug,
  }));

  // Выгрузка тем же форматом, который понимает импорт: организатор правит её
  // в экселе и вставляет обратно.
  const exportTable = buildScheduleTable(
    matches
      .filter((m) => m.homeTeam && m.awayTeam)
      .map((m) => ({
        round: m.round,
        date: moscowDayKey(m.kickoffAt),
        time: m.kickoffTbd ? null : formatTime(m.kickoffAt),
        home: m.homeTeam!.team.name,
        away: m.awayTeam!.team.name,
        venue: m.venue?.name ?? null,
        referee: m.referee?.fullName ?? null,
        division: m.division?.name ?? null,
        notes: m.notes,
      })),
  );

  // Группируем так же, как показывается расписание на сайте: дивизион, потом тур.
  const buckets = new Map<number | null, Map<number, RoundMatch[]>>();
  for (const match of matches) {
    const round = match.round ?? 0;
    if (!buckets.has(match.divisionId)) buckets.set(match.divisionId, new Map());
    const rounds = buckets.get(match.divisionId)!;
    if (!rounds.has(round)) rounds.set(round, []);
    rounds.get(round)!.push({
      id: match.id,
      round: match.round,
      kickoffAt: match.kickoffAt,
      kickoffTbd: match.kickoffTbd,
      status: match.status,
      venueName: match.venue?.name ?? null,
      played: isPlayed(match.status),
    });
  }

  const divisionName = (divisionId: number | null) =>
    divisionId === null
      ? "Без дивизиона"
      : (tournament.divisions.find((d) => d.id === divisionId)?.name ?? "Дивизион удалён");

  const orderedBuckets = [...buckets.entries()].sort((a, b) => {
    const order = (divisionId: number | null) =>
      divisionId === null
        ? Number.MAX_SAFE_INTEGER
        : tournament.divisions.findIndex((d) => d.id === divisionId);
    return order(a[0]) - order(b[0]);
  });

  return (
    <div className="space-y-4">
      <PageTitle
        title="Расписание"
        subtitle={`${tournament.name} · сезон ${tournament.season}`}
        action={
          <Link href={`/admin/tournaments/${tournament.id}`} className={buttonClass("secondary")}>
            К турниру
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Создать сетку туров"
          subtitle="Круговой турнир в один круг: каждый с каждым"
        />
        <div className="p-4">
          <ActionForm
            action={generateSchedule.bind(null, tournament.id)}
            submitLabel="Создать сетку"
            variant="secondary"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Дивизион" hint="Пусто — каждый дивизион отдельно">
                <select name="divisionId" className={inputClass}>
                  <option value="">Все дивизионы</option>
                  {tournament.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Дата первого тура">
                <input
                  type="date"
                  name="firstDay"
                  required
                  defaultValue={toDateInput(tournament.startDate)}
                  className={inputClass}
                />
              </Field>
              <Field label="Шаг между турами, дней" hint="Черновая раскладка по календарю">
                <input
                  type="number"
                  name="stepDays"
                  min={0}
                  max={30}
                  defaultValue={7}
                  className={inputClass}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-subtle">
              Время матчей не назначается: все матчи тура встают на его дату с пометкой
              «время уточняется». Точные время и поле проставьте ниже по турам или импортом
              из таблицы.
            </p>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Импорт из таблицы"
          subtitle="Скопируйте диапазон из Excel или Google-таблицы и вставьте сюда"
        />
        <div className="p-4">
          <ScheduleImport
            tournamentId={tournament.id}
            entries={teamOptions}
            defaultYear={Number(moscowDayKey(tournament.startDate).slice(0, 4))}
            sample={exportTable}
          />
        </div>
      </Card>

      {orderedBuckets.length === 0 ? (
        <Card>
          <p className="px-4 py-6 text-center text-sm text-muted">
            Матчей регулярного этапа пока нет — создайте сетку туров выше.
          </p>
        </Card>
      ) : null}

      {orderedBuckets.map(([divisionId, rounds]) => {
        const total = [...rounds.values()].reduce((sum, list) => sum + list.length, 0);
        return (
          <Card key={divisionId ?? "none"}>
            <CardHeader
              title={divisionName(divisionId)}
              subtitle={`${pluralize(total, "матч", "матча", "матчей")} · ${pluralize(rounds.size, "тур", "тура", "туров")}`}
              action={
                <ActionButton
                  action={clearRegularSchedule.bind(null, tournament.id, divisionId)}
                  label="Очистить"
                  variant="ghost"
                  className="py-1 text-xs"
                  confirmText={`Удалить несыгранное расписание «${divisionName(divisionId)}»? Матчи с результатом, событиями или нужные сетке плей-офф останутся.`}
                />
              }
            />
            <ul className="divide-y divide-border">
              {[...rounds.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([round, list]) => (
                  <RoundBlock
                    key={round}
                    tournamentId={tournament.id}
                    divisionId={divisionId}
                    round={round}
                    matches={list}
                    venues={venues}
                  />
                ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function RoundBlock({
  tournamentId,
  divisionId,
  round,
  matches,
  venues,
}: {
  tournamentId: number;
  divisionId: number | null;
  round: number;
  matches: RoundMatch[];
  venues: { id: number; name: string }[];
}) {
  const tbdCount = matches.filter((m) => m.kickoffTbd).length;
  const playedCount = matches.filter((m) => m.played).length;
  const days = [...new Set(matches.map((m) => formatDayMonth(m.kickoffAt)))];

  return (
    <li className="px-4 py-3">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{round > 0 ? `${round}-й тур` : "Без тура"}</span>
          <span className="text-xs text-subtle">
            {pluralize(matches.length, "матч", "матча", "матчей")} · {days.join(", ")}
            {tbdCount > 0 ? ` · ${tbdCount} без времени` : ""}
            {playedCount > 0 ? ` · ${playedCount} сыграно` : ""}
          </span>
        </summary>

        <div className="mt-3 space-y-3">
          <ActionForm
            action={setRoundSchedule.bind(null, tournamentId)}
            submitLabel="Применить к туру"
            variant="secondary"
          >
            <input type="hidden" name="divisionId" value={divisionId ?? ""} />
            <input type="hidden" name="round" value={round} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Дата">
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={toDateInput(matches[0].kickoffAt)}
                  className={inputClass}
                />
              </Field>
              <Field label="Время" hint="Пусто — оставить «уточняется»">
                <input type="time" name="time" className={inputClass} />
              </Field>
              <Field label="Поле">
                <select name="venueId" defaultValue="" className={inputClass}>
                  <option value="">Не менять</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                  <option value="none">Убрать поле</option>
                </select>
              </Field>
            </div>
          </ActionForm>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-subtle">Сдвинуть тур:</span>
            {[-7, -1, 1, 7].map((delta) => (
              <ActionButton
                key={delta}
                action={shiftRound.bind(null, tournamentId, divisionId, round, delta)}
                label={`${delta > 0 ? "+" : ""}${delta} дн.`}
                variant="outline"
                className="py-1 text-xs"
              />
            ))}
          </div>

          <ul className="text-xs text-muted">
            {matches.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center gap-2 py-0.5">
                <Link href={`/admin/matches/${match.id}`} className="text-brand hover:underline">
                  Матч №{match.id}
                </Link>
                <span>{match.kickoffTbd ? "время уточняется" : "время назначено"}</span>
                {match.venueName ? <span>· {match.venueName}</span> : null}
                {match.played ? <span className="text-subtle">· сыгран</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}
