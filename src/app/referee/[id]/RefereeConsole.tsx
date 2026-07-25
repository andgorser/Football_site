"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { MatchEventType, MatchStatus, PlayerPosition } from "@prisma/client";

import { Alert, Badge, Card, CardHeader, buttonClass, inputClass } from "@/components/ui";
import { TeamCrest } from "@/components/TeamCrest";
import { cn } from "@/lib/cn";
import {
  EVENT_ICON,
  EVENT_LABEL,
  MATCH_STATUS_LABEL,
  POSITION_SHORT,
  currentMinute,
  formatMinute,
  isClockRunning,
  isLive,
} from "@/lib/football";
import {
  addMatchEvent,
  claimMatch,
  deleteMatchEvent,
  releaseMatch,
  setMatchNote,
  setMatchStatus,
  setShootoutScore,
  updateMatchEvent,
  type ActionResult,
} from "@/server/match-actions";

// ───────────────────────────── Типы данных ──────────────────────────────────

export type ConsoleRoster = {
  id: number;
  shirtNumber: number | null;
  position: PlayerPosition | null;
  name: string;
  onPitch: boolean;
};

export type ConsoleTeam = {
  entryId: number;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  roster: ConsoleRoster[];
};

export type ConsoleEvent = {
  id: number;
  type: MatchEventType;
  minute: number;
  extraMinute: number | null;
  tournamentTeamId: number;
  playerId: number | null;
  assistPlayerId: number | null;
  relatedPlayerId: number | null;
  playerName: string | null;
  assistName: string | null;
  relatedName: string | null;
};

export type ConsoleMatch = {
  id: number;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeShootoutScore: number | null;
  awayShootoutScore: number | null;
  periodStartedAt: string | null;
  clockOffsetSec: number;
  halfDurationMin: number;
  kickoffAt: string;
  tournamentName: string;
  notes: string | null;
  home: ConsoleTeam;
  away: ConsoleTeam;
  events: ConsoleEvent[];
};

// Порядок кнопок в списке типов события — от самого частого к редкому.
const EVENT_TYPES: MatchEventType[] = [
  "GOAL",
  "PENALTY_GOAL",
  "OWN_GOAL",
  "YELLOW_CARD",
  "RED_CARD",
  "SECOND_YELLOW_CARD",
  "SUBSTITUTION",
  "PENALTY_MISSED",
];

const SHORT_EVENT_LABEL: Record<MatchEventType, string> = {
  GOAL: "Гол",
  PENALTY_GOAL: "Пенальти",
  OWN_GOAL: "Автогол",
  PENALTY_MISSED: "Промах",
  YELLOW_CARD: "Жёлтая",
  SECOND_YELLOW_CARD: "2-я жёлтая",
  RED_CARD: "Красная",
  SUBSTITUTION: "Замена",
};

type SheetState =
  | { mode: "create"; type: MatchEventType; entryId: number }
  | { mode: "edit"; event: ConsoleEvent }
  | null;

/** Отношение текущего судьи к матчу — свойство зрителя, а не матча. */
export type ConsoleAssignment = {
  assigned: boolean;
  refereeName: string | null;
};

// ───────────────────────────── Консоль ──────────────────────────────────────

