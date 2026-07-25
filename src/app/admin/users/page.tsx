import Link from "next/link";

import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { UserFields } from "@/components/admin/EntityFields";
import { Badge, Card, CardHeader, PageTitle } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { saveUser, toggleUserActive } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Пользователи — управление" };

export default async function AdminUsersPage() {
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        team: { select: { shortName: true } },
        _count: { select: { refereedMatches: true } },
      },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Пользователи"
        subtitle="Аккаунты судей, капитанов и организаторов"
      />

      <Card>
        <CardHeader title="Все аккаунты" />
        <ul className="divide-y divide-border">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="min-w-[12rem] flex-1">
                <p className="truncate text-sm font-medium">
                  {user.fullName}
                  {!user.isActive ? (
                    <span className="ml-2 text-xs font-normal text-loss">отключён</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-subtle">
                  {user.email}
                  {user.team ? ` · ${user.team.shortName}` : ""}
                  {user.role === "REFEREE" ? ` · матчей: ${user._count.refereedMatches}` : ""}
                </p>
              </div>
              <Badge tone={user.role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[user.role]}</Badge>
              <Link
                href={`/admin/users/${user.id}`}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Изменить
              </Link>
              <ActionButton
                action={toggleUserActive.bind(null, user.id)}
                label={user.isActive ? "Отключить" : "Включить"}
                variant="ghost"
                className="py-1 text-xs"
                confirmText={
                  user.isActive
                    ? `Отключить доступ для ${user.email}?`
                    : `Вернуть доступ для ${user.email}?`
                }
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Новый аккаунт"
          subtitle="Пароль задаёте вы и передаёте человеку лично"
        />
        <div className="p-4">
          <ActionForm action={saveUser.bind(null, null)} submitLabel="Создать аккаунт" resetOnSuccess>
            <UserFields teams={teams} isNew />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
