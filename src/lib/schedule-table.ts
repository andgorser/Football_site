/**
 * Разбор расписания, скопированного из Excel или Google-таблицы.
 *
 * Организаторы согласуют время и поля в таблицах, а не на сайте, поэтому
 * основной путь наполнения расписания — «скопировал диапазон, вставил сюда».
 *
 * Файл намеренно чистый: ни базы, ни `server-only`. Одни и те же функции
 * крутятся в браузере (мгновенный предпросмотр) и на сервере (запись), так что
 * предпросмотр и результат физически не могут разойтись.
 */

/** Колонки, которые мы понимаем. Порядок здесь = порядок при выгрузке. */
export type ScheduleColumn =
  | "round"
  | "date"
  | "time"
  | "home"
  | "away"
  | "venue"
  | "referee"
  | "division"
  | "notes";

/** Заголовки при выгрузке — их же организатор увидит в своей таблице. */
export const COLUMN_TITLE: Record<ScheduleColumn, string> = {
  round: "Тур",
  date: "Дата",
  time: "Время",
  home: "Хозяева",
  away: "Гости",
  venue: "Поле",
  referee: "Судья",
  division: "Дивизион",
  notes: "Примечание",
};

/**
 * Синонимы заголовков. В живых таблицах колонку называют как придётся,
 * а заставлять организатора переименовывать шапку — верный способ не получить
 * ни одного импорта.
 */
const COLUMN_SYNONYMS: Record<ScheduleColumn, string[]> = {
  round: ["тур", "номер тура", "round", "неделя"],
  date: ["дата", "date", "день"],
  time: ["время", "time", "начало", "нач"],
  home: ["хозяева", "дома", "команда 1", "команда1", "home", "первая команда", "хозяин"],
  away: ["гости", "в гостях", "команда 2", "команда2", "away", "вторая команда", "гость"],
  venue: ["поле", "площадка", "стадион", "место", "venue"],
  referee: ["судья", "арбитр", "referee"],
  division: ["дивизион", "группа", "division"],
  notes: ["примечание", "комментарий", "заметка", "notes"],
};

/** Пометки «времени пока нет» — их пишут в таблицах вместо пустой ячейки. */
const TBD_MARKERS = ["?", "??", "-", "—", "–", "тбд", "уточняется", "уточн", "tbd", "н/д"];

export type ParsedRow = {
  /** Номер строки в исходном тексте — чтобы ошибка указывала на строку таблицы */
  line: number;
  round: number | null;
  /** Московская дата в виде «2026-03-14» */
  date: string | null;
  /** «19:00» либо null — время уточняется */
  time: string | null;
  home: string;
  away: string;
  venue: string | null;
  referee: string | null;
  division: string | null;
  notes: string | null;
  errors: string[];
  warnings: string[];
};

export type ParsedTable = {
  /** Какая колонка таблицы под каким номером найдена */
  columns: Partial<Record<ScheduleColumn, number>>;
  rows: ParsedRow[];
  /** Ошибки самой таблицы (не строки): не нашли шапку и т.п. */
  errors: string[];
};

// ───────────────────────────── Разбор текста ────────────────────────────────

/** Приводит написание к сравнимому виду: регистр, ё, неразрывные пробелы, тире. */
export function normalizeName(value: string): string {
  return value
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

/**
 * Разделитель определяем по шапке: copy-paste из Excel и Google-таблиц даёт
 * табуляцию, выгрузка в файл — точку с запятой или запятую.
 */
function detectDelimiter(headerLine: string): string {
  const counts: Array<[string, number]> = [
    ["\t", (headerLine.match(/\t/g) ?? []).length],
    [";", (headerLine.match(/;/g) ?? []).length],
    [",", (headerLine.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : "\t";
}

/** Разбор строки с минимальной поддержкой кавычек — Excel так экранирует. */
function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.replace(/ /g, " ").trim());
}

/** Ищет в шапке знакомые названия колонок. */
function detectColumns(cells: string[]): Partial<Record<ScheduleColumn, number>> {
  const columns: Partial<Record<ScheduleColumn, number>> = {};
  cells.forEach((cell, index) => {
    const normalized = normalizeName(cell);
    if (!normalized) return;
    for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS) as [ScheduleColumn, string[]][]) {
      if (columns[key] !== undefined) continue;
      if (synonyms.some((s) => normalizeName(s) === normalized)) {
        columns[key] = index;
        return;
      }
    }
  });
  return columns;
}

