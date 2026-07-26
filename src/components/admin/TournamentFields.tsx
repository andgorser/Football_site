import Link from "next/link";

import { Field, inputClass } from "@/components/ui";
import { toDateInput } from "@/lib/format";

export type TournamentDefaults = {
  name: string;
  season: string;
  seriesId: number | null;
  format: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  halfDurationMin: number;
  pointsForWin: number;
  pointsForDraw: number;
  description: string | null;
};

const currentSeason = (() => {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
})();

/** Поля формы турнира — общие для создания и редактирования. */
export function TournamentFields({
  defaults,
  seriesOptions = [],
}: {
  defaults?: TournamentDefaults;
  /** Серии, в которые можно включить турнир */
  seriesOptions?: { id: number; name: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Название">
          <input
            name="name"
            required
            defaultValue={defaults?.name}
            placeholder="Чемпионат МГУ по футболу"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Сезон">
        <input
          name="season"
          required
          defaultValue={defaults?.season ?? currentSeason}
          placeholder="2025/26"
          className={inputClass}
        />
      </Field>

      <Field label="Серия" hint="Связывает сезоны одного турнира в одну историю">
        {seriesOptions.length > 0 ? (
          <select name="seriesId" defaultValue={defaults?.seriesId ?? ""} className={inputClass}>
            <option value="">Без серии</option>
            {seriesOptions.map((series) => (
              <option key={series.id} value={series.id}>
                {series.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted">
            Серий пока нет —{" "}
            <Link href="/admin/series" className="text-brand hover:underline">
              создайте первую
            </Link>
          </p>
        )}
      </Field>

      <Field label="Формат">
        <select name="format" defaultValue={defaults?.format ?? "LEAGUE"} className={inputClass}>
          <option value="LEAGUE">Круговой турнир</option>
          <option value="GROUPS_PLAYOFF">Группы + плей-офф</option>
          <option value="CUP">Кубок на вылет</option>
        </select>
      </Field>

      <Field label="Дата начала">
        <input
          type="date"
          name="startDate"
          required
          defaultValue={toDateInput(defaults?.startDate) || toDateInput(new Date())}
          className={inputClass}
        />
      </Field>

      <Field label="Дата окончания" hint="Можно не заполнять">
        <input
          type="date"
          name="endDate"
          defaultValue={toDateInput(defaults?.endDate)}
          className={inputClass}
        />
      </Field>

      <Field label="Статус">
        <select name="status" defaultValue={defaults?.status ?? "UPCOMING"} className={inputClass}>
          <option value="UPCOMING">Скоро начнётся</option>
          <option value="ONGOING">Идёт</option>
          <option value="FINISHED">Завершён</option>
        </select>
      </Field>

      <Field label="Длительность тайма, мин">
        <input
          type="number"
          name="halfDurationMin"
          min={5}
          max={60}
          defaultValue={defaults?.halfDurationMin ?? 30}
          className={inputClass}
        />
      </Field>

      <Field label="Очков за победу">
        <input
          type="number"
          name="pointsForWin"
          min={0}
          max={10}
          defaultValue={defaults?.pointsForWin ?? 3}
          className={inputClass}
        />
      </Field>

      <Field label="Очков за ничью">
        <input
          type="number"
          name="pointsForDraw"
          min={0}
          max={10}
          defaultValue={defaults?.pointsForDraw ?? 1}
          className={inputClass}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Описание" hint="Показывается на странице турнира">
          <textarea
            name="description"
            rows={3}
            defaultValue={defaults?.description ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
