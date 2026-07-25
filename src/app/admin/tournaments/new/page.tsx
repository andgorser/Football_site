import { ActionForm } from "@/components/admin/ActionForm";
import { TournamentFields } from "@/components/admin/TournamentFields";
import { Card, PageTitle } from "@/components/ui";
import { saveTournament } from "@/server/admin-actions";

export const metadata = { title: "Новый турнир" };

export default function NewTournamentPage() {
  return (
    <div className="max-w-2xl">
      <PageTitle title="Новый турнир" subtitle="Дивизионы и команды добавим на следующем шаге" />
      <Card className="p-4">
        <ActionForm action={saveTournament.bind(null, null)} submitLabel="Создать турнир">
          <TournamentFields />
        </ActionForm>
      </Card>
    </div>
  );
}
