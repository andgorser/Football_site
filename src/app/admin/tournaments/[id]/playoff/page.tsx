import Link from "next/link";
import { notFound } from "next/navigation";

import { PlayoffMatchForm } from "@/app/admin/tournaments/[id]/playoff/PlayoffMatchForm";
import { ResolveButton } from "@/app/admin/tournaments/[id]/playoff/ResolveButton";
import { ActionButton } from "@/components/admin/ActionForm";
import { TeamCrest } from "@/components/TeamCrest";
import { Badge, Card, CardHeader, EmptyState, PageTitle, buttonClass } from "@/components/ui";
import { MATCH_STAGE_LABEL, MATCH_STATUS_LABEL, PLAYOFF_STAGES } from "@/lib/football";
import { formatDateTimeOrTbd, toDateTimeInput } from "@/lib/format";
import { awaySlotOf, homeSlotOf, slotLabel } from "@/lib/playoff";
import { prisma } from "@/lib/prisma";
import { deletePlayoffMatch, movePlayoffMatch } from "@/server/playoff-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Сетка плей-офф" };

export default async function PlayoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const tournamentId = Number(id);
  if (!Number.isInteger(tournamentId)) notFound();

  const [tournament, venues, referees] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        slug: true,
        name: true,
        season: true,
        startDate: true,
        divisions: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, _count: { select: { entries: true } } },
        },
        entries: {
          orderBy: { team: { name: "asc" } },
          select: { id: true, team: { select: { name: true } } },
        },
      },
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: { in: ["REFEREE", "ADMIN"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!tournament) notFound();

  const matches = await prisma.match.findMany({
    where: { tournamentId, stage: { not: "REGULAR" } },
    orderBy: [{ stage: "asc" }, { bracketOrder: "asc" }, { kickoffAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      stage: true,
      bracketOrder: true,
      kickoffAt: true,
      kickoffTbd: true,
      status: true,
      venueId: true,
      refereeId: true,
      homeScore: true,
      awayScore: true,
      homeTeamId: true,
      homeSource: true,
      homeSourceDivisionId: true,
      homeSourcePlace: true,
      homeSourceMatchId: true,
      homeSourceLabel: true,
      homeSourceDivision: { select: { name: true } },
      homeTeam: { select: { team: { select: { shortName: true, logoUrl: true, primaryColor: true } } } },
      awayTeamId: true,
      awaySource: true,
      awaySourceDivisionId: true,
      awaySourcePlace: true,
      awaySourceMatchId: true,
      awaySourceLabel: true,
      awaySourceDivision: { select: { name: true } },
      awayTeam: { select: { team: { select: { shortName: true, logoUrl: true, primaryColor: true } } } },
      venue: { select: { name: true } },
      referee: { select: { fullName: true } },
    },
  });

  // Все матчи турнира годятся в источники — в том числе матчи регулярного этапа
  const sourceCandidates = await prisma.match.findMany({
    where: { tournamentId },
    orderBy: [{ stage: "asc" }, { bracketOrder: "asc" }, { kickoffAt: "asc" }],
    select: {
      id: true,
      stage: true,
      round: true,
      homeTeam: { select: { team: { select: { shortName: true } } } },
      awayTeam: { select: { team: { select: { shortName: true } } } },
    },
  });

  const options = {
    entries: tournament.entries.map((entry) => ({ id: entry.id, name: entry.team.name })),
    divisions: tournament.divisions.map((division) => ({
      id: division.id,
      name: division.name,
      teamCount: division._count.entries,
    })),
    matches: sourceCandidates.map((match) => ({
      id: match.id,
      label: `№${match.id} · ${
        match.round ? `${match.round}-й тур` : MATCH_STAGE_LABEL[match.stage]
      } · ${match.homeTeam?.team.shortName ?? "?"} — ${match.awayTeam?.team.shortName ?? "?"}`,
    })),
  };

  const editing = edit ? matches.find((m) => m.id === Number(edit)) : undefined;
  const nextOrder = matches.length;
  const defaultKickoff = toDateTimeInput(tournament.startDate);

  // Группируем по стадиям в естественном порядке сетки
  const byStage = PLAYOFF_STAGES.map((stage) => ({
    stage,
    matches: matches.filter((match) => match.stage === stage),
  })).filter((group) => group.matches.length > 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Сетка плей-офф"
        subtitle={`${tournament.name} ${tournament.season}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/tournaments/${tournament.id}`} className={buttonClass("secondary")}>
              К турниру
            </Link>
            <Link
              href={`/tournaments/${tournament.slug}?tab=bracket`}
              className={buttonClass("outline")}
            >
              Сетка на сайте
            </Link>
          </div>
        }
      />

      <Card className="p-4 text-sm text-muted">
        <p className="mb-2 font-semibold text-fg">Как это работает</p>
        <p>
          Матч плей-офф создаётся заранее — с датой, полем и судьёй. Вместо команды укажите,
          откуда она возьмётся: «1-е место дивизиона А» или «победитель матча №12». Как только
          источник определится, команда подставится сама, а болельщики будут видеть сетку
          с самого начала.
        </p>
        <p className="mt-2">
          Номер матча (№12) написан слева от каждой строки — именно на него и ссылайтесь.
        </p>
      </Card>

      <ResolveButton tournamentId={tournament.id} />

      {byStage.length === 0 ? (
        <Card>
          <EmptyState
            title="Сетка пуста"
            hint="Добавьте первый матч плей-офф формой внизу страницы."
          />
        </Card>
      ) : (
        byStage.map((group) => (
          <Card key={group.stage}>
            <CardHeader title={MATCH_STAGE_LABEL[group.stage]} />
            <ul className="divide-y divide-border">
              {group.matches.map((match) => (
                <li key={match.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Badge>№{match.id}</Badge>

                  <div className="min-w-[16rem] flex-1 space-y-1">
                    <SlotLine
                      team={match.homeTeam?.team ?? null}
                      label={slotLabel(homeSlotOf(match))}
                      score={match.homeScore}
                    />
                    <SlotLine
                      team={match.awayTeam?.team ?? null}
                      label={slotLabel(awaySlotOf(match))}
                      score={match.awayScore}
                    />
                    <p className="text-xs text-subtle">
                      {formatDateTimeOrTbd(match.kickoffAt, match.kickoffTbd)}
                      {match.venue ? ` · ${match.venue.name}` : ""}
                      {match.referee ? ` · ${match.referee.fullName}` : " · судья не назначен"}
                    </p>
                  </div>

                  <Badge tone={match.status === "FINISHED" ? "neutral" : "brand"}>
                    {MATCH_STATUS_LABEL[match.status]}
                  </Badge>

                  <div className="flex flex-wrap gap-1">
                    <ActionButton
                      action={movePlayoffMatch.bind(null, match.id, -1)}
                      label="↑"
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                    />
                    <ActionButton
                      action={movePlayoffMatch.bind(null, match.id, 1)}
                      label="↓"
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                    />
                    <Link
                      href={`/admin/tournaments/${tournament.id}/playoff?edit=${match.id}`}
                      className={buttonClass("secondary", "py-1 text-xs")}
                    >
                      Изменить
                    </Link>
                    <Link href={`/referee/${match.id}`} className={buttonClass("outline", "py-1 text-xs")}>
                      Протокол
                    </Link>
                    <ActionButton
                      action={deletePlayoffMatch.bind(null, match.id)}
                      label="Удалить"
                      variant="ghost"
                      className="py-1 text-xs"
                      confirmText={`Удалить матч №${match.id} из сетки?`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <Card>
        <CardHeader
          title={editing ? `Изменить матч №${editing.id}` : "Добавить матч плей-офф"}
          action={
            editing ? (
              <Link
                href={`/admin/tournaments/${tournament.id}/playoff`}
                className="text-brand hover:underline"
              >
                Отмена
              </Link>
            ) : null
          }
        />
        <div className="p-4">
          {tournament.entries.length === 0 ? (
            <EmptyState
              title="В турнире нет команд"
              hint="Сначала заявите команды на странице турнира."
            />
          ) : (
            <PlayoffMatchForm
              key={editing?.id ?? "new"}
              tournamentId={tournament.id}
              options={options}
              venues={venues}
              referees={referees}
              defaultKickoff={defaultKickoff}
              defaultOrder={nextOrder}
              defaults={
                editing
                  ? {
                      id: editing.id,
                      stage: editing.stage,
                      bracketOrder: editing.bracketOrder,
                      kickoffAt: toDateTimeInput(editing.kickoffAt),
                      venueId: editing.venueId,
                      refereeId: editing.refereeId,
                      home: {
                        source: editing.homeSource,
                        teamId: editing.homeTeamId,
                        divisionId: editing.homeSourceDivisionId,
                        place: editing.homeSourcePlace,
                        matchId: editing.homeSourceMatchId,
                        label: editing.homeSourceLabel,
                      },
                      away: {
                        source: editing.awaySource,
                        teamId: editing.awayTeamId,
                        divisionId: editing.awaySourceDivisionId,
                        place: editing.awaySourcePlace,
                        matchId: editing.awaySourceMatchId,
                        label: editing.awaySourceLabel,
                      },
                    }
                  : undefined
              }
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function SlotLine({
  team,
  label,
  score,
}: {
  team: { shortName: string; logoUrl: string | null; primaryColor: string | null } | null;
  label: string;
  score: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {team ? (
        <>
          <TeamCrest team={team} size="sm" />
          <span className="font-medium">{team.shortName}</span>
        </>
      ) : (
        <>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-subtle">
            ?
          </span>
          <span className="italic text-muted">{label}</span>
        </>
      )}
      {score !== null ? <span className="ml-auto font-bold tabular-nums">{score}</span> : null}
    </div>
  );
}
