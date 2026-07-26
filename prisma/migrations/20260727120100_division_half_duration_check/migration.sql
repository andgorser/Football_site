-- Границы те же, что у турнира (см. 20250101000001_add_check_constraints):
-- тайм короче 5 минут или длиннее часа — заведомо опечатка.
-- NULL разрешён и означает «как в турнире».
ALTER TABLE "Division"
  ADD CONSTRAINT "Division_half_duration_range" CHECK (
    "halfDurationMin" IS NULL OR "halfDurationMin" BETWEEN 5 AND 60
  );
