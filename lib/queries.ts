// ============================================================================
// Operaciones de datos del Planificador (solo servidor).
// Encapsula todo el acceso a Postgres/Neon y devuelve estructuras ya listas
// para la lógica de `planner.ts` y la interfaz.
// ============================================================================

import "server-only";

import { getSql } from "./db";
import {
  autoQuincena,
  generateSchedule,
  isosFor,
  needsFor,
} from "./planner";
import type {
  Person,
  PlanState,
  Role,
  Schedule,
  ShiftCode,
  ShiftCodeMeta,
} from "./types";

const VALID_CODES: ShiftCode[] = ["L", "AM", "PM", "C"];

function clampCourses(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(20, Math.round(n)));
}

export function isValidCode(code: string): code is ShiftCode {
  return (VALID_CODES as string[]).includes(code);
}

// --- Catálogos -------------------------------------------------------------
export async function getPeople(): Promise<Person[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name, role_id
    FROM people
    WHERE active = TRUE
    ORDER BY sort_order, name
  `) as Array<{ id: string; name: string; role_id: string }>;
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role_id }));
}

export async function getRoles(): Promise<Record<string, Role>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, label, color_fg, color_bg FROM roles ORDER BY sort_order
  `) as Array<Role>;
  const out: Record<string, Role> = {};
  rows.forEach((r) => (out[r.id] = r));
  return out;
}

export async function getShiftCodes(): Promise<Record<string, ShiftCodeMeta>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT code, label, sub FROM shift_codes ORDER BY sort_order
  `) as Array<{ code: ShiftCode; label: string; sub: string }>;
  const out: Record<string, ShiftCodeMeta> = {};
  rows.forEach((r) => (out[r.code] = { code: r.code, label: r.label, sub: r.sub }));
  return out;
}

// --- Planes y sábados ------------------------------------------------------
interface PlanRow {
  id: string;
  year: number;
  month: number;
  base_staff: number;
  courses_per_extra: number;
}

/** Obtiene el plan de (año, mes) y crea sus sábados si aún no existen. */
async function getOrCreatePlan(year: number, month: number): Promise<PlanRow> {
  const sql = getSql();
  let rows = (await sql`
    SELECT id, year, month, base_staff, courses_per_extra
    FROM plans WHERE year = ${year} AND month = ${month}
  `) as PlanRow[];

  // Solo en la primera creación del plan generamos sus sábados (una sola vez,
  // en un único INSERT multifila). En llamadas posteriores ya existen, así que
  // no repetimos round-trips a la BD.
  if (rows.length === 0) {
    await sql`
      INSERT INTO plans (year, month) VALUES (${year}, ${month})
      ON CONFLICT (year, month) DO NOTHING
    `;
    rows = (await sql`
      SELECT id, year, month, base_staff, courses_per_extra
      FROM plans WHERE year = ${year} AND month = ${month}
    `) as PlanRow[];
    await ensureSaturdays(rows[0].id, year, month);
  }
  return rows[0];
}

/** Crea las filas de sábados de un plan en un único INSERT multifila. */
async function ensureSaturdays(planId: string, year: number, month: number): Promise<void> {
  const isos = isosFor(year, month);
  if (!isos.length) return;
  const sql = getSql();
  const auto = autoQuincena(isos);
  const tuples: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  isos.forEach((iso, idx) => {
    tuples.push(`($${i++}, $${i++}, $${i++})`);
    params.push(planId, iso, auto[idx]);
  });
  const text =
    `INSERT INTO plan_saturdays (plan_id, sat_date, is_quincena) VALUES ` +
    tuples.join(", ") +
    ` ON CONFLICT (plan_id, sat_date) DO NOTHING`;
  await sql.query(text, params);
}

async function getSatIdMap(planId: string): Promise<Record<string, string>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, sat_date::text AS sat_date FROM plan_saturdays WHERE plan_id = ${planId}
  `) as Array<{ id: string; sat_date: string }>;
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.sat_date] = r.id));
  return map;
}

/** Estado completo de un plan, listo para la interfaz. */
export async function getPlanState(year: number, month: number): Promise<PlanState> {
  const sql = getSql();
  const plan = await getOrCreatePlan(year, month);
  const [people, roles, shiftCodes] = await Promise.all([
    getPeople(),
    getRoles(),
    getShiftCodes(),
  ]);

  const satRows = (await sql`
    SELECT id, sat_date::text AS sat_date, courses_am, courses_pm, is_quincena
    FROM plan_saturdays WHERE plan_id = ${plan.id} ORDER BY sat_date
  `) as Array<{
    id: string;
    sat_date: string;
    courses_am: number;
    courses_pm: number;
    is_quincena: boolean;
  }>;

  const isos: string[] = [];
  const courses: PlanState["courses"] = {};
  const quincena: PlanState["quincena"] = {};
  for (const r of satRows) {
    isos.push(r.sat_date);
    courses[r.sat_date] = { am: r.courses_am, pm: r.courses_pm };
    quincena[r.sat_date] = r.is_quincena;
  }

  const asgRows = (await sql`
    SELECT ps.sat_date::text AS sat_date, a.person_id, a.code
    FROM assignments a
    JOIN plan_saturdays ps ON ps.id = a.plan_saturday_id
    WHERE ps.plan_id = ${plan.id}
  `) as Array<{ sat_date: string; person_id: string; code: ShiftCode }>;

  const schedule: Schedule = {};
  isos.forEach((iso) => (schedule[iso] = {}));
  for (const r of asgRows) {
    (schedule[r.sat_date] ||= {})[r.person_id] = r.code;
  }

  return {
    year,
    month,
    params: { baseStaff: plan.base_staff, coursesPerExtra: plan.courses_per_extra },
    people,
    roles,
    shiftCodes,
    isos,
    courses,
    quincena,
    schedule,
  };
}

