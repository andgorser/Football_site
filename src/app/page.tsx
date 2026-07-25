import Link from "next/link";

import { MatchList } from "@/components/MatchRow";
import { Card, CardHeader, EmptyState, LiveBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  formatDayLabel,
  formatDayMonth,
  formatWeekday,
  moscowDayKey,
  moscowDayRange,
  shiftDayKey,
} from "@/lib/format";
import { findLiveMatches, findMatchesBetween, type MatchCard } from "@/lib/queries";

// Матчи меняются часто: перечитываем данные при каждом заходе.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const now = new Date();
  const today = moscowDayKey(now);
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : today;

  const { from, to } = moscowDayRange(selectedDay);
  const [live, dayMatches] = await Promise.all([
    findLiveMatches(),
    findMatchesBetween(from, to),
  ]);

  // Группируем матчи дня по турниру и дивизиону — так же, как это делают
  // спортивные сайты: сначала лига, внутри неё список игр.
  const groups = new Map<string, { title: string; href: string; matches: MatchCard[] }>();
  for (const match of dayMatches) {
    const key = `${match.tournament.id}:${match.division?.id ?? 0}`;
    if (!groups.has(key)) {
      groups.set(key, {
        title: match.division
          ? `${match.tournament.name} · ${match.division.name}`
          : match.tournament.name,
        href: `/tournaments/${match.tournament.slug}`,
        matches: [],
      });
    }
    groups.get(key)!.matches.push(match);
  }

  const liveOnOtherDays = live.filter(
    (m) => moscowDayKey(m.kickoffAt) !== selectedDay,
  );

  return (
    <div className="space-y-4">
      <DayStrip selectedDay={selectedDay} today={today} />

      {liveOnOtherDays.length > 0 ? (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2">Идут сейчас <LiveBadge /></span>} />
          <MatchList matches={liveOnOtherDays} showTournament />
        </Card>
      ) : null}

      {groups.size === 0 ? (
        <Card>
          <EmptyState
            title={`${formatDayLabel(from, now)} матчей нет`}
            hint="Выберите другой день или загляните в расписание турнира."
          />
        </Card>
      ) : (
        [...groups.values()].map((group) => (
          <Card key={group.title}>
            <CardHeader
              title={group.title}
              action={
                <Link href={group.href} className="text-brand hover:underline">
                  Турнир
                </Link>
              }
            />
            <MatchList matches={group.matches} />
          </Card>
        ))
      )}
    </div>
  );
}

/** Лента дней вокруг выбранной даты. */
function DayStrip({ selectedDay, today }: { selectedDay: string; today: string }) {
  const days = Array.from({ length: 9 }, (_, i) => shiftDayKey(selectedDay, i - 4));

  return (
    <div className="no-scrollbar flex items-stretch gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5">
      {days.map((day) => {
        const { from } = moscowDayRange(day);
        const isSelected = day === selectedDay;
        const isToday = day === today;
        return (
          <Link
            key={day}
            href={day === today ? "/" : `/?date=${day}`}
            className={cn(
              "flex min-w-[4.5rem] flex-1 shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-center transition-colors",
              isSelected ? "bg-brand text-brand-fg" : "hover:bg-surface-2",
            )}
          >
            <span
              className={cn(
                "text-[11px] capitalize",
                isSelected ? "opacity-80" : isToday ? "font-semibold text-brand" : "text-subtle",
              )}
            >
              {isToday ? "Сегодня" : formatWeekday(from).slice(0, 2)}
            </span>
            <span className={cn("text-sm font-semibold", !isSelected && "text-fg")}>
              {formatDayMonth(from).replace(/\s.*/, "")}
              <span className="ml-1 text-xs font-normal opacity-70">
                {formatDayMonth(from).split(" ")[1]?.slice(0, 3)}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
