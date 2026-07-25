-- Ограничения целостности, которые нельзя выразить в schema.prisma.
-- Они защищают базу от бессмысленных данных даже при прямой правке через psql.

-- Команда не может играть сама с собой
ALTER TABLE "Match"
  ADD CONSTRAINT "Match_teams_differ" CHECK ("homeTeamId" <> "awayTeamId");

-- Счёт не может быть отрицательным
ALTER TABLE "Match"
  ADD CONSTRAINT "Match_scores_non_negative" CHECK (
    ("homeScore" IS NULL OR "homeScore" >= 0) AND
    ("awayScore" IS NULL OR "awayScore" >= 0) AND
    ("homeShootoutScore" IS NULL OR "homeShootoutScore" >= 0) AND
    ("awayShootoutScore" IS NULL OR "awayShootoutScore" >= 0)
  );

-- Минута события: 0 (до стартового свистка не бывает) .. 150 (с учётом овертайма)
ALTER TABLE "MatchEvent"
  ADD CONSTRAINT "MatchEvent_minute_range" CHECK ("minute" BETWEEN 0 AND 150);

ALTER TABLE "MatchEvent"
  ADD CONSTRAINT "MatchEvent_extra_minute_range" CHECK (
    "extraMinute" IS NULL OR "extraMinute" BETWEEN 0 AND 30
  );

-- Игрок не может ассистировать сам себе
ALTER TABLE "MatchEvent"
  ADD CONSTRAINT "MatchEvent_assist_differs" CHECK (
    "assistPlayerId" IS NULL OR "playerId" IS NULL OR "assistPlayerId" <> "playerId"
  );

-- Замена: вышедший и ушедший — разные игроки
ALTER TABLE "MatchEvent"
  ADD CONSTRAINT "MatchEvent_sub_players_differ" CHECK (
    "relatedPlayerId" IS NULL OR "playerId" IS NULL OR "relatedPlayerId" <> "playerId"
  );

-- Игровой номер в пределах разумного
ALTER TABLE "RosterEntry"
  ADD CONSTRAINT "RosterEntry_shirt_number_range" CHECK (
    "shirtNumber" IS NULL OR "shirtNumber" BETWEEN 1 AND 99
  );

-- Регламент турнира
ALTER TABLE "Tournament"
  ADD CONSTRAINT "Tournament_half_duration_range" CHECK ("halfDurationMin" BETWEEN 5 AND 60);

ALTER TABLE "Tournament"
  ADD CONSTRAINT "Tournament_dates_order" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
