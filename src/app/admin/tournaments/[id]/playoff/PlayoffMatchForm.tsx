"use client";

import { useActionState } from "react";

import { SlotFields, type SlotDefaults, type SlotOptions } from "@/app/admin/tournaments/[id]/playoff/SlotFields";
import { Alert, Field, buttonClass, inputClass } from "@/components/ui";
import { MATCH_STAGE_LABEL, PLAYOFF_STAGES } from "@/lib/football";
import { savePlayoffMatch, type FormState } from "@/server/playoff-actions";

export type MatchFormDefaults = {
  id: number;
  stage: string;
  bracketOrder: number;
  kickoffAt: string;
  venueId: number | null;
  refereeId: string | null;
  home: SlotDefaults;
  away: SlotDefaults;
};

/**
 * Форма матча плей-офф. Используется и для создания, и для правки:
 * при правке в defaults приходит текущий матч.
 */
export function PlayoffMatchForm({
  tournamentId,
  options,
  venues,
  referees,
  defaults,
  defaultKickoff,
  defaultOrder,
}: {
  tournamentId: number;
  options: SlotOptions;
  venues: { id: number; name: string }[];
  referees: { id: string; fullName: string }[];
  defaults?: MatchFormDefaults;
  defaultKickoff: string;
  defaultOrder: number;
}) {
  const action = savePlayoffMatch.bind(null, tournamentId, defaults?.id ?? null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Стадия">
          <select name="stage" defaultValue={defaults?.stage ?? "SEMI_FINAL"} className={inputClass}>
            {PLAYOFF_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {MATCH_STAGE_LABEL[stage]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Порядок в стадии" hint="Чем меньше, тем выше в сетке">
          <input
            type="number"
            name="bracketOrder"
            min={0}
            max={999}
            defaultValue={defaults?.bracketOrder ?? defaultOrder}
            className={inputClass}
          />
        </Field>

        <Field label="Дата и время">
          <input
            type="datetime-local"
            name="kickoffAt"
            required
            defaultValue={defaults?.kickoffAt ?? defaultKickoff}
            className={inputClass}
          />
        </Field>

        <Field label="Поле">
          <select name="venueId" defaultValue={defaults?.venueId ?? ""} className={inputClass}>
            <option value="">Не указано</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Судья">
            <select name="refereeId" defaultValue={defaults?.refereeId ?? ""} className={inputClass}>
              <option value="">Не назначен</option>
              {referees.map((referee) => (
                <option key={referee.id} value={referee.id}>
                  {referee.fullName}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SlotFields side="home" title="Хозяева" options={options} defaults={defaults?.home} />
        <SlotFields side="away" title="Гости" options={options} defaults={defaults?.away} />
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message && !state.error ? <Alert tone="success">{state.message}</Alert> : null}

      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Сохраняем…" : defaults ? "Сохранить матч" : "Добавить в сетку"}
        </button>
      </div>
    </form>
  );
}
