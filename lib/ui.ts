// Constantes de presentación (colores de turnos) que no viven en la BD.
import type { ShiftCode } from "./types";

export interface ShiftColor {
  bg: string;
  fg: string;
  border: string;
}

export const SHIFT_COLORS: Record<ShiftCode, ShiftColor> = {
  L: { bg: "#F1F5F9", fg: "#94A3B8", border: "1px dashed #CBD5E1" },
  AM: { bg: "#FEF3C7", fg: "#92400E", border: "1px solid #FCD34D" },
  PM: { bg: "#DBEAFE", fg: "#1D4ED8", border: "1px solid #93C5FD" },
  C: { bg: "#D1FAE5", fg: "#047857", border: "1px solid #6EE7B7" },
};

export const CODE_ORDER: ShiftCode[] = ["L", "AM", "PM", "C"];
