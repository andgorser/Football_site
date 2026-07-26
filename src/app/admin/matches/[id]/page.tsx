import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/ActionForm";
import { MatchFields } from "@/components/admin/MatchFields";
import { Card, CardHeader, PageTitle, buttonClass } from "@/components/ui";
import { MATCH_STATUS_LABEL } from "@/lib/football";
import { formatDateTimeOrTbd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { saveMatch } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Матч — управление" };

export default async function AdminMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      tournamentId: true,
      divisionId: true,
      homeTeamId: true,
      awayTeamId: true,
      kickoffAt: true,
      kickoffTbd: true,
      venueId: true,
      refereeId: true,
      round: true,
      stage: true,
      notes: true,
      homeSource: true,
      awaySource: true,
      status: true,
      homeScore: true,
      awayScore: true,
      tournament: {
        select: {
          name: true,
          season: true,
          divisions: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
          entries: {
            orderBy: { team: { name: "asc" } },
            select: { id: true, team: { select: { name: true } } },
          },
        },
      },
      _count: { select: { events: true } },
    },
  });

  if (!match) notFound();

  const [venues, referees] = await Promise.all([
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: { in: ["REFEREE", "ADMIN"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle
        title="Настройки матча"
        subtitle={`${match.tournament.name} ${match.tournament.season}`}
        action={
          <div className="flex gap-2">
            <Link href={`/referee/${match.id}`} className={buttonClass("primary")}>
              Протокол
            </Link>
            <Link href={`/matches/${match.id}`} className={buttonClass("secondary")}>
              На сайте
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Текущее состояние"
          subtitle={`${MATCH_STATUS_LABEL[match.status]} · ${formatDateTimeOrTbd(match.kickoffAt, match.kickoffTbd)}`}
        />
        <div className="px-4 py-3 text-sm text-muted">
          Счёт:{" "}
          <span className="font-bold text-fg">
            {match.homeScore !== null && match.awayScore !== null
              ? `${match.homeScore}:${match.awayScore}`
              : "не сыгран"}
          </span>{" "}
          · событий в протоколе: {match._count.events}
          <p className="mt-1 text-xs text-subtle">
            Счёт считается по событиям протокола и здесь не редактируется — правьте протокол.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <ActionForm action={saveMatch.bind(null, match.id)}>
          <MatchFields
            slotMode={match.homeSource !== "TEAM" || match.awaySource !== "TEAM"}
            data={{
              tournamentId: match.tournamentId,
              divisions: match.tournament.divisions,
              entries: match.tournament.entries,
              venues,
              referees,
              defaults: {
                divisionId: match.divisionId,
                homeTeamId: match.homeTeamId,
                awayTeamId: match.awayTeamId,
                kickoffAt: match.kickoffAt,
                kickoffTbd: match.kickoffTbd,
                venueId: match.venueId,
                refereeId: match.refereeId,
                round: match.round,
                stage: match.stage,
                notes: match.notes,
              },
            }}
          />
        </ActionForm>
      </Card>
    </div>
  );
}
