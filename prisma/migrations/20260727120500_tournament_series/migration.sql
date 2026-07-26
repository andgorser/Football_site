-- Серия турниров: связывает сезоны одного турнира в одну историю.
-- Сам сезон остаётся отдельным Tournament — у него свой состав и регламент.

CREATE TABLE "TournamentSeries" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentSeries_slug_key" ON "TournamentSeries"("slug");

ALTER TABLE "Tournament" ADD COLUMN "seriesId" INTEGER;

CREATE INDEX "Tournament_seriesId_idx" ON "Tournament"("seriesId");

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "TournamentSeries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Разбираем то, что уже есть: одно название турнира = одна серия.
-- Для сезонов одного турнира это верно — отличаются season и slug, а имя
-- повторяется дословно. Если турнир между годами переименовывали, получатся
-- две серии; они объединяются вручную выбором серии в форме турнира.
--
-- Адрес серии берём из адреса самого раннего турнира, отрезая хвост с годом:
-- «chempionat-mgu-2025» → «chempionat-mgu».
INSERT INTO "TournamentSeries" ("slug", "name", "createdAt", "updatedAt")
SELECT COALESCE(NULLIF(regexp_replace(t.first_slug, '(-[0-9]+)+$', ''), ''),
                'seriya-' || t.min_id),
       t.name,
       now(),
       now()
FROM (
  SELECT "name",
         (array_agg("slug" ORDER BY "startDate", "id"))[1] AS first_slug,
         min("id") AS min_id
  FROM "Tournament"
  GROUP BY "name"
) t
-- Страховка: два разных названия могли дать один адрес. Такая серия просто
-- не создастся, а её турниры подхватит кнопка «Разложить по сериям».
ON CONFLICT ("slug") DO NOTHING;

UPDATE "Tournament" t
SET "seriesId" = s."id"
FROM "TournamentSeries" s
WHERE t."seriesId" IS NULL AND s."name" = t."name";
