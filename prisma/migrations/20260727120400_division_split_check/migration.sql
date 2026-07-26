-- Дивизион не может быть предком сам себе. Длинные циклы (A → B → A) таким
-- ограничением не выразить — их ловит ограничение глубины при расчёте таблицы.
ALTER TABLE "Division"
  ADD CONSTRAINT "Division_parent_not_self"
  CHECK ("parentDivisionId" IS NULL OR "parentDivisionId" <> "id");
