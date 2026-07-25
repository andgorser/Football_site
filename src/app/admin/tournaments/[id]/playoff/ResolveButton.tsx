"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, Card, CardHeader, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { resolveSlotsAction } from "@/server/playoff-actions";
import type { SlotReport } from "@/server/playoff";

const STATE_TONE: Record<SlotReport["state"], string> = {
  resolved: "text-win",
  cleared: "text-warning",
  pending: "text-muted",
  locked: "text-warning",
  conflict: "text-loss",
};

/**
 * Кнопка «Обновить участников» и отчёт последнего пересчёта.
 *
 * Отчёт — главный инструмент организатора: именно он объясняет, почему
 * слот остался пустым («дивизион не доигран», «матч завершился вничью»).
 */
export function ResolveButton({ tournamentId }: { tournamentId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reports, setReports] = useState<SlotReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await resolveSlotsAction(tournamentId);
            if (result.error) setError(result.error);
            else {
              setReports(result.reports ?? []);
              router.refresh();
            }
          });
        }}
        className={buttonClass("primary")}
      >
        {pending ? "Пересчитываем…" : "Обновить участников"}
      </button>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {reports ? (
        <Card>
          <CardHeader
            title="Отчёт последнего пересчёта"
            subtitle={reports.length === 0 ? "Все участники на месте" : undefined}
          />
          {reports.length > 0 ? (
            <ul className="divide-y divide-border">
              {reports.map((report, index) => (
                <li
                  key={`${report.matchId}-${report.side}-${index}`}
                  className={cn("px-4 py-2 text-sm", STATE_TONE[report.state])}
                >
                  {report.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