export function RefereeConsole({
  match,
  assignment,
}: {
  match: ConsoleMatch;
  assignment: ConsoleAssignment;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  // Минута для новых событий: тикает вместе с часами матча
  const [minute, setMinute] = useState(() => currentMinute(toClock(match)) ?? 1);

  useEffect(() => {
    if (!isClockRunning(match.status)) return;
    const tick = () => setMinute(currentMinute(toClock(match)) ?? 1);
    tick();
    const timer = setInterval(tick, 5_000);
    return () => clearInterval(timer);
  }, [match]);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const live = isLive(match.status);
  const finished = match.status === "FINISHED";

  return (
    <div className="space-y-3 pb-24">
      {/* Чужой матч: предупреждение и возможность взять его на себя */}
      {!assignment.assigned ? (
        <Alert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Вы не назначены судьёй этого матча.{" "}
              {assignment.refereeName ? `Назначен: ${assignment.refereeName}.` : "Судья не назначен."}{" "}
              Вести протокол всё равно можно.
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  assignment.refereeName &&
                  !window.confirm(
                    `Матч ведёт ${assignment.refereeName}. Взять матч себе? Прежний судья попадёт в журнал.`,
                  )
                ) {
                  return;
                }
                run(() => claimMatch(match.id));
              }}
              className={buttonClass("primary", "shrink-0 py-1.5 text-xs")}
            >
              Вести этот матч
            </button>
          </div>
        </Alert>
      ) : null}

      {/* Табло */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-center gap-2 border-b border-border px-4 py-2 text-center text-xs text-muted">
          <span className="truncate">{match.tournamentName}</span>
          {/* Баннер уедет при прокрутке, а эта пометка всегда на виду */}
          {!assignment.assigned ? <Badge tone="warning">Чужой матч</Badge> : null}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4">
          <TeamHeading team={match.home} />
          <div className="text-center">
            <p className="text-4xl font-black tabular-nums">
              {match.homeScore ?? 0}
              <span className="mx-1 text-muted">:</span>
              {match.awayScore ?? 0}
            </p>
            <p
              className={cn(
                "mt-1 text-xs font-semibold",
                live ? "text-live" : "text-muted",
              )}
            >
              {MATCH_STATUS_LABEL[match.status]}
              {live ? ` · ${minute}'` : ""}
            </p>
          </div>
          <TeamHeading team={match.away} />
        </div>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {/* Управление ходом матча */}
      <Card className="p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          Ход матча
        </p>
        <div className="grid grid-cols-2 gap-2">
          {nextStatuses(match.status).map((option) => (
            <button
              key={option.status}
              type="button"
              disabled={pending}
              onClick={() => run(() => setMatchStatus(match.id, option.status))}
              className={buttonClass(option.primary ? "primary" : "outline", "min-h-11")}
            >
              {option.label}
            </button>
          ))}
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer list-none py-1 text-xs text-muted hover:text-fg">
            Другие статусы ▾
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["SCHEDULED", "EXTRA_TIME", "PENALTY_SHOOTOUT", "POSTPONED", "CANCELLED", "WALKOVER"] as const).map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  disabled={pending || status === match.status}
                  onClick={() => run(() => setMatchStatus(match.id, status))}
                  className={buttonClass("secondary", "min-h-10 text-xs")}
                >
                  {MATCH_STATUS_LABEL[status]}
                </button>
              ),
            )}
          </div>
        </details>

        {(match.status === "PENALTY_SHOOTOUT" || match.homeShootoutScore !== null) && (
          <ShootoutEditor match={match} disabled={pending} onSave={run} />
        )}

        <MatchNote match={match} disabled={pending} onSave={run} />

        {assignment.assigned ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Снять себя с этого матча?")) return;
              run(() => releaseMatch(match.id));
            }}
            className="mt-2 text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Снять себя с матча
          </button>
        ) : null}
      </Card>

      {/* Быстрый ввод события */}
      <Card className="p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          Добавить событие
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[match.home, match.away].map((team) => (
            <button
              key={team.entryId}
              type="button"
              onClick={() => setSheet({ mode: "create", type: "GOAL", entryId: team.entryId })}
              className={buttonClass("primary", "min-h-14 flex-col gap-0.5")}
            >
              <span className="text-base">⚽ Гол</span>
              <span className="max-w-full truncate text-xs font-medium opacity-80">
                {team.shortName}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setSheet({ mode: "create", type: "YELLOW_CARD", entryId: match.home.entryId })}
            className={buttonClass("outline", "min-h-11")}
          >
            🟨 Карточка
          </button>
          <button
            type="button"
            onClick={() => setSheet({ mode: "create", type: "SUBSTITUTION", entryId: match.home.entryId })}
            className={buttonClass("outline", "min-h-11")}
          >
            🔁 Замена
          </button>
          <button
            type="button"
            onClick={() => setSheet({ mode: "create", type: "PENALTY_MISSED", entryId: match.home.entryId })}
            className={buttonClass("outline", "min-h-11 text-xs")}
          >
            ✖ Промах пен.
          </button>
        </div>
        {finished ? (
          <p className="mt-2 text-xs text-subtle">
            Матч завершён, но протокол можно дополнять и править — счёт пересчитается сам.
          </p>
        ) : null}
      </Card>

      {/* Хроника */}
      <Card>
        <CardHeader
          title="Протокол"
          subtitle={match.events.length === 0 ? "Событий пока нет" : `${match.events.length} событий`}
        />
        {match.events.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Нажмите «Гол» или другую кнопку выше, чтобы записать первое событие.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {match.events.map((event) => {
              const isHome = event.tournamentTeamId === match.home.entryId;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: "edit", event })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="w-11 shrink-0 text-xs font-semibold text-muted tabular-nums">
                      {formatMinute(event)}
                    </span>
                    <span className="shrink-0 text-base">{EVENT_ICON[event.type]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {event.playerName ?? EVENT_LABEL[event.type]}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {isHome ? match.home.shortName : match.away.shortName}
                        {event.assistName ? ` · пас: ${event.assistName}` : ""}
                        {event.relatedName ? ` · вместо ${event.relatedName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-subtle">изменить</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {sheet ? (
        <EventSheet
          match={match}
          state={sheet}
          defaultMinute={minute}
          pending={pending}
          onClose={() => setSheet(null)}
          onSubmit={(payload, eventId) => {
            run(async () => {
              const result = eventId
                ? await updateMatchEvent(eventId, payload)
                : await addMatchEvent(match.id, payload);
              if (result.ok) setSheet(null);
              return result;
            });
          }}
          onDelete={(eventId) => {
            run(async () => {
              const result = await deleteMatchEvent(eventId);
              if (result.ok) setSheet(null);
              return result;
            });
          }}
        />
      ) : null}
    </div>
  );
}

function toClock(match: ConsoleMatch) {
  return {
    status: match.status,
    periodStartedAt: match.periodStartedAt ? new Date(match.periodStartedAt) : null,
    clockOffsetSec: match.clockOffsetSec,
  };
}

function TeamHeading({ team }: { team: ConsoleTeam }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <TeamCrest team={team} size="lg" />
      <span className="text-xs font-semibold leading-tight">{team.shortName}</span>
    </div>
  );
}

/** Какие кнопки показать судье в текущем состоянии матча. */
function nextStatuses(status: MatchStatus): { status: MatchStatus; label: string; primary?: boolean }[] {
  switch (status) {
    case "SCHEDULED":
      return [{ status: "FIRST_HALF", label: "▶ Начать матч", primary: true }];
    case "FIRST_HALF":
      return [
        { status: "HALF_TIME", label: "⏸ Перерыв", primary: true },
        { status: "FINISHED", label: "⏹ Завершить" },
      ];
    case "HALF_TIME":
      return [
        { status: "SECOND_HALF", label: "▶ Второй тайм", primary: true },
        { status: "FINISHED", label: "⏹ Завершить" },
      ];
    case "SECOND_HALF":
      return [
        { status: "FINISHED", label: "⏹ Завершить матч", primary: true },
        { status: "EXTRA_TIME", label: "＋ Доп. время" },
      ];
    case "EXTRA_TIME":
      return [
        { status: "FINISHED", label: "⏹ Завершить матч", primary: true },
        { status: "PENALTY_SHOOTOUT", label: "Серия пенальти" },
      ];
    case "PENALTY_SHOOTOUT":
      return [{ status: "FINISHED", label: "⏹ Завершить матч", primary: true }];
    case "FINISHED":
      return [{ status: "SECOND_HALF", label: "↩ Вернуть в игру" }];
    default:
      return [{ status: "SCHEDULED", label: "Вернуть в расписание" }];
  }
}

// ───────────────────────────── Комментарий к матчу ──────────────────────────

/**
 * Свободный комментарий: чаще всего — причина переноса. Раскрывается сам,
 * если матч уже помечен перенесённым и причина ещё не написана.
 */
function MatchNote({
  match,
  disabled,
  onSave,
}: {
  match: ConsoleMatch;
  disabled: boolean;
  onSave: (action: () => Promise<ActionResult>) => void;
}) {
  const [note, setNote] = useState(match.notes ?? "");
  const postponed = match.status === "POSTPONED";

  return (
    <details className="mt-2" open={postponed && !match.notes}>
      <summary className="cursor-pointer list-none py-1 text-xs text-muted hover:text-fg">
        Комментарий к матчу {match.notes ? "✓" : ""}▾
      </summary>
      <div className="mt-2">
        {postponed ? (
          <p className="mb-1.5 text-xs text-warning">
            Напишите причину переноса — новую дату назначит организатор.
          </p>
        ) : null}
        <textarea
          value={note}
          maxLength={300}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Например: поле залито дождём, команда не явилась"
          className={cn(inputClass, "text-sm")}
        />
        <button
          type="button"
          disabled={disabled || note === (match.notes ?? "")}
          onClick={() => onSave(() => setMatchNote(match.id, note))}
          className={buttonClass("secondary", "mt-2 py-1.5 text-xs")}
        >
          Сохранить комментарий
        </button>
      </div>
    </details>
  );
}

// ───────────────────────────── Серия пенальти ───────────────────────────────

function ShootoutEditor({
  match,
  disabled,
  onSave,
}: {
  match: ConsoleMatch;
  disabled: boolean;
  onSave: (action: () => Promise<ActionResult>) => void;
}) {
  const [home, setHome] = useState(match.homeShootoutScore ?? 0);
  const [away, setAway] = useState(match.awayShootoutScore ?? 0);

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
      <p className="mb-2 text-xs font-semibold text-muted">Серия пенальти</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={home}
          onChange={(e) => setHome(Number(e.target.value))}
          className={cn(inputClass, "w-16 text-center")}
          aria-label={`Пенальти ${match.home.shortName}`}
        />
        <span className="text-muted">:</span>
        <input
          type="number"
          min={0}
          value={away}
          onChange={(e) => setAway(Number(e.target.value))}
          className={cn(inputClass, "w-16 text-center")}
          aria-label={`Пенальти ${match.away.shortName}`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(() => setShootoutScore(match.id, { home, away }))}
          className={buttonClass("secondary", "ml-auto")}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── Форма события ────────────────────────────────

type EventPayload = {
  type: MatchEventType;
  tournamentTeamId: number;
  minute: number;
  extraMinute: number | null;
  playerId: number | null;
  assistPlayerId: number | null;
  relatedPlayerId: number | null;
};

function EventSheet({
  match,
  state,
  defaultMinute,
  pending,
  onClose,
  onSubmit,
  onDelete,
}: {
  match: ConsoleMatch;
  state: NonNullable<SheetState>;
  defaultMinute: number;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: EventPayload, eventId?: number) => void;
  onDelete: (eventId: number) => void;
}) {
  const editing = state.mode === "edit" ? state.event : null;

  const [type, setType] = useState<MatchEventType>(
    editing ? editing.type : state.mode === "create" ? state.type : "GOAL",
  );
  const [entryId, setEntryId] = useState<number>(
    editing ? editing.tournamentTeamId : state.mode === "create" ? state.entryId : match.home.entryId,
  );
  const [minute, setMinute] = useState<number>(editing ? editing.minute : defaultMinute);
  const [extraMinute, setExtraMinute] = useState<number>(editing?.extraMinute ?? 0);
  const [playerId, setPlayerId] = useState<number | null>(editing?.playerId ?? null);
  const [assistId, setAssistId] = useState<number | null>(editing?.assistPlayerId ?? null);
  const [relatedId, setRelatedId] = useState<number | null>(editing?.relatedPlayerId ?? null);

  const team = entryId === match.home.entryId ? match.home : match.away;

  // Автогол записывается на команду, ЗА которую заявлен игрок,
  // а засчитывается сопернику — поэтому при выборе меняем список игроков.
  const roster = team.roster;

  const onPitch = useMemo(() => roster.filter((p) => p.onPitch), [roster]);
  const bench = useMemo(() => roster.filter((p) => !p.onPitch), [roster]);

  const needsAssist = type === "GOAL" || type === "PENALTY_GOAL";
  const isSub = type === "SUBSTITUTION";

  function switchTeam(nextEntryId: number) {
    if (nextEntryId === entryId) return;
    setEntryId(nextEntryId);
    setPlayerId(null);
    setAssistId(null);
    setRelatedId(null);
  }

  function submit() {
    onSubmit(
      {
        type,
        tournamentTeamId: entryId,
        minute,
        extraMinute: extraMinute > 0 ? extraMinute : null,
        playerId,
        assistPlayerId: needsAssist ? assistId : null,
        relatedPlayerId: isSub ? relatedId : null,
      },
      editing?.id,
    );
  }

  const canSubmit = isSub ? playerId !== null && relatedId !== null : playerId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">
            {editing ? "Изменить событие" : "Новое событие"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2"
          >
            Закрыть
          </button>
        </div>

        {/* Тип события */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                type === option ? "bg-brand text-brand-fg" : "bg-surface-3 text-muted hover:text-fg",
              )}
            >
              {EVENT_ICON[option]} {SHORT_EVENT_LABEL[option]}
            </button>
          ))}
        </div>

        {/* Команда */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[match.home, match.away].map((option) => (
            <button
              key={option.entryId}
              type="button"
              onClick={() => switchTeam(option.entryId)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors",
                entryId === option.entryId
                  ? "bg-brand text-brand-fg"
                  : "bg-surface-3 text-muted hover:text-fg",
              )}
            >
              <TeamCrest team={option} size="sm" />
              <span className="truncate">{option.shortName}</span>
            </button>
          ))}
        </div>
        {type === "OWN_GOAL" ? (
          <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            Выберите команду игрока, забившего в свои ворота. Гол засчитается сопернику.
          </p>
        ) : null}

        {/* Минута */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Минута</span>
          <button
            type="button"
            onClick={() => setMinute((m) => Math.max(0, m - 1))}
            className={buttonClass("secondary", "size-10 p-0 text-lg")}
            aria-label="Минус минута"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={150}
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className={cn(inputClass, "w-16 text-center text-base font-bold")}
            aria-label="Минута события"
          />
          <button
            type="button"
            onClick={() => setMinute((m) => Math.min(150, m + 1))}
            className={buttonClass("secondary", "size-10 p-0 text-lg")}
            aria-label="Плюс минута"
          >
            +
          </button>
          <span className="ml-1 text-xs text-muted">+доп.</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={30}
            value={extraMinute}
            onChange={(e) => setExtraMinute(Number(e.target.value))}
            className={cn(inputClass, "w-14 text-center")}
            aria-label="Добавленное время"
          />
        </div>

        {/* Основной игрок */}
        <PlayerPicker
          label={
            isSub ? "Кто вышел на поле" : type === "OWN_GOAL" ? "Забил в свои ворота" : "Игрок"
          }
          players={isSub ? bench : roster}
          selectedId={playerId}
          onSelect={setPlayerId}
        />

        {isSub ? (
          <PlayerPicker
            label="Кого заменили"
            players={onPitch.filter((p) => p.id !== playerId)}
            selectedId={relatedId}
            onSelect={setRelatedId}
          />
        ) : null}

        {needsAssist ? (
          <PlayerPicker
            label="Голевая передача"
            players={roster.filter((p) => p.id !== playerId)}
            selectedId={assistId}
            onSelect={setAssistId}
            allowNone
            noneLabel="Без паса"
          />
        ) : null}

        <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-border bg-surface px-4 pb-1 pt-3">
          {editing ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(editing.id)}
              className={buttonClass("danger", "px-3")}
            >
              Удалить
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || !canSubmit}
            onClick={submit}
            className={buttonClass("primary", "flex-1 min-h-12 text-base")}
          >
            {pending ? "Сохраняем…" : editing ? "Сохранить" : "Записать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerPicker({
  label,
  players,
  selectedId,
  onSelect,
  allowNone,
  noneLabel,
}: {
  label: string;
  players: ConsoleRoster[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {players.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-3 py-3 text-xs text-muted">
          Нет доступных игроков. Заполните заявку команды или состав на матч.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {allowNone ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={cn(
                "min-h-11 rounded-lg px-2 text-xs font-semibold transition-colors",
                selectedId === null
                  ? "bg-brand text-brand-fg"
                  : "bg-surface-3 text-muted hover:text-fg",
              )}
            >
              {noneLabel ?? "Не выбрано"}
            </button>
          ) : null}
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player.id)}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-medium transition-colors",
                selectedId === player.id
                  ? "bg-brand text-brand-fg"
                  : "bg-surface-3 text-fg hover:bg-border",
              )}
            >
              <span className="w-5 shrink-0 text-right tabular-nums opacity-70">
                {player.shirtNumber ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate">{player.name}</span>
              {player.position ? (
                <span className="shrink-0 text-[10px] opacity-60">
                  {POSITION_SHORT[player.position]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
