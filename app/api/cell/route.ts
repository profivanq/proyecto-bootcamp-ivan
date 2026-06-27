import { NextResponse } from "next/server";
import { isValidCode, setAssignment } from "@/lib/queries";
import { ISO_RE, isValidYearMonth, jsonError, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// PUT /api/cell { year, month, date, personId, code }
export async function PUT(request: Request) {
  let body: {
    year?: number;
    month?: number;
    date?: string;
    personId?: string;
    code?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido.");
  }
  const { year, month, date, personId, code } = body;
  if (!isValidYearMonth(year, month)) {
    return jsonError("Parámetros 'year'/'month' inválidos (month: 0-11).");
  }
  if (typeof date !== "string" || !ISO_RE.test(date)) {
    return jsonError("Fecha inválida (formato YYYY-MM-DD).");
  }
  if (typeof personId !== "string" || !personId) {
    return jsonError("'personId' requerido.");
  }
  if (typeof code !== "string" || !isValidCode(code)) {
    return jsonError("'code' inválido (L, AM, PM o C).");
  }
  try {
    await setAssignment(year as number, month as number, date, personId, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
