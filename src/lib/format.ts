// Всё время на сайте показывается по Москве — независимо от того, где стоит
// сервер и какой часовой пояс у зрителя. Это заодно избавляет от расхождений
// между серверным и клиентским рендерингом (hydration mismatch).

export const TIME_ZONE = "Europe/Moscow";

/** Москва — UTC+3 круглый год (переход на летнее время отменён в 2014). */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const shortDateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
});

const dayMonthFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: TIME_ZONE,
});

const weekdayFmt = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  timeZone: TIME_ZONE,
});

const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export function formatDate(date: Date): string {
  return dateFmt.format(date);
}

export function formatShortDate(date: Date): string {
  return shortDateFmt.format(date);
}

export function formatDayMonth(date: Date): string {
  return dayMonthFmt.format(date);
}

export function formatWeekday(date: Date): string {
  return weekdayFmt.format(date);
}

export function formatTime(date: Date): string {
  return timeFmt.format(date);
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/** Ключ дня по московскому времени: "2026-03-14". Годится для группировки. */
export function moscowDayKey(date: Date): string {
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Границы московских суток по ключу «2026-03-14» — для выборок из базы. */
export function moscowDayRange(dayKey: string): { from: Date; to: Date } {
  const from = new Date(Date.parse(`${dayKey}T00:00:00.000Z`) - MSK_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

/** Сдвиг дня в ключе: shiftDayKey("2026-03-14", -1) → "2026-03-13". */
export function shiftDayKey(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** «Сегодня» / «Завтра» / «Вчера» / «14 марта, суббота» */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const key = moscowDayKey(date);
  const today = moscowDayKey(now);
  const tomorrow = moscowDayKey(new Date(now.getTime() + 86_400_000));
  const yesterday = moscowDayKey(new Date(now.getTime() - 86_400_000));

  if (key === today) return "Сегодня";
  if (key === tomorrow) return "Завтра";
  if (key === yesterday) return "Вчера";
  return `${formatDayMonth(date)}, ${formatWeekday(date)}`;
}

/** Дата в значение для <input type="datetime-local"> по московскому времени. */
export function toDateTimeInput(date: Date): string {
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 16);
}

/** Дата в значение для <input type="date"> по московскому времени. */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Обратное преобразование: «2026-03-14T19:00» по Москве → настоящий момент времени. */
export function fromDateTimeInput(value: string): Date {
  return new Date(Date.parse(`${value}:00.000Z`) - MSK_OFFSET_MS);
}

/** «2003-05-17» → полночь по Москве. */
export function fromDateInput(value: string): Date {
  return new Date(Date.parse(`${value}T00:00:00.000Z`) - MSK_OFFSET_MS);
}

/** Правильное склонение: 1 матч, 2 матча, 5 матчей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}
