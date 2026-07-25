-- Сетка плей-офф: матч можно создать заранее, указав вместо команды источник
-- участника — «1-е место дивизиона А» или «победитель матча №12».

-- 1. Команды становятся необязательными: до определения источника участника нет.
ALTER TABLE "Match" ALTER COLUMN "homeTeamId" DROP NOT NULL;
ALTER TABLE "Match" ALTER COLUMN "awayTeamId" DROP NOT NULL;

-- 2. Тип источника
CREATE TYPE "MatchSlotSource" AS ENUM ('TEAM', 'DIVISION_PLACE', 'MATCH_WINNER', 'MATCH_LOSER');

-- 3. Новые колонки. DEFAULT 'TEAM' делает все существующие матчи корректными,
--    поэтому переносить данные не нужно.
ALTER TABLE "Match"
  ADD COLUMN "bracketOrder"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "homeSource"           "MatchSlotSource" NOT NULL DEFAULT 'TEAM',
  ADD COLUMN "homeSourceDivisionId" INTEGER,
  ADD COLUMN "homeSourcePlace"      INTEGER,
  ADD COLUMN "homeSourceMatchId"    INTEGER,
  ADD COLUMN "homeSourceLabel"      TEXT,
  ADD COLUMN "awaySource"           "MatchSlotSource" NOT NULL DEFAULT 'TEAM',
  ADD COLUMN "awaySourceDivisionId" INTEGER,
  ADD COLUMN "awaySourcePlace"      INTEGER,
  ADD COLUMN "awaySourceMatchId"    INTEGER,
  ADD COLUMN "awaySourceLabel"      TEXT;

-- 4. Внешние ключи
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeSourceDivisionId_fkey"
  FOREIGN KEY ("homeSourceDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_awaySourceDivisionId_fkey"
  FOREIGN KEY ("awaySourceDivisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeSourceMatchId_fkey"
  FOREIGN KEY ("homeSourceMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_awaySourceMatchId_fkey"
  FOREIGN KEY ("awaySourceMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Индексы
CREATE INDEX "Match_tournamentId_stage_bracketOrder_idx" ON "Match"("tournamentId", "stage", "bracketOrder");
CREATE INDEX "Match_homeSourceMatchId_idx" ON "Match"("homeSourceMatchId");
CREATE INDEX "Match_awaySourceMatchId_idx" ON "Match"("awaySourceMatchId");

-- 6. Целостность.
--    Старое ограничение на NULL не срабатывало бы (NULL <> 5 даёт NULL, а CHECK
--    нарушается только на FALSE), поэтому переписываем его явно и возвращаем
--    потерянную гарантию NOT NULL всем матчам с прямым назначением команды.
ALTER TABLE "Match" DROP CONSTRAINT "Match_teams_differ";
ALTER TABLE "Match" ADD CONSTRAINT "Match_teams_differ" CHECK (
  "homeTeamId" IS NULL OR "awayTeamId" IS NULL OR "homeTeamId" <> "awayTeamId"
);

ALTER TABLE "Match" ADD CONSTRAINT "Match_team_source_filled" CHECK (
  ("homeSource" <> 'TEAM' OR "homeTeamId" IS NOT NULL) AND
  ("awaySource" <> 'TEAM' OR "awayTeamId" IS NOT NULL)
);

-- У каждого типа источника должны быть заполнены свои поля
ALTER TABLE "Match" ADD CONSTRAINT "Match_source_fields_valid" CHECK (
  ("homeSource" <> 'DIVISION_PLACE' OR ("homeSourceDivisionId" IS NOT NULL AND "homeSourcePlace" >= 1)) AND
  ("awaySource" <> 'DIVISION_PLACE' OR ("awaySourceDivisionId" IS NOT NULL AND "awaySourcePlace" >= 1)) AND
  ("homeSource" NOT IN ('MATCH_WINNER', 'MATCH_LOSER') OR "homeSourceMatchId" IS NOT NULL) AND
  ("awaySource" NOT IN ('MATCH_WINNER', 'MATCH_LOSER') OR "awaySourceMatchId" IS NOT NULL)
);

-- Матч не может быть источником сам для себя. Более длинные циклы
-- (A → B → A) ограничением не выразить — их ловит серверное действие.
ALTER TABLE "Match" ADD CONSTRAINT "Match_source_not_self" CHECK (
  ("homeSourceMatchId" IS NULL OR "homeSourceMatchId" <> "id") AND
  ("awaySourceMatchId" IS NULL OR "awaySourceMatchId" <> "id")
);
