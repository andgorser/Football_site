"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, buttonClass, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  COLUMN_TITLE,
  matchTeamName,
  parseScheduleTable,
  type TeamOption,
} from "@/lib/schedule-table";
import { importSchedule, type ImportReport } from "@/server/schedule-actions";

const STATUS_LABEL: Record<string, string> = {
  create: "создать",
  update: "обновить",
  unchanged: "без изменений",
  skip: "пропустить",
  error: "ошибка",
};

const STATUS_CLASS: Record<string, string> = {
  create: "text-win",
  update: "text-brand",
  unchanged: "text-subtle",
  skip: "text-muted",
  error: "text-loss",
};

/**
 * Вставка расписания из Excel или Google-таблицы.
 *
 * Предпросмотр считается прямо в браузере теми же функциями, что и на сервере,
 * поэтому опечатку видно сразу. Но окончательное решение всегда за сервером:
 * только он знает, какие матчи уже сыграны.
 */
export function ScheduleImport({
  tournamentId,
  entries,
  defaultYear,
  sample,
}: {
  tournamentId: number;
  entries: TeamOption[];
  defaultYear: number;
  /** Готовая выгрузка текущего расписания — образец формата */
  sample: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [createVenues, setCreateVenues] = useState(true);
  const [partial, setPartial] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error?: string; message?: string; report?: ImportReport }>({});
  const [checked, setChecked] = useState(false);

  // Быстрая локальная проверка: ловит опечатки до обращения к серверу
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parseScheduleTable(text, { defaultYear });
    if (parsed.errors.length > 0) return { tableErrors: parsed.errors, unknown: [] as string[], rows: 0 };

    const unknown = new Set<string>();
    for (const row of parsed.rows) {
      for (const raw of [row.home, row.away]) {
        const result = matchTeamName(raw, entries);
        if (result.kind === "none" || result.kind === "ambiguous") unknown.add(raw);
      }
    }
    return { tableErrors: [], unknown: [...unknown], rows: parsed.rows.length };
  }, [text, entries, defaultYear]);

  function run(dryRun: boolean) {
    const formData = new FormData();
    formData.set("text", text);
    if (dryRun) formData.set("dryRun", "1");
    if (createVenues) formData.set("createVenues", "1");
    if (partial) formData.set("partial", "1");

    startTransition(async () => {
      const result = await importSchedule(tournamentId, {}, formData);
      setState(result);
      setChecked(dryRun && !result.error);
      if (!dryRun && !result.error) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <details className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold">Как заполнять таблицу</summary>
        <div className="mt-2 space-y-2">
          <p>
            Первая строка — заголовок. Порядок колонок любой, лишние колонки игнорируются.
            Понимаются: {Object.values(COLUMN_TITLE).join(", ")}.
          </p>
          <p>
            Обязательны «{COLUMN_TITLE.home}» и «{COLUMN_TITLE.away}»; чтобы создать новый матч —
            ещё «{COLUMN_TITLE.round}» и «{COLUMN_TITLE.date}». Пустое «{COLUMN_TITLE.time}» означает
            «время уточняется». Счёт не импортируется — его вносит судья в протоколе.
          </p>
          <pre className="overflow-x-auto rounded bg-surface p-2 text-[11px] leading-relaxed">
            {sample || "Тур\tДата\tВремя\tХозяева\tГости\tПоле\n1\t14.03.2026\t19:00\tМехмат\tВМК\tПоле ГЗ"}
          </pre>
          <p>
            Это же — выгрузка текущего расписания: скопируйте её в Excel, поправьте время и поля,
            вставьте обратно.
          </p>
        </div>
      </details>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setChecked(false);
          setState({});
        }}
        rows={8}
        placeholder="Вставьте сюда диапазон из Excel или Google-таблицы"
        className={cn(inputClass, "font-mono text-xs")}
      />

      {preview ? (
        <div className="text-xs text-muted">
          {preview.tableErrors.length > 0 ? (
            <Alert tone="error">{preview.tableErrors.join(" ")}</Alert>
          ) : (
            <p>
              Строк в таблице: {preview.rows}.{" "}
              {preview.unknown.length > 0 ? (
                <span className="text-loss">
                  Не узнаю команды: {preview.unknown.join(", ")}
                </span>
              ) : (
                <span className="text-win">Все команды опознаны</span>
              )}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={createVenues}
            onChange={(e) => setCreateVenues(e.target.checked)}
            className="size-4 accent-brand"
          />
          Создавать недостающие площадки
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={partial}
            onChange={(e) => setPartial(e.target.checked)}
            className="size-4 accent-brand"
          />
          Импортировать только корректные строки
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending || !text.trim()}
          className={buttonClass("secondary")}
        >
          {pending ? "Считаем…" : "Проверить"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending || !checked}
          className={buttonClass("primary")}
          title={checked ? undefined : "Сначала нажмите «Проверить»"}
        >
          Импортировать
        </button>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message && !state.error ? <Alert tone="success">{state.message}</Alert> : null}

      {state.report ? (
        <div className="space-y-2">
          {state.report.newVenues.length > 0 ? (
            <Alert tone="warning">
              Будут созданы площадки: {state.report.newVenues.join(", ")}
            </Alert>
          ) : null}

          <ul className="max-h-80 overflow-y-auto rounded-lg border border-border text-xs">
            {state.report.rows.map((row) => (
              <li
                key={row.line}
                className="flex flex-wrap items-baseline gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
              >
                <span className="w-10 shrink-0 text-subtle">стр. {row.line}</span>
                <span className={cn("w-28 shrink-0 font-semibold", STATUS_CLASS[row.status])}>
                  {STATUS_LABEL[row.status]}
                </span>
                <span className="min-w-0 flex-1">{row.summary}</span>
                {row.warnings && row.warnings.length > 0 ? (
                  <span className="w-full text-warning">⚠ {row.warnings.join("; ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