/**
 * Дата в московском календаре. Понимает 14.03.2026, 14.03.26, 14.03,
 * 2026-03-14, «14.03.2026 0:00» (Excel любит дописывать время) и серийный
 * номер Excel вроде 46091.
 */
export function parseRuDate(
  raw: string,
  defaultYear: number,
): { date: string | null; warning?: string; error?: string } {
  const value = raw.trim();
  if (!value) return { date: null };

  // Excel отдал дату числом: дней от 30.12.1899
  if (/^\d{5}$/.test(value)) {
    const serial = Number(value);
    const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
    return {
      date: new Date(ms).toISOString().slice(0, 10),
      warning: "дата пришла числом Excel — проверьте, что день верный",
    };
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}` };

  const ru = value.match(/^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/);
  if (!ru) return { date: null, error: `не понял дату «${raw}»` };

  const day = Number(ru[1]);
  const month = Number(ru[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { date: null, error: `не понял дату «${raw}»` };
  }

  let year = defaultYear;
  let warning: string | undefined;
  if (ru[3]) {
    const parsed = Number(ru[3]);
    year = parsed < 100 ? 2000 + parsed : parsed;
  } else {
    // Сезон переходит через новый год, поэтому «14.03» без года — риск
    warning = `год не указан, подставлен ${defaultYear}`;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${year}-${pad(month)}-${pad(day)}`, warning };
}

/** «19:00», «19.00», «19:00:00», «9:00». Пустое или пометка — время уточняется. */
export function parseRuTime(raw: string): { time: string | null; error?: string } {
  const value = raw.trim();
  if (!value) return { time: null };
  if (TBD_MARKERS.includes(normalizeName(value))) return { time: null };

  const match = value.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match) return { time: null, error: `не понял время «${raw}»` };

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return { time: null, error: `не понял время «${raw}»` };

  return { time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
}

/**
 * Разбирает вставленную таблицу. Ошибки не бросаются: каждая строка несёт
 * свои — организатор должен увидеть их все сразу, а не по одной.
 */
export function parseScheduleTable(
  text: string,
  options: { defaultYear: number },
): ParsedTable {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) return { columns: {}, rows: [], errors: ["Пусто — вставьте таблицу"] };

  const delimiter = detectDelimiter(lines[0]);
  const columns = detectColumns(splitRow(lines[0], delimiter));

  const missing: string[] = [];
  if (columns.home === undefined) missing.push(COLUMN_TITLE.home);
  if (columns.away === undefined) missing.push(COLUMN_TITLE.away);
  if (missing.length > 0) {
    return {
      columns,
      rows: [],
      errors: [
        `В первой строке не нашлись колонки: ${missing.join(", ")}. Первая строка должна быть заголовком таблицы.`,
      ],
    };
  }

  const cellAt = (cells: string[], key: ScheduleColumn): string => {
    const index = columns[key];
    return index === undefined ? "" : (cells[index] ?? "");
  };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter);
    const errors: string[] = [];
    const warnings: string[] = [];

    const home = cellAt(cells, "home");
    const away = cellAt(cells, "away");
    if (!home || !away) {
      // Пустая строка-разделитель между турами — обычное дело, не ошибка
      if (cells.every((cell) => cell === "")) continue;
      errors.push("не указаны обе команды");
    }

    const roundRaw = cellAt(cells, "round").replace(/[^\d]/g, "");
    const round = roundRaw ? Number(roundRaw) : null;
    if (round !== null && (round < 1 || round > 60)) errors.push(`странный номер тура «${roundRaw}»`);

    const parsedDate = parseRuDate(cellAt(cells, "date"), options.defaultYear);
    if (parsedDate.error) errors.push(parsedDate.error);
    if (parsedDate.warning) warnings.push(parsedDate.warning);

    const parsedTime = parseRuTime(cellAt(cells, "time"));
    if (parsedTime.error) errors.push(parsedTime.error);

    rows.push({
      line: i + 1,
      round,
      date: parsedDate.date,
      time: parsedTime.time,
      home,
      away,
      venue: cellAt(cells, "venue") || null,
      referee: cellAt(cells, "referee") || null,
      division: cellAt(cells, "division") || null,
      notes: cellAt(cells, "notes") || null,
      errors,
      warnings,
    });
  }

  return { columns, rows, errors: rows.length === 0 ? ["В таблице нет строк с матчами"] : [] };
}

