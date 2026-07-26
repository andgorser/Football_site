import { ActionForm } from "@/components/admin/ActionForm";
import { TournamentFields } from "@/components/admin/TournamentFields";
import { Card, PageTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { saveTournament } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Новый турнир" };

export default async function NewTournamentPage() {
  const seriesOptions = await prisma.tournamentSeries.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-2xl">
      <PageTitle title="Новый турнир" subtitle="Дивизионы и команды добавим на следующем шаге" />
      <Card className="p-4">
        <ActionForm action={saveTournament.bind(null, null)} submitLabel="Создать турнир">
          <TournamentFields seriesOptions={seriesOptions} />
        </ActionForm>
      </Card>
    </div>
  );
}
