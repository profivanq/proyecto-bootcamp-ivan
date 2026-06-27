import { NextResponse } from "next/server";
import { updateCourses } from "@/lib/queries";
import { ISO_RE, isValidYearMonth, jsonError, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// PUT /api/courses { year, month, date, shift: 'am'|'pm', value }
export async function PUT(request: Request) {
  let body: {
    year?: number;
    month?: number;
    date?: string;
    shift?: string;
    value?: number;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido.");
  }
  const { year, month, date, shift, value } = body;
  if (!isValidYearMonth(year, month)) {
    return jsonError("Parámetros 'year'/'month' inválidos (month: 0-11).");
  }
  if (typeof date !== "string" || !ISO_RE.test(date)) {
    return jsonError("Fecha inválida (formato YYYY-MM-DD).");
  }
  if (shift !== "am" && shift !== "pm") {
    return jsonError("'shift' debe ser 'am' o 'pm'.");
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return jsonError("'value' debe ser numérico.");
  }
  try {
    await updateCourses(year as number, month as number, date, shift, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
