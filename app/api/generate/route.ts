import { NextResponse } from "next/server";
import { generateForPlan } from "@/lib/queries";
import { isValidYearMonth, jsonError, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/generate { year, month }  -> regenera y persiste la asignación
export async function POST(request: Request) {
  let body: { year?: number; month?: number; seed?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido.");
  }
  const { year, month, seed } = body;
  if (!isValidYearMonth(year, month)) {
    return jsonError("Parámetros 'year'/'month' inválidos (month: 0-11).");
  }
  try {
    const state = await generateForPlan(
      year as number,
      month as number,
      typeof seed === "number" ? seed : undefined,
    );
    return NextResponse.json(state);
  } catch (e) {
    return serverError(e);
  }
}
