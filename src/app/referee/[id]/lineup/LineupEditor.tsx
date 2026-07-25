"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PlayerPosition } from "@prisma/client";

import { Alert, Card, CardHeader, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { POSITION_SHORT } from "@/lib/football";
import { saveLineup } from "@/server/match-actions";

export type LineupPlayer = {
  id: number;
  shirtNumber: number | null;
  position: PlayerPosition | null;
  name: string;
  state: "starting" | "bench" | "out";
};

export type LineupTeam = {
  entryId: number;
  name: string;
  players: LineupPlayer[];
};

/**
 * Отметка состава на матч. Три состояния на игрока: старт, запас, не играет.
 * Кнопки крупные — заполнять предполагается с телефона перед игрой.
 */
export function LineupEditor({ matchId, teams }: { matchId: number; teams: LineupTeam[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {teams.map((team) => (
        <TeamLineup key={team.entryId} matchId={matchId} team={team} />
      ))}
    </div>
  );
}

function TeamLineup({ matchId, team }: { matchId: number; team: LineupTeam }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [players, setPlayers] = useState(team.players);

  const starting = players.filter((p) => p.state === "starting");
  const bench = players.filter((p) => p.state === "bench");

  function setState(id: number, state: LineupPlayer["state"]) {
    setSaved(false);
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, state } : p)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveLineup(matchId, team.entryId, {
        starting: starting.map((p) => p.id),
        bench: bench.map((p) => p.id),
      });
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title={team.name}
        subtitle={`В старте ${starting.length} из 11 · в запасе ${bench.length}`}
        action={
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={buttonClass("primary", "px-3 py-1.5 text-xs")}
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        }
      />

      {error ? (
        <div className="px-4 pt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {saved && !error ? (
        <div className="px-4 pt-3">
          <Alert tone="success">Состав сохранён</Alert>
        </div>
      ) : null}

      {players.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          В заявке команды нет игроков. Их добавляет капитан или организатор.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {players.map((player) => (
            <li key={player.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-6 shrink-0 text-right text-xs text-subtle tabular-nums">
                {player.shirtNumber ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{player.name}</span>
              {player.position ? (
                <span className="shrink-0 text-[10px] font-semibold text-subtle">
                  {POSITION_SHORT[player.position]}
                </span>
              ) : null}
              <div className="flex shrink-0 gap-1">
                {(
                  [
                    ["starting", "Старт"],
                    ["bench", "Запас"],
                    ["out", "—"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setState(player.id, value)}
                    className={cn(
                      "min-h-9 rounded-lg px-2 text-xs font-semibold transition-colors",
                      player.state === value
                        ? value === "starting"
                          ? "bg-brand text-brand-fg"
                          : value === "bench"
                            ? "bg-surface-3 text-fg ring-1 ring-brand"
                            : "bg-surface-3 text-muted ring-1 ring-border"
                        : "bg-surface-2 text-subtle hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {starting.length > 11 ? (
        <div className="px-4 py-3">
          <Alert tone="error">В стартовом составе не может быть больше 11 игроков</Alert>
        </div>
      ) : null}
    </Card>
  );
}
