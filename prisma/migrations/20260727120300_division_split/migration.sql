-- Разделение дивизиона по итогам кругового этапа.
--
-- «Верхняя половина» и «Нижняя половина» ссылаются на дивизион первого этапа,
-- из которого им переносятся очки и статистика. Сам перенос нигде не хранится:
-- он считается на лету из матчей предка — как и весь остальной счёт в проекте.
--
-- SET NULL, а не RESTRICT: удаление турнира сносит его дивизионы каскадом,
-- и запрет на самоссылку уронил бы этот каскад. От случайной потери связи
-- защищает проверка в действии удаления дивизиона.
ALTER TABLE "Division" ADD COLUMN "parentDivisionId" INTEGER;

CREATE INDEX "Division_parentDivisionId_idx" ON "Division"("parentDivisionId");

ALTER TABLE "Division" ADD CONSTRAINT "Division_parentDivisionId_fkey"
  FOREIGN KEY ("parentDivisionId") REFERENCES "Division"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
