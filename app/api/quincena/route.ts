import { NextResponse } from "next/server";
import { setQuincena } from "@/lib/queries";
import { ISO_RE, isValidYearMonth, jsonError, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// PUT /api/quincena { year, month, date, value: boolean }
export async function PUT(request: Request) {
  let body: { year?: number; month?: number; date?: string; value?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido.");
  }
  const { year, month, date, value } = body;
  if (!isValidYearMonth(year, month)) {
    return jsonError("Parámetros 'year'/'month' inválidos (month: 0-11).");
  }
  if (typeof date !== "string" || !ISO_RE.test(date)) {
    return jsonError("Fecha inválida (formato YYYY-MM-DD).");
  }
  if (typeof value !== "boolean") {
    return jsonError("'value' debe ser booleano.");
  }
  try {
    await setQuincena(year as number, month as number, date, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
