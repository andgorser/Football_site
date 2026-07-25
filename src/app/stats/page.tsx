import { ScorersTable } from "@/components/ScorersTable";
import { Card, CardHeader, PageTitle, TabLinks } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getPlayerStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Статистика" };

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tournament?: string }>;
}) {
  const { tournament: slug } = await searchParams;

  const tournaments = await prisma.tournament.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, slug: true, name: true, season: true },
  });

  const selected = tournaments.find((t) => t.slug === slug);
  const stats = await getPlayerStats({
    tournamentId: selected?.id,
    limit: 100,
  });

  const topScorers = stats.filter((row) => row.goals > 0);
  const topAssists = [...stats]
    .filter((row) => row.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, 20);

  return (
    <div>
      <PageTitle
        title="Статистика"
        subtitle={selected ? `${selected.name} ${selected.season}` : "По всем турнирам"}
      />

      <TabLinks
        items={[
          { href: "/stats", label: "Все турниры", active: !selected },
          ...tournaments.map((t) => ({
            href: `/stats?tournament=${t.slug}`,
            label: `${t.name} ${t.season}`,
            active: selected?.id === t.id,
          })),
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Бомбардиры" subtitle="Больше всего голов" />
          <ScorersTable rows={topScorers.slice(0, 20)} />
        </Card>

        <Card>
          <CardHeader title="Ассистенты" subtitle="Больше всего голевых передач" />
          <ScorersTable rows={topAssists} />
        </Card>
      </div>
    </div>
  );
}