// --- Mutaciones ------------------------------------------------------------
export async function updateCourses(
  year: number,
  month: number,
  date: string,
  shift: "am" | "pm",
  value: number,
): Promise<void> {
  const sql = getSql();
  const plan = await getOrCreatePlan(year, month);
  const v = clampCourses(value);
  if (shift === "am") {
    await sql`UPDATE plan_saturdays SET courses_am = ${v} WHERE plan_id = ${plan.id} AND sat_date = ${date}`;
  } else {
    await sql`UPDATE plan_saturdays SET courses_pm = ${v} WHERE plan_id = ${plan.id} AND sat_date = ${date}`;
  }
  await touchPlan(plan.id);
}

export async function setQuincena(
  year: number,
  month: number,
  date: string,
  value: boolean,
): Promise<void> {
  const sql = getSql();
  const plan = await getOrCreatePlan(year, month);
  await sql`UPDATE plan_saturdays SET is_quincena = ${value} WHERE plan_id = ${plan.id} AND sat_date = ${date}`;
  await touchPlan(plan.id);
}

export async function setAssignment(
  year: number,
  month: number,
  date: string,
  personId: string,
  code: ShiftCode,
): Promise<void> {
  const sql = getSql();
  const plan = await getOrCreatePlan(year, month);
  await sql`
    INSERT INTO assignments (plan_saturday_id, person_id, code)
    SELECT ps.id, ${personId}, ${code}
    FROM plan_saturdays ps
    WHERE ps.plan_id = ${plan.id} AND ps.sat_date = ${date}
    ON CONFLICT (plan_saturday_id, person_id)
    DO UPDATE SET code = EXCLUDED.code, updated_at = now()
  `;
  await touchPlan(plan.id);
}

/** Limpia el mes: deja a todos en "Libre" (borra las asignaciones del plan). */
export async function clearMonth(year: number, month: number): Promise<void> {
  const sql = getSql();
  const plan = await getOrCreatePlan(year, month);
  await sql`
    DELETE FROM assignments
    WHERE plan_saturday_id IN (SELECT id FROM plan_saturdays WHERE plan_id = ${plan.id})
  `;
  await touchPlan(plan.id);
}

/** Guarda un schedule completo (upsert masivo en una sola consulta). */
async function saveSchedule(
  planId: string,
  schedule: Schedule,
): Promise<void> {
  const sql = getSql();
  const satIds = await getSatIdMap(planId);
  const tuples: string[] = [];
  const params: string[] = [];
  let i = 1;
  for (const iso of Object.keys(schedule)) {
    const satId = satIds[iso];
    if (!satId) continue;
    for (const [pid, code] of Object.entries(schedule[iso])) {
      tuples.push(`($${i++}, $${i++}, $${i++})`);
      params.push(satId, pid, code);
    }
  }
  if (!tuples.length) return;
  const text =
    `INSERT INTO assignments (plan_saturday_id, person_id, code) VALUES ` +
    tuples.join(", ") +
    ` ON CONFLICT (plan_saturday_id, person_id) DO UPDATE SET code = EXCLUDED.code, updated_at = now()`;
  await sql.query(text, params);
}

/**
 * Igual que getPlanState, pero si el mes aún no tiene ninguna asignación,
 * genera una automáticamente (replica el comportamiento original al abrir).
 */
export async function getPlanStateEnsured(
  year: number,
  month: number,
  seed?: number,
): Promise<PlanState> {
  const state = await getPlanState(year, month);
  const hasAny = state.isos.some(
    (iso) => Object.keys(state.schedule[iso] ?? {}).length > 0,
  );
  if (!hasAny && state.isos.length) {
    return generateForPlan(year, month, seed);
  }
  return state;
}

/** Genera la asignación del mes en el servidor y la persiste. */
export async function generateForPlan(
  year: number,
  month: number,
  seed?: number,
): Promise<PlanState> {
  const state = await getPlanState(year, month);
  if (state.isos.length) {
    const numPeople = state.people.length;
    const needs = state.isos.map((iso) =>
      needsFor(state.courses[iso] ?? { am: 3, pm: 2 }, state.params, numPeople),
    );
    const qFlags = state.isos.map((iso) => !!state.quincena[iso]);
    const { schedule } = generateSchedule(state.isos, needs, qFlags, state.people, seed);
    const plan = await getOrCreatePlan(year, month);
    await saveSchedule(plan.id, schedule);
    await touchPlan(plan.id);
  }
  return getPlanState(year, month);
}

async function touchPlan(planId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE plans SET updated_at = now() WHERE id = ${planId}`;
}
