import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { Card, CardHeader, Field, PageTitle, inputClass } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { deleteVenue, saveVenue } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Площадки — управление" };

export default async function AdminVenuesPage() {
  const venues = await prisma.venue.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      _count: { select: { matches: true } },
    },
  });

  return (
    <div className="space-y-4">
      <PageTitle
        title="Площадки"
        subtitle="Поля и стадионы, на которых играются матчи"
      />

      <Card>
        <CardHeader title="Добавить площадку" />
        <div className="p-4">
          <ActionForm
            action={saveVenue.bind(null, null)}
            submitLabel="Добавить"
            variant="secondary"
            resetOnSuccess
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название">
                <input name="name" required placeholder="Поле ГЗ" className={inputClass} />
              </Field>
              <Field label="Адрес" hint="Необязательно">
                <input name="address" placeholder="Ленинские горы, 1" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Все площадки"
          subtitle={pluralize(venues.length, "площадка", "площадки", "площадок")}
        />
        {venues.length > 0 ? (
          <ul className="divide-y divide-border">
            {venues.map((venue) => (
              <li key={venue.id} className="px-4 py-3">
                <ActionForm
                  action={saveVenue.bind(null, venue.id)}
                  submitLabel="Сохранить"
                  variant="outline"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Название">
                      <input
                        name="name"
                        required
                        defaultValue={venue.name}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Адрес">
                      <input
                        name="address"
                        defaultValue={venue.address ?? ""}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </ActionForm>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-subtle">
                  <span>{pluralize(venue._count.matches, "матч", "матча", "матчей")}</span>
                  {venue._count.matches === 0 ? (
                    <ActionButton
                      action={deleteVenue.bind(null, venue.id)}
                      label="Удалить"
                      variant="ghost"
                      className="py-1 text-xs"
                      confirmText={`Удалить площадку «${venue.name}»?`}
                    />
                  ) : (
                    <span>Удалить нельзя: на площадке есть матчи</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Площадок пока нет. Они появятся сами при импорте расписания, если в таблице
            заполнена колонка «Поле».
          </p>
        )}
      </Card>
    </div>
  );
}
