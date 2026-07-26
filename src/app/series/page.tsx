import Link from "next/link";

import { Card, EmptyState, PageTitle } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Турниры по годам" };

export default async function SeriesListPage() {
  const series = await prisma.tournamentSeries.findMany({
    where: { tournaments: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      _count: { select: { tournaments: true } },
      tournaments: { orderBy: { startDate: "desc" }, take: 1, select: { season: true } },
    },
  });

  return (
    <div className="space-y-4">
      <PageTitle title="Турниры по годам" subtitle="История каждого турнира за все сезоны" />

      {series.length === 0 ? (
        <Card>
          <EmptyState title="Серий пока нет" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {series.map((item) => (
            <Link key={item.id} href={`/series/${item.slug}`}>
              <Card className="h-full p-4 transition-colors hover:bg-surface-2">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {pluralize(item._count.tournaments, "сезон", "сезона", "сезонов")}
                  {item.tournaments[0] ? ` · последний ${item.tournaments[0].season}` : ""}
                </p>
                {item.description ? (
                  <p className="mt-1 text-xs text-subtle">{item.description}</p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
