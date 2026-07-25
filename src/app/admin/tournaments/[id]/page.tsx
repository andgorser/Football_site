import Link from "next/link";
import { notFound } from "next/navigation";

import { EntryRow } from "@/app/admin/tournaments/[id]/EntryRow";
import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { TournamentFields } from "@/components/admin/TournamentFields";
import { Card, CardHeader, Field, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { toDateTimeInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  addTeamToTournament,
  createDivision,
  deleteDivision,
  generateSchedule,
  saveTournament,
} from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Турнир — управление" };

export default async function AdminTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournamentId = Number(id);
  if (!Number.isInteger(tournamentId)) notFound();

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      slug: true,
      name: true,
      season: true,
      format: true,
      status: true,
      startDate: true,
      endDate: true,
      halfDurationMin: true,
      pointsForWin: true,
      pointsForDraw: true,
      description: true,
      divisions: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, _count: { select: { entries: true, matches: true } } },
      },
      entries: {
        orderBy: [{ division: { sortOrder: "asc" } }, { team: { name: "asc" } }],
        select: {
          id: true,
          divisionId: true,
          pointsAdjustment: true,
          _count: { select: { roster: true, homeMatches: true, awayMatches: true } },
          team: { select: { name: true, shortName: true, logoUrl: true, primaryColor: true } },
        },
      },
      _count: { select: { matches: true } },
    },
  });

  if (!tournament) notFound();

  const availableTeams = await prisma.team.findMany({
    where: { entries: { none: { tournamentId } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4">
      <PageTitle
        title={tournament.name}
        subtitle={`Сезон ${tournament.season}`}
        action={
          <div className="flex gap-2">
            <Link
              href={`/admin/tournaments/${tournament.id}/playoff`}
              className={buttonClass("primary")}
            >
              Сетка плей-офф
            </Link>
            <Link href={`/tournaments/${tournament.slug}`} className={buttonClass("secondary")}>
              Открыть на сайте
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader title="Настройки турнира" />
        <div className="p-4">
          <ActionForm action={saveTournament.bind(null, tournament.id)}>
            <TournamentFields defaults={tournament} />
          </ActionForm>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Дивизионы" subtitle="Для одиночной лиги можно не создавать" />
          {tournament.divisions.length > 0 ? (
            <ul className="divide-y divide-border">
              {tournament.divisions.map((division) => (
                <li key={division.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {division.name}
                    <span className="ml-2 text-xs text-subtle">
                      {division._count.entries} команд · {division._count.matches} матчей
                    </span>
                  </span>
                  <ActionButton
                    action={deleteDivision.bind(null, division.id)}
                    label="Удалить"
                    variant="ghost"
                    className="py-1 text-xs"
                    confirmText={`Удалить дивизион «${division.name}»? Матчи останутся, но потеряют привязку.`}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="border-t border-border p-4">
            <ActionForm
              action={createDivision.bind(null, tournament.id)}
              submitLabel="Добавить дивизион"
              variant="secondary"
              resetOnSuccess
            >
              <Field label="Название дивизиона">
                <input name="name" required placeholder="Высший дивизион" className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Генератор расписания"
            subtitle="Круговой турнир в один круг: каждый с каждым"
          />
          <div className="p-4">
            <ActionForm
              action={generateSchedule.bind(null, tournament.id)}
              submitLabel="Создать расписание"
              variant="secondary"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Дивизион" hint="Пусто — все команды турнира">
                  <select name="divisionId" className={inputClass}>
                    <option value="">Весь турнир</option>
                    {tournament.divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Первый матч">
                  <input
                    type="datetime-local"
                    name="firstRound"
                    required
                    defaultValue={toDateTimeInput(tournament.startDate)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Дней между турами">
                  <input type="number" name="intervalDays" min={1} max={30} defaultValue={7} className={inputClass} />
                </Field>
                <Field label="Минут между матчами тура">
                  <input
                    type="number"
                    name="matchGapMinutes"
                    min={30}
                    max={600}
                    step={30}
                    defaultValue={120}
                    className={inputClass}
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-subtle">
                Сейчас в турнире {tournament._count.matches} матчей. Генератор откажется работать,
                если матчи уже созданы — сначала удалите их вручную.
              </p>
            </ActionForm>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Заявленные команды"
          subtitle={`${tournament.entries.length} команд`}
        />
        {tournament.entries.length > 0 ? (
          <ul className="divide-y divide-border">
            {tournament.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={{
                  id: entry.id,
                  divisionId: entry.divisionId,
                  pointsAdjustment: entry.pointsAdjustment,
                  rosterCount: entry._count.roster,
                  matchCount: entry._count.homeMatches + entry._count.awayMatches,
                  team: entry.team,
                }}
                divisions={tournament.divisions}
                tournamentId={tournament.id}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted">Команды ещё не заявлены</p>
        )}

        <div className="border-t border-border p-4">
          {availableTeams.length === 0 ? (
            <p className="text-sm text-muted">
              Все существующие команды уже заявлены.{" "}
              <Link href="/admin/teams" className="text-brand hover:underline">
                Создать новую команду
              </Link>
            </p>
          ) : (
            <ActionForm
              action={addTeamToTournament.bind(null, tournament.id)}
              submitLabel="Заявить команду"
              variant="secondary"
              resetOnSuccess
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Команда">
                  <select name="teamId" required className={inputClass}>
                    <option value="">Выберите команду</option>
                    {availableTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Дивизион">
                  <select name="divisionId" className={inputClass}>
                    <option value="">Без дивизиона</option>
                    {tournament.divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </ActionForm>
          )}
        </div>
      </Card>
    </div>
  );
}
