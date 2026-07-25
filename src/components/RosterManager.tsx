"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, Card, CardHeader, Field, buttonClass, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { POSITION_LABEL } from "@/lib/football";
import {
  addRosterEntry,
  removeRosterEntry,
  updateRosterEntry,
} from "@/server/admin-actions";

export type RosterEntryData = {
  id: number;
  shirtNumber: number | null;
  position: string | null;
  isCaptain: boolean;
  locked: boolean; // игрок уже участвовал в матчах — убрать нельзя
  player: { id: string; name: string; course: number | null };
};

export type AvailablePlayer = { id: string; name: string };

/**
 * Заявка команды на турнир. Используется и капитаном, и организатором —
 * права проверяются на сервере, интерфейс одинаковый.
 */
export function RosterManager({
  tournamentTeamId,
  title,
  subtitle,
  roster,
  availablePlayers,
}: {
  tournamentTeamId: number;
  title: string;
  subtitle?: string;
  roster: RosterEntryData[];
  availablePlayers: AvailablePlayer[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [position, setPosition] = useState("");

  function run(action: () => Promise<{ error?: string; message?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setMessage(result.message ?? "Сохранено");
        router.refresh();
      }
    });
  }

  function add() {
    if (!playerId) {
      setError("Выберите игрока");
      return;
    }
    const formData = new FormData();
    formData.set("playerId", playerId);
    formData.set("shirtNumber", shirtNumber);
    formData.set("position", position);
    run(async () => {
      const result = await addRosterEntry(tournamentTeamId, {}, formData);
      if (!result.error) {
        setPlayerId("");
        setShirtNumber("");
        setPosition("");
      }
      return result;
    });
  }

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle ?? `${roster.length} игроков в заявке`} />

      {error || message ? (
        <div className="px-4 pt-3">
          <Alert tone={error ? "error" : "success"}>{error ?? message}</Alert>
        </div>
      ) : null}

      {roster.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          Заявка пуста. Добавьте игроков формой ниже.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {roster.map((entry) => (
            <RosterRow key={entry.id} entry={entry} pending={pending} onRun={run} />
          ))}
        </ul>
      )}

      <div className="border-t border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
          Добавить игрока
        </p>
        {availablePlayers.length === 0 ? (
          <p className="text-sm text-muted">
            Все игроки уже в заявке. Новых игроков заводит организатор в разделе «Игроки».
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[2fr_auto_1fr_auto] sm:items-end">
            <Field label="Игрок">
              <select
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Выберите игрока</option>
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Номер">
              <input
                type="number"
                min={1}
                max={99}
                value={shirtNumber}
                onChange={(e) => setShirtNumber(e.target.value)}
                className={cn(inputClass, "w-20")}
              />
            </Field>
            <Field label="Позиция">
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className={inputClass}
              >
                <option value="">Не указана</option>
                {Object.entries(POSITION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <button type="button" onClick={add} disabled={pending} className={buttonClass("primary")}>
              Добавить
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function RosterRow({
  entry,
  pending,
  onRun,
}: {
  entry: RosterEntryData;
  pending: boolean;
  onRun: (action: () => Promise<{ error?: string; message?: string }>) => void;
}) {
  const [shirtNumber, setShirtNumber] = useState(entry.shirtNumber?.toString() ?? "");
  const [position, setPosition] = useState(entry.position ?? "");
  const [isCaptain, setIsCaptain] = useState(entry.isCaptain);

  const dirty =
    shirtNumber !== (entry.shirtNumber?.toString() ?? "") ||
    position !== (entry.position ?? "") ||
    isCaptain !== entry.isCaptain;

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm">
        {entry.player.name}
        {entry.player.course ? (
          <span className="ml-2 text-xs text-subtle">{entry.player.course} курс</span>
        ) : null}
      </span>

      <input
        type="number"
        min={1}
        max={99}
        value={shirtNumber}
        onChange={(e) => setShirtNumber(e.target.value)}
        placeholder="№"
        className={cn(inputClass, "w-16 py-1 text-center text-xs")}
        aria-label="Игровой номер"
      />

      <select
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        className={cn(inputClass, "w-36 py-1 text-xs")}
        aria-label="Позиция"
      >
        <option value="">Позиция —</option>
        {Object.entries(POSITION_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={isCaptain}
          onChange={(e) => setIsCaptain(e.target.checked)}
          className="size-4"
        />
        капитан
      </label>

      {dirty ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onRun(() =>
              updateRosterEntry(entry.id, {
                shirtNumber: shirtNumber ? Number(shirtNumber) : null,
                position: position || null,
                isCaptain,
              }),
            )
          }
          className={buttonClass("primary", "py-1 text-xs")}
        >
          Сохранить
        </button>
      ) : null}

      {entry.locked ? (
        <span className="text-xs text-subtle" title="Игрок уже играл в матчах">
          играл
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Убрать ${entry.player.name} из заявки?`)) return;
            onRun(() => removeRosterEntry(entry.id));
          }}
          className={buttonClass("ghost", "py-1 text-xs")}
        >
          Убрать
        </button>
      )}
    </li>
  );
}
