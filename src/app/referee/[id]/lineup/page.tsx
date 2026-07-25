import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  LineupEditor,
  type LineupTeam,
} from "@/app/referee/[id]/lineup/LineupEditor";
import { Alert, Card, PageTitle, buttonClass } from "@/components/ui";
import { canEditMatch, isAssignedReferee, requireUser } from "@/lib/auth";
import { shortName } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { rosterByPositionOrderBy } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Составы на матч" };

export default async function LineupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const user = await requireUser(`/referee/${id}/lineup`);

  const found = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      refereeId: true,
      referee: { select: { fullName: true } },
      lineups: { select: { rosterEntryId: true, isStarting: true } },
      homeTeam: {
        select: {
          id: true,
          team: { select: { name: true } },
          roster: {
            orderBy: rosterByPositionOrderBy,
            select: {
              id: true,
              shirtNumber: true,
              position: true,
              player: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          team: { select: { name: true } },
          roster: {
            orderBy: rosterByPositionOrderBy,
            select: {
              id: true,
              shirtNumber: true,
              position: true,
              player: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  if (!found) notFound();
  if (!canEditMatch(user)) redirect("/403");

  if (!found.homeTeam || !found.awayTeam) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="p-6 text-center">
          <p className="text-lg font-semibold">Участники матча ещё не определены</p>
          <p className="mt-2 text-sm text-muted">
            Составы можно будет заполнить, когда сетка плей-офф подставит обе команды.
          </p>
          <Link href={`/referee/${found.id}`} className={buttonClass("secondary", "mt-4")}>
            К протоколу
          </Link>
        </Card>
      </div>
    );
  }

  const match = { ...found, homeTeam: found.homeTeam, awayTeam: found.awayTeam };
  const lineupById = new Map(match.lineups.map((l) => [l.rosterEntryId, l.isStarting]));

  const buildTeam = (side: typeof match.homeTeam): LineupTeam => ({
    entryId: side.id,
    name: side.team.name,
    players: side.roster.map((entry) => ({
      id: entry.id,
      shirtNumber: entry.shirtNumber,
      position: entry.position,
      name: shortName(entry.player),
      state: lineupById.has(entry.id)
        ? lineupById.get(entry.id)
          ? ("starting" as const)
          : ("bench" as const)
        : ("out" as const),
    })),
  });

  return (
    <div>
      <PageTitle
        title="Составы на матч"
        subtitle="Отметьте, кто вышел в старте, а кто на скамейке"
        action={
          <Link href={`/referee/${match.id}`} className={buttonClass("secondary")}>
            К протоколу
          </Link>
        }
      />
      {!isAssignedReferee(user, match) ? (
        <div className="mb-4">
          <Alert tone="warning">
            Вы не назначены судьёй этого матча.{" "}
            {match.referee ? `Назначен: ${match.referee.fullName}.` : "Судья не назначен."} Взять
            матч себе можно в протоколе.
          </Alert>
        </div>
      ) : null}

      <LineupEditor matchId={match.id} teams={[buildTeam(match.homeTeam), buildTeam(match.awayTeam)]} />
    </div>
  );
}
