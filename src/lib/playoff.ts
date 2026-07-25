import type { MatchSlotSource, MatchStage } from "@prisma/client";

import { MATCH_STAGE_LABEL } from "@/lib/football";

// Чистые функции сетки плей-офф: подписи слотов и порядок матчей.
// Обращений к базе здесь нет, поэтому их можно звать и в браузере —
// организатор видит подпись слота ещё до сохранения формы.

/** Описание одной стороны матча плей-офф. */
export type SlotDescriptor = {
  source: MatchSlotSource;
  divisionName?: string | null;
  place?: number | null;
  sourceMatchId?: number | null;
  sourceMatchStage?: MatchStage | null;
  label?: string | null;
};

const PLACE_LABEL: Record<number, string> = {
  1: "1-е место",
  2: "2-е место",
  3: "3-е место",
  4: "4-е место",
  5: "5-е место",
  6: "6-е место",
};

function placeLabel(place: number): string {
  return PLACE_LABEL[place] ?? `${place}-е место`;
}

/**
 * Человекочитаемая подпись слота: именно её видит болельщик, пока участник
 * не определился, — «1-е место · Высший дивизион», «Победитель матча №12».
 *
 * Своя подпись организатора (label) перекрывает автоматическую: правила
 * сезона иногда не описываются источником («Лучшая из вторых команд»).
 */
export function slotLabel(slot: SlotDescriptor): string {
  if (slot.label) return slot.label;

  switch (slot.source) {
    case "TEAM":
      return "Команда не выбрана";

    case "DIVISION_PLACE": {
      const place = slot.place ? placeLabel(slot.place) : "Место не указано";
      return slot.divisionName ? `${place} · ${slot.divisionName}` : place;
    }

    case "MATCH_WINNER":
    case "MATCH_LOSER": {
      const who = slot.source === "MATCH_WINNER" ? "Победитель" : "Проигравший";
      if (!slot.sourceMatchId) return `${who} другого матча`;
      const stage =
        slot.sourceMatchStage && slot.sourceMatchStage !== "REGULAR"
          ? ` (${MATCH_STAGE_LABEL[slot.sourceMatchStage]})`
          : "";
      return `${who} матча №${slot.sourceMatchId}${stage}`;
    }
  }
}

type HomeSlotFields = {
  homeSource: MatchSlotSource;
  homeSourcePlace: number | null;
  homeSourceLabel: string | null;
  homeSourceMatchId: number | null;
  homeSourceDivision: { name: string } | null;
};

type AwaySlotFields = {
  awaySource: MatchSlotSource;
  awaySourcePlace: number | null;
  awaySourceLabel: string | null;
  awaySourceMatchId: number | null;
  awaySourceDivision: { name: string } | null;
};

/** Собирает описание слота из полей матча — подходит любой выборке с этими полями. */
export function homeSlotOf(match: HomeSlotFields): SlotDescriptor {
  return {
    source: match.homeSource,
    divisionName: match.homeSourceDivision?.name,
    place: match.homeSourcePlace,
    sourceMatchId: match.homeSourceMatchId,
    label: match.homeSourceLabel,
  };
}

export function awaySlotOf(match: AwaySlotFields): SlotDescriptor {
  return {
    source: match.awaySource,
    divisionName: match.awaySourceDivision?.name,
    place: match.awaySourcePlace,
    sourceMatchId: match.awaySourceMatchId,
    label: match.awaySourceLabel,
  };
}

export const SLOT_SOURCE_LABEL: Record<MatchSlotSource, string> = {
  TEAM: "Конкретная команда",
  DIVISION_PLACE: "Место в дивизионе",
  MATCH_WINNER: "Победитель матча",
  MATCH_LOSER: "Проигравший матча",
};

/** Короткая подпись матча для выпадающих списков: «№12 · 1/4 финала». */
export function matchPickerLabel(match: {
  id: number;
  stage: MatchStage;
  homeLabel: string;
  awayLabel: string;
}): string {
  return `№${match.id} · ${MATCH_STAGE_LABEL[match.stage]} · ${match.homeLabel} — ${match.awayLabel}`;
}
