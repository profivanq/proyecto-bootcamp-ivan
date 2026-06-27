import { NextResponse } from "next/server";
import { getPlanStateEnsured } from "@/lib/queries";
import { isValidYearMonth, jsonError, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/plan?year=2026&month=5  -> estado completo del plan (genera si vacío)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!isValidYearMonth(year, month)) {
    return jsonError("Parámetros 'year'/'month' inválidos (month: 0-11).");
  }
  try {
    const state = await getPlanStateEnsured(year, month);
    return NextResponse.json(state);
  } catch (e) {
    return serverError(e);
  }
}
