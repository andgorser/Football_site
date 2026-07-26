import { Field, inputClass } from "@/components/ui";
import { MATCH_STAGE_LABEL } from "@/lib/football";
import { toDateTimeInput } from "@/lib/format";

export type MatchFieldsData = {
  tournamentId: number;
  divisions: { id: number; name: string }[];
  entries: { id: number; team: { name: string } }[];
  venues: { id: number; name: string }[];
  referees: { id: string; fullName: string }[];
  defaults?: {
    divisionId: number | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
    kickoffAt: Date;
    kickoffTbd: boolean;
    venueId: number | null;
    refereeId: string | null;
    round: number | null;
    stage: string;
    notes: string | null;
  };
};

/** Поля формы матча — общие для создания и редактирования. */
export function MatchFields({
  data,
  slotMode = false,
}: {
  data: MatchFieldsData;
  /** У матча плей-офф участники задаются в конструкторе сетки, а не здесь */
  slotMode?: boolean;
}) {
  const { defaults } = data;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="tournamentId" value={data.tournamentId} />

      {slotMode ? (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted sm:col-span-2">
          Участники этого матча задаются в конструкторе сетки плей-офф — здесь они
          не редактируются, чтобы не затереть подставленную сеткой команду.
        </div>
      ) : (
        <>
          <Field label="Хозяева">
            <select name="homeTeamId" required defaultValue={defaults?.homeTeamId ?? ""} className={inputClass}>
              <option value="">Выберите команду</option>
              {data.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.team.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Гости">
            <select name="awayTeamId" required defaultValue={defaults?.awayTeamId ?? ""} className={inputClass}>
              <option value="">Выберите команду</option>
              {data.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.team.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field
        label="Дата и время"
        hint="Снимите галочку, когда время согласовано — на сайте появится точное время"
      >
        <input
          type="datetime-local"
          name="kickoffAt"
          required
          defaultValue={toDateTimeInput(defaults?.kickoffAt ?? new Date())}
          className={inputClass}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            name="kickoffTbd"
            value="1"
            defaultChecked={defaults?.kickoffTbd ?? false}
            className="size-4 accent-brand"
          />
          Время уточняется (на сайте вместо времени будет «—:—»)
        </label>
      </Field>

      <Field label="Место проведения">
        <select name="venueId" defaultValue={defaults?.venueId ?? ""} className={inputClass}>
          <option value="">Не указано</option>
          {data.venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Дивизион">
        <select name="divisionId" defaultValue={defaults?.divisionId ?? ""} className={inputClass}>
          <option value="">Без дивизиона</option>
          {data.divisions.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Судья">
        <select name="refereeId" defaultValue={defaults?.refereeId ?? ""} className={inputClass}>
          <option value="">Не назначен</option>
          {data.referees.map((referee) => (
            <option key={referee.id} value={referee.id}>
              {referee.fullName}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Номер тура" hint="Пусто для кубковых стадий">
        <input
          type="number"
          name="round"
          min={1}
          max={60}
          defaultValue={defaults?.round ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Стадия">
        <select name="stage" defaultValue={defaults?.stage ?? "REGULAR"} className={inputClass}>
          {Object.entries(MATCH_STAGE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Комментарий" hint="Например, причина переноса. Виден всем на странице матча">
          <textarea
            name="notes"
            rows={2}
            maxLength={300}
            defaultValue={defaults?.notes ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
