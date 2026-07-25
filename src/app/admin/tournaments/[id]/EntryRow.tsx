"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TeamCrest } from "@/components/TeamCrest";
import { buttonClass, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { removeEntry, updateEntry } from "@/server/admin-actions";

export type EntryRowData = {
  id: number;
  divisionId: number | null;
  pointsAdjustment: number;
  matchCount: number;
  rosterCount: number;
  team: { name: string; shortName: string; logoUrl: string | null; primaryColor: string | null };
};

/** Строка заявленной команды: дивизион и снятые очки правятся на месте. */
export function EntryRow({
  entry,
  divisions,
  tournamentId,
}: {
  entry: EntryRowData;
  divisions: { id: number; name: string }[];
  tournamentId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState(entry.divisionId);
  const [adjustment, setAdjustment] = useState(entry.pointsAdjustment);

  const dirty = divisionId !== entry.divisionId || adjustment !== entry.pointsAdjustment;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateEntry(entry.id, { divisionId, pointsAdjustment: adjustment });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Снять «${entry.team.name}» с турнира?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeEntry(entry.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <TeamCrest team={entry.team} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.team.name}</span>

      <span className="text-xs text-subtle">
        {entry.rosterCount} в заявке · {entry.matchCount} матчей
      </span>

      {divisions.length > 0 ? (
        <select
          value={divisionId ?? ""}
          onChange={(e) => setDivisionId(e.target.value ? Number(e.target.value) : null)}
          className={cn(inputClass, "w-40 py-1 text-xs")}
          aria-label="Дивизион"
        >
          <option value="">Без дивизиона</option>
          {divisions.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name}
            </option>
          ))}
        </select>
      ) : null}

      <input
        type="number"
        value={adjustment}
        onChange={(e) => setAdjustment(Number(e.target.value))}
        className={cn(inputClass, "w-20 py-1 text-xs")}
        title="Снятые или добавленные очки"
        aria-label="Корректировка очков"
      />

      <Link
        href={`/admin/tournaments/${tournamentId}/roster/${entry.id}`}
        className={buttonClass("outline", "py-1 text-xs")}
      >
        Заявка
      </Link>

      {dirty ? (
        <button type="button" onClick={save} disabled={pending} className={buttonClass("primary", "py-1 text-xs")}>
          Сохранить
        </button>
      ) : null}
      <button type="button" onClick={remove} disabled={pending} className={buttonClass("ghost", "py-1 text-xs")}>
        Снять
      </button>

      {error ? <span className="w-full text-xs text-loss">{error}</span> : null}
    </li>
  );
}
