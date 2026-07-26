"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Badge, buttonClass, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { deleteDivision, mergeSplitBack, updateDivision } from "@/server/admin-actions";

export type DivisionRowData = {
  id: number;
  name: string;
  halfDurationMin: number | null;
  entryCount: number;
  matchCount: number;
  /** Дивизион разделён на половины — его этап завершён */
  isArchived: boolean;
  /** Откуда перенесены очки, если это половина */
  parentName: string | null;
};

/**
 * Строка дивизиона: название и длительность тайма правятся на месте.
 *
 * Пустое поле длительности означает «как в турнире» — поэтому в состоянии
 * держим строку, а не число: иначе пустое поле пришлось бы отличать от нуля.
 */
export function DivisionRow({
  division,
  tournamentHalfDuration,
  children,
}: {
  division: DivisionRowData;
  tournamentHalfDuration: number;
  /** Блок разделения по итогам — приходит со страницы */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(division.name);
  const [half, setHalf] = useState(
    division.halfDurationMin === null ? "" : String(division.halfDurationMin),
  );

  const initialHalf = division.halfDurationMin === null ? "" : String(division.halfDurationMin);
  const dirty = name !== division.name || half !== initialHalf;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateDivision(division.id, {
        name,
        halfDurationMin: half.trim() === "" ? null : Number(half),
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Удалить дивизион «${division.name}»? Матчи останутся, но потеряют привязку.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteDivision(division.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function merge() {
    if (
      !window.confirm(
        `Отменить разделение «${division.name}»? Команды вернутся в него, половины будут удалены.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await mergeSplitBack(division.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={cn(inputClass, "min-w-0 flex-1 py-1 text-sm")}
        aria-label="Название дивизиона"
      />

      <label className="flex items-center gap-1 text-xs text-subtle">
        Тайм
        <input
          type="number"
          min={5}
          max={60}
          value={half}
          onChange={(e) => setHalf(e.target.value)}
          placeholder={String(tournamentHalfDuration)}
          className={cn(inputClass, "w-16 py-1 text-xs")}
          title="Пусто — как в турнире"
        />
        мин
      </label>

      <span className="text-xs text-subtle">
        {division.entryCount} команд · {division.matchCount} матчей
      </span>

      {division.isArchived ? <Badge>Архив первого этапа</Badge> : null}
      {division.parentName ? (
        <span className="text-xs text-subtle">перенос из «{division.parentName}»</span>
      ) : null}

      {dirty ? (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={buttonClass("primary", "py-1 text-xs")}
        >
          Сохранить
        </button>
      ) : null}
      {division.isArchived ? (
        <button
          type="button"
          onClick={merge}
          disabled={pending}
          className={buttonClass("ghost", "py-1 text-xs")}
        >
          Отменить разделение
        </button>
      ) : (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className={buttonClass("ghost", "py-1 text-xs")}
        >
          Удалить
        </button>
      )}

      {error ? <span className="w-full text-xs text-loss">{error}</span> : null}
      {children ? <div className="w-full">{children}</div> : null}
    </li>
  );
}
