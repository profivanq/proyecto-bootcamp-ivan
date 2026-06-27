import { NextResponse } from "next/server";
import { clearMonth, getPlanState } from "@/lib/queries";
import { isValidYearMonth, jsonError, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/clear { year, month }  -> deja a todos en "Libre"
export async function POST(request: Request) {
  let body: { year?: number; month?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido.");
  }
  const { year, month } = body;
  if (!isValidYearMonth(year, month)) {
    return jsonError("Parámetros 'year'/'month' inválidos (month: 0-11).");
  }
  try {
    await clearMonth(year as number, month as number);
    const state = await getPlanState(year as number, month as number);
    return NextResponse.json(state);
  } catch (e) {
    return serverError(e);
  }
}
