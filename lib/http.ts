// Helpers compartidos por las rutas API.
import { NextResponse } from "next/server";

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Error desconocido";
}

/**
 * Error 500: registra el detalle real en el servidor y devuelve un mensaje
 * genérico al cliente (no filtra estructura interna de la BD).
 */
export function serverError(e: unknown) {
  console.error("[api] error interno:", e);
  return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
}

export function isValidYearMonth(year: unknown, month: unknown): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    (year as number) >= MIN_YEAR &&
    (year as number) <= MAX_YEAR &&
    (month as number) >= 0 &&
    (month as number) <= 11
  );
}
