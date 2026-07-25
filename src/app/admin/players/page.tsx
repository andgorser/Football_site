import Link from "next/link";

import { ActionForm } from "@/components/admin/ActionForm";
import { PlayerFields } from "@/components/admin/EntityFields";
import { Card, CardHeader, EmptyState, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { MSU_STATUS_LABEL, POSITION_SHORT, fullName } from "@/lib/football";
import { pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { savePlayer } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Игроки — управление" };

const PAGE_SIZE = 50;

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const query = (q ?? "").trim();
  const pageNumber = Math.max(1, Number(page) || 1);

  const where = query
    ? {
        OR: [
          { lastName: { contains: query, mode: "insensitive" as const } },
          { firstName: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [players, total, faculties] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (pageNumber - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        course: true,
        msuStatus: true,
        preferredPosition: true,
        faculty: { select: { shortName: true } },
        _count: { select: { rosterEntries: true } },
      },
    }),
    prisma.player.count({ where }),
    prisma.faculty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <PageTitle title="Игроки" subtitle={pluralize(total, "игрок", "игрока", "игроков")} />

      <Card>
        <div className="border-b border-border p-3">
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Поиск по фамилии или имени"
              className={inputClass}
            />
            <button type="submit" className={buttonClass("secondary")}>
              Найти
            </button>
            {query ? (
              <Link href="/admin/players" className={buttonClass("ghost")}>
                Сброс
              </Link>
            ) : null}
          </form>
        </div>

        {players.length === 0 ? (
          <EmptyState title="Игроки не найдены" />
        ) : (
          <ul className="divide-y divide-border">
            {players.map((player) => (
              <li key={player.id}>
                <Link
                  href={`/admin/players/${player.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{fullName(player)}</span>
                  <span className="shrink-0 text-xs text-subtle">
                    {player.preferredPosition ? POSITION_SHORT[player.preferredPosition] : "—"} ·{" "}
                    {player.faculty?.shortName ?? "—"} · {MSU_STATUS_LABEL[player.msuStatus]} ·{" "}
                    {pluralize(player._count.rosterEntries, "заявка", "заявки", "заявок")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
            {pageNumber > 1 ? (
              <Link
                href={`/admin/players?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNumber - 1) })}`}
                className={buttonClass("secondary")}
              >
                ← Назад
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted">
              Страница {pageNumber} из {pageCount}
            </span>
            {pageNumber < pageCount ? (
              <Link
                href={`/admin/players?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNumber + 1) })}`}
                className={buttonClass("secondary")}
              >
                Вперёд →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Новый игрок" />
        <div className="p-4">
          <ActionForm action={savePlayer.bind(null, null)} submitLabel="Добавить игрока" resetOnSuccess>
            <PlayerFields faculties={faculties} />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
