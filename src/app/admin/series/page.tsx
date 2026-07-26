import Link from "next/link";

import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { Alert, Card, CardHeader, Field, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { deleteSeries, groupTournamentsIntoSeries, saveSeries } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Серии турниров — управление" };

export default async function AdminSeriesPage() {
  const [series, orphanCount] = await Promise.all([
    prisma.tournamentSeries.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        tournaments: {
          orderBy: { startDate: "desc" },
          select: { id: true, name: true, season: true },
        },
      },
    }),
    prisma.tournament.count({ where: { seriesId: null } }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Серии турниров"
        subtitle="Связывают сезоны одного турнира в одну историю"
      />

      {orphanCount > 0 ? (
        <Alert tone="warning">
          <div className="space-y-2">
            <p>
              {pluralize(orphanCount, "турнир", "турнира", "турниров")} не привязан к серии.
              Кнопка разложит их по совпадению названия: одинаковое название = одна серия.
              Турнир, который между годами переименовывали, попадёт в отдельную серию —
              такие объединяются вручную в форме турнира.
            </p>
            <ActionButton
              action={groupTournamentsIntoSeries}
              label="Разложить турниры по сериям"
              variant="secondary"
              className="py-1 text-xs"
            />
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Новая серия" />
        <div className="p-4">
          <ActionForm
            action={saveSeries.bind(null, null)}
            submitLabel="Создать серию"
            variant="secondary"
            resetOnSuccess
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название">
                <input
                  name="name"
                  required
                  placeholder="Чемпионат МГУ по футболу"
                  className={inputClass}
                />
              </Field>
              <Field label="Ссылка на логотип" hint="Необязательно">
                <input name="logoUrl" placeholder="https://…" className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Описание" hint="Необязательно">
                  <textarea name="description" rows={2} className={inputClass} />
                </Field>
              </div>
            </div>
          </ActionForm>
        </div>
      </Card>

      {series.map((item) => (
        <Card key={item.id}>
          <CardHeader
            title={item.name}
            subtitle={pluralize(item.tournaments.length, "сезон", "сезона", "сезонов")}
            action={
              <Link href={`/series/${item.slug}`} className={buttonClass("secondary", "py-1 text-xs")}>
                Открыть на сайте
              </Link>
            }
          />
          <div className="space-y-3 p-4">
            <ActionForm
              action={saveSeries.bind(null, item.id)}
              submitLabel="Сохранить"
              variant="outline"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Название">
                  <input name="name" required defaultValue={item.name} className={inputClass} />
                </Field>
                <Field label="Адрес" hint="Не меняется — иначе сломаются ссылки">
                  <input value={`/series/${item.slug}`} readOnly disabled className={inputClass} />
                </Field>
              </div>
            </ActionForm>

            {item.tournaments.length > 0 ? (
              <ul className="text-sm">
                {item.tournaments.map((tournament) => (
                  <li key={tournament.id} className="py-0.5">
                    <Link
                      href={`/admin/tournaments/${tournament.id}`}
                      className="text-brand hover:underline"
                    >
                      {tournament.name} — сезон {tournament.season}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                В серии пока нет турниров. Серия выбирается в настройках турнира.
              </p>
            )}

            <ActionButton
              action={deleteSeries.bind(null, item.id)}
              label="Удалить серию"
              variant="ghost"
              className="py-1 text-xs"
              confirmText={`Удалить серию «${item.name}»? Турниры останутся, но потеряют связь между сезонами.`}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
