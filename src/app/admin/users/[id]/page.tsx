import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/ActionForm";
import { UserFields } from "@/components/admin/EntityFields";
import { Card, PageTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { saveUser } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Аккаунт — управление" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [user, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, role: true, teamId: true },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!user) notFound();

  return (
    <div className="max-w-2xl">
      <PageTitle title={user.fullName} subtitle={user.email} />
      <Card className="p-4">
        <ActionForm action={saveUser.bind(null, user.id)}>
          <UserFields teams={teams} defaults={user} isNew={false} />
        </ActionForm>
      </Card>
    </div>
  );
}
