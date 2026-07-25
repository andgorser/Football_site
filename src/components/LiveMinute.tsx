"use client";

import { useEffect, useState } from "react";
import type { MatchStatus } from "@prisma/client";

import { currentMinute } from "@/lib/football";

/**
 * Тикающая минута идущего матча.
 *
 * Начальное значение приходит с сервера, поэтому при гидратации разметка
 * совпадает; дальше компонент пересчитывает время сам каждые 10 секунд.
 */
export function LiveMinute({
  status,
  periodStartedAt,
  clockOffsetSec,
  initialMinute,
  className,
}: {
  status: MatchStatus;
  periodStartedAt: string | null;
  clockOffsetSec: number;
  initialMinute: number | null;
  className?: string;
}) {
  const [minute, setMinute] = useState(initialMinute);

  useEffect(() => {
    const recompute = () =>
      setMinute(
        currentMinute({
          status,
          periodStartedAt: periodStartedAt ? new Date(periodStartedAt) : null,
          clockOffsetSec,
        }),
      );
    recompute();
    const timer = setInterval(recompute, 10_000);
    return () => clearInterval(timer);
  }, [status, periodStartedAt, clockOffsetSec]);

  if (minute === null) return null;
  return <span className={className}>{minute}&#39;</span>;
}
