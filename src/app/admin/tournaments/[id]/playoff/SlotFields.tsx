"use client";

import { useState } from "react";
import type { MatchSlotSource } from "@prisma/client";

import { Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SLOT_SOURCE_LABEL, slotLabel } from "@/lib/playoff";

export type SlotOptions = {
  entries: { id: number; name: string }[];
  divisions: { id: number; name: string; teamCount: number }[];
  matches: { id: number; label: string }[];
};

export type SlotDefaults = {
  source: MatchSlotSource;
  teamId: number | null;
  divisionId: number | null;
  place: number | null;
  matchId: number | null;
  label: string | null;
};

/**
 * Одна сторона матча плей-офф: выбор источника участника и ровно одно
 * зависимое поле. Скрытые поля не попадают в форму — серверное действие
 * проверяет только то, что относится к выбранному источнику.
 */
export function SlotFields({
  side,
  title,
  options,
  defaults,
}: {
  side: "home" | "away";
  title: string;
  options: SlotOptions;
  defaults?: SlotDefaults;
}) {
  const [source, setSource] = useState<MatchSlotSource>(defaults?.source ?? "DIVISION_PLACE");
  const [divisionId, setDivisionId] = useState(defaults?.divisionId?.toString() ?? "");
  const [place, setPlace] = useState(defaults?.place?.toString() ?? "1");
  const [matchId, setMatchId] = useState(defaults?.matchId?.toString() ?? "");
  const [label, setLabel] = useState(defaults?.label ?? "");

  const divisionName = options.divisions.find((d) => d.id === Number(divisionId))?.name;

  // Показываем ровно то, что увидит болельщик
  const preview = slotLabel({
    source,
    divisionName,
    place: place ? Number(place) : null,
    sourceMatchId: matchId ? Number(matchId) : null,
    label: label || null,
  });

  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </legend>

      <div className="grid gap-3">
        <Field label="Откуда участник">
          <select
            name={`${side}Source`}
            value={source}
            onChange={(event) => setSource(event.target.value as MatchSlotSource)}
            className={inputClass}
          >
            {Object.entries(SLOT_SOURCE_LABEL).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </Field>

        {source === "TEAM" ? (
          <Field label="Команда">
            <select
              name={`${side}TeamId`}
              defaultValue={defaults?.teamId?.toString() ?? ""}
              className={inputClass}
            >
              <option value="">Выберите команду</option>
              {options.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {source === "DIVISION_PLACE" ? (
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Дивизион">
              <select
                name={`${side}DivisionId`}
                value={divisionId}
                onChange={(event) => setDivisionId(event.target.value)}
                className={inputClass}
              >
                <option value="">Выберите дивизион</option>
                {options.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Место">
              <input
                type="number"
                name={`${side}Place`}
                min={1}
                max={99}
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        ) : null}

        {source === "MATCH_WINNER" || source === "MATCH_LOSER" ? (
          <Field label="Матч-источник">
            <select
              name={`${side}MatchId`}
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
              className={inputClass}
            >
              <option value="">Выберите матч</option>
              {options.matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Своя подпись" hint="Необязательно. Перекрывает автоматическую">
          <input
            name={`${side}Label`}
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Например: Лучшая из вторых команд"
            className={inputClass}
          />
        </Field>

        <p className={cn("text-xs text-muted")}>
          Болельщики увидят: <span className="font-medium text-fg">{preview}</span>
        </p>
      </div>
    </fieldset>
  );
}
