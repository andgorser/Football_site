"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { assignReferee } from "@/server/admin-actions";

/** Назначение судьи прямо в списке матчей — без открытия карточки. */
export function RefereeSelect({
  matchId,
  refereeId,
  referees,
}: {
  matchId: number;
  refereeId: string | null;
  referees: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col">
      <select
        value={refereeId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.value || null;
          setError(null);
          startTransition(async () => {
            const result = await assignReferee(matchId, value);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className={cn(inputClass, "w-44 py-1 text-xs", !refereeId && "text-subtle")}
        aria-label="Судья матча"
      >
        <option value="">Судья не назначен</option>
        {referees.map((referee) => (
          <option key={referee.id} value={referee.id}>
            {referee.fullName}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-loss">{error}</span> : null}
    </span>
  );
}