// ───────────────────────────── Сопоставление команд ─────────────────────────

export type TeamOption = { id: number; name: string; shortName: string; slug: string };

export type NameMatch =
  | { kind: "exact"; id: number }
  /** Совпало по началу строки и вариант единственный — но стоит показать */
  | { kind: "partial"; id: number }
  | { kind: "ambiguous"; candidates: TeamOption[] }
  | { kind: "none"; suggestions: TeamOption[] };

/** Расстояние Левенштейна — только чтобы подсказать похожие названия. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        corner + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      corner = prev[j];
      prev[j] = value;
    }
  }
  return prev[b.length];
}

/**
 * Ищет команду турнира по названию из таблицы.
 *
 * Опечатка НИКОГДА не привязывается сама: `Team.name` и `shortName` в схеме
 * не уникальны, поэтому «похоже» — это повод показать варианты, а не молча
 * поставить не ту команду в расписание.
 */
export function matchTeamName(raw: string, options: TeamOption[]): NameMatch {
  const needle = normalizeName(raw);
  if (!needle) return { kind: "none", suggestions: [] };

  const exact = options.filter((option) =>
    [option.name, option.shortName, option.slug].some((value) => normalizeName(value) === needle),
  );
  if (exact.length === 1) return { kind: "exact", id: exact[0].id };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const partial = options.filter((option) =>
    [option.name, option.shortName].some((value) => {
      const normalized = normalizeName(value);
      return normalized.startsWith(needle) || needle.startsWith(normalized);
    }),
  );
  if (partial.length === 1) return { kind: "partial", id: partial[0].id };
  if (partial.length > 1) return { kind: "ambiguous", candidates: partial };

  const suggestions = [...options]
    .map((option) => ({
      option,
      score: Math.min(distance(needle, normalizeName(option.name)), distance(needle, normalizeName(option.shortName))),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .filter((item) => item.score <= Math.max(3, Math.floor(needle.length / 2)))
    .map((item) => item.option);

  return { kind: "none", suggestions };
}

// ───────────────────────────── Выгрузка ─────────────────────────────────────

export type ScheduleExportRow = {
  round: number | null;
  /** Московская дата «2026-03-14» */
  date: string;
  /** «19:00» либо null, если время ещё уточняется */
  time: string | null;
  home: string;
  away: string;
  venue: string | null;
  referee: string | null;
  division: string | null;
  notes: string | null;
};

const EXPORT_COLUMNS: ScheduleColumn[] = [
  "round",
  "date",
  "time",
  "home",
  "away",
  "venue",
  "referee",
  "division",
  "notes",
];

/** Дата в привычном для таблиц виде: «14.03.2026». */
function toRuDate(isoDay: string): string {
  const [year, month, day] = isoDay.split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Собирает таблицу тем же форматом, который понимает парсер.
 *
 * Это и обратный путь «поправил в экселе — вставил назад», и лучшая
 * документация формата: организатор получает образец со своими командами.
 */
export function buildScheduleTable(rows: ScheduleExportRow[]): string {
  const lines = [EXPORT_COLUMNS.map((key) => COLUMN_TITLE[key]).join("\t")];

  for (const row of rows) {
    lines.push(
      [
        row.round ?? "",
        toRuDate(row.date),
        row.time ?? "",
        row.home,
        row.away,
        row.venue ?? "",
        row.referee ?? "",
        row.division ?? "",
        row.notes ?? "",
      ]
        // Табуляция внутри ячейки разрушила бы таблицу
        .map((cell) => String(cell).replace(/\t/g, " "))
        .join("\t"),
    );
  }

  return lines.join("\n");
}
