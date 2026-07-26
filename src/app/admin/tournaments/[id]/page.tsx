import Link from "next/link";
import { notFound } from "next/navigation";

import { DivisionRow } from "@/app/admin/tournaments/[id]/DivisionRow";
import { EntryRow } from "@/app/admin/tournaments/[id]/EntryRow";
import { ActionForm } from "@/components/admin/ActionForm";
import { TournamentFields } from "@/components/admin/TournamentFields";
import { Card, CardHeader, Field, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getTournamentStandings } from "@/lib/stats";
import {
  addTeamToTournament,
  copyEntriesFromTournament,
  createDivision,
  saveTournament,
  splitDivision,
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
      seriesId: true,
      divisions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          halfDurationMin: true,
          parentDivisionId: true,
          _count: { select: { entries: true, matches: true, childDivisions: true } },
        },
      },
      entries: {
        orderBy: [{ division: { sortOrder: "asc" } }, { team: { name: "asc" } }],
        select: {
          id: true,
          divisionId: true,
          _count: { select: { roster: true, homeMatches: true, awayMatches: true } },
          team: { select: { name: true, shortName: true, logoUrl: true, primaryColor: true } },
        },
      },
      _count: { select: { matches: true } },
    },
  });

  if (!tournament) notFound();

  // Порядок команд нужен, чтобы организатор глазами видел, где пройдёт граница
  const standings = await getTournamentStandings(tournament.id);
  const rowsByDivision = new Map(standings.map((d) => [d.divisionId, d.rows]));
  const divisionName = new Map(tournament.divisions.map((d) => [d.id, d.name]));
  // В завершённый этап команду возвращать незачем — его таблица уже архив
  const activeDivisions = tournament.divisions.filter((d) => d._count.childDivisions === 0);

  const seriesOptions = await prisma.tournamentSeries.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Источник для переноса заявок. По умолчанию — самый свежий турнир той же
  // серии: это и есть «прошлый год» одним кликом.
  const otherTournaments = await prisma.tournament.findMany({
    where: { id: { not: tournamentId } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, season: true, seriesId: true },
  });
  const defaultSourceId = tournament.seriesId
    ? (otherTournaments.find((t) => t.seriesId === tournament.seriesId)?.id ?? null)
    : null;

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
            <TournamentFields defaults={tournament} seriesOptions={seriesOptions} />
          </ActionForm>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Дивизионы" subtitle="Для одиночной лиги можно не создавать" />
          {tournament.divisions.length > 0 ? (
            <ul className="divide-y divide-border">
              {tournament.divisions.map((division) => {
                const rows = rowsByDivision.get(division.id) ?? [];
                const canSplit = division._count.childDivisions === 0 && rows.length >= 4;
                const half = Math.floor(rows.length / 2);

                return (
                  <DivisionRow
                    key={division.id}
                    division={{
                      id: division.id,
                      name: division.name,
                      halfDurationMin: division.halfDurationMin,
                      entryCount: division._count.entries,
                      matchCount: division._count.matches,
                      isArchived: division._count.childDivisions > 0,
                      parentName: division.parentDivisionId
                        ? (divisionName.get(division.parentDivisionId) ?? null)
                        : null,
                    }}
                    tournamentHalfDuration={tournament.halfDurationMin}
                  >
                    {canSplit ? (
                      <details className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
                        <summary className="cursor-pointer text-xs font-semibold">
                          Разделить по итогам
                        </summary>
                        <p className="mt-2 text-xs text-subtle">
                          Текущий порядок: {rows.map((r) => `${r.place}. ${r.teamShortName}`).join(" · ")}
                        </p>
                        <div className="mt-2">
                          <ActionForm
                            action={splitDivision.bind(null, division.id)}
                            submitLabel="Разделить"
                            variant="secondary"
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field
                                label="Команд в верхней половине"
                                hint={`Всего ${rows.length}`}
                              >
                                <input
                                  type="number"
                                  name="topCount"
                                  min={1}
                                  max={rows.length - 1}
                                  defaultValue={half}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Название верхней половины">
                                <input
                                  name="topName"
                                  required
                                  defaultValue={`${division.name}. Верхняя половина`}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Название нижней половины">
                                <input
                                  name="bottomName"
                                  required
                                  defaultValue={`${division.name}. Нижняя половина`}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Как назвать таблицу первого этапа">
                                <input
                                  name="archiveName"
                                  required
                                  defaultValue={`${division.name}. Первый этап`}
                                  className={inputClass}
                                />
                              </Field>
                            </div>
                            <p className="mt-2 text-xs text-subtle">
                              Очки, игры и мячи первого этапа перейдут в обе половины. Таблица
                              первого этапа останется доступной как архив. Разделение можно
                              отменить, пока у половин нет матчей.
                            </p>
                          </ActionForm>
                        </div>
                      </details>
                    ) : null}
                  </DivisionRow>
                );
              })}
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
              <Field
                label="Длительность тайма, мин"
                hint={`Пусто — как в турнире (${tournament.halfDurationMin} мин). Нужно, когда дивизионы играют разными форматами`}
              >
                <input
                  name="halfDurationMin"
                  type="number"
                  min={5}
                  max={60}
                  placeholder={String(tournament.halfDurationMin)}
                  className={inputClass}
                />
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Расписание"
            subtitle={`Сейчас в турнире ${tournament._count.matches} матчей`}
          />
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">
              Генератор создаёт пары и туры, а точные время и поле проставляются потом —
              по турам сразу или импортом из таблицы, в которой их согласовали.
            </p>
            <Link
              href={`/admin/tournaments/${tournament.id}/schedule`}
              className={buttonClass("secondary")}
            >
              Открыть расписание
            </Link>
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
                  rosterCount: entry._count.roster,
                  matchCount: entry._count.homeMatches + entry._count.awayMatches,
                  team: entry.team,
                }}
                divisions={activeDivisions}
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

        {otherTournaments.length > 0 ? (
          <div className="border-t border-border p-4">
            <ActionForm
              action={copyEntriesFromTournament.bind(null, tournament.id)}
              submitLabel="Взять участников"
              variant="outline"
            >
              <p className="mb-2 text-sm font-semibold">Взять участников прошлого сезона</p>
              <Field label="Откуда переносить">
                <select
                  name="sourceTournamentId"
                  required
                  defaultValue={defaultSourceId ?? ""}
                  className={inputClass}
                >
                  <option value="">Выберите турнир</option>
                  {otherTournaments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — сезон {item.season}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="withRoster"
                    value="1"
                    defaultChecked
                    className="size-4 accent-brand"
                  />
                  Переносить составы
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="withDivisions"
                    value="1"
                    defaultChecked
                    className="size-4 accent-brand"
                  />
                  Переносить дивизионы
                </label>
              </div>
              <p className="mt-2 text-xs text-subtle">
                Это черновик: команды и составы копируются как есть, дальше правьте руками.
                Повторный запуск ничего не испортит — он только дописывает недостающее.
              </p>
            </ActionForm>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
