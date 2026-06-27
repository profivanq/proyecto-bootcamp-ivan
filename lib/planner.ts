// ============================================================================
// Lógica del Planificador de Sábados (puro, sin dependencias de UI ni de BD).
// Portado fielmente de la versión original (clase DCLogic) para que el
// comportamiento — dotación, quincenas, validación y generación — sea idéntico.
// Se usa tanto en el servidor (generación/seed) como en el cliente (validación
// instantánea al editar).
// ============================================================================

import type {
  Alert,
  DayCoverage,
  Evaluation,
  Needs,
  Person,
  PersonCompliance,
  PlanParams,
  Schedule,
  ShiftCode,
} from "./types";

// --- Reglas de negocio (constantes) ---------------------------------------
const ROLE_VENTAS = "ventas";
const ROLE_CONTAB = "contabilidad";
const CA_IDS = ["cesar", "alejandra"]; // deben cubrir cada turno en quincena

export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// --- Helpers de fecha ------------------------------------------------------
const pad = (n: number): string => String(n).padStart(2, "0");

export function isoOf(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** Todos los sábados del mes (month: 0=enero ... 11=diciembre). */
export function saturdaysFor(year: number, month: number): Date[] {
  const r: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (d.getDay() === 6) r.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return r;
}

export function isosFor(year: number, month: number): string[] {
  return saturdaysFor(year, month).map(isoOf);
}

export function dayNumOf(iso: string): number {
  return Number(iso.split("-")[2]);
}

export function dateLabel(iso: string): string {
  return "Sáb " + dayNumOf(iso);
}

export function monthLabel(year: number, month: number): string {
  const s = MONTHS[month];
  return s.charAt(0).toUpperCase() + s.slice(1) + " " + year;
}

// --- Dotación de personal --------------------------------------------------
/** Personas necesarias para un turno con `courses` cursos. */
export function staff(courses: number, params: PlanParams, numPeople: number): number {
  const base = params.baseStaff ?? 1;
  const per = params.coursesPerExtra ?? 2;
  if (courses <= 0) return 0;
  return Math.min(numPeople, Math.max(2, base + Math.ceil(courses / per)));
}

export function needsFor(
  courses: { am: number; pm: number },
  params: PlanParams,
  numPeople: number,
): Needs {
  return {
    am: staff(courses.am, params, numPeople),
    pm: staff(courses.pm, params, numPeople),
  };
}

// --- Quincena (cálculo automático) ----------------------------------------
/**
 * Marca como quincena el sábado más cercano al día 15 y el más cercano al
 * último día del mes. Recibe los ISO de los sábados del mes.
 */
export function autoQuincena(isos: string[]): boolean[] {
  const flags = isos.map(() => false);
  if (!isos.length) return flags;
  const parts = isos[0].split("-").map(Number);
  const y = parts[0];
  const m = parts[1]; // 1-based
  const lastDay = new Date(y, m, 0).getDate(); // último día del mes
  const days = isos.map(dayNumOf);
  [15, lastDay].forEach((t) => {
    let bi = -1;
    let bd = 1e9;
    days.forEach((d, i) => {
      const diff = Math.abs(d - t);
      if (diff < bd) {
        bd = diff;
        bi = i;
      }
    });
    if (bi >= 0) flags[bi] = true;
  });
  return flags;
}

// --- Evaluación / validación ----------------------------------------------
const inAM = (c: ShiftCode): boolean => c === "AM" || c === "C";
const inPM = (c: ShiftCode): boolean => c === "PM" || c === "C";

export function evaluate(
  sched: Schedule,
  isos: string[],
  needsArr: Needs[],
  qFlags: boolean[],
  people: Person[],
): Evaluation {
  const P = people;
  const codeOf = (iso: string, pid: string): ShiftCode =>
    (sched[iso] && sched[iso][pid]) || "L";

  const coverage: Record<string, DayCoverage> = {};
  let score = 0;
  const alerts: Alert[] = [];

  isos.forEach((iso, idx) => {
    const need = needsArr[idx];
    const q = qFlags[idx];
    const dl = dateLabel(iso);
    const amP = P.filter((p) => inAM(codeOf(iso, p.id)));
    const pmP = P.filter((p) => inPM(codeOf(iso, p.id)));
    const present = P.filter((p) => codeOf(iso, p.id) !== "L");
    const vendAm = amP.some((p) => p.role === ROLE_VENTAS);
    const vendPm = pmP.some((p) => p.role === ROLE_VENTAS);
    const contabPresent = present.some((p) => p.role === ROLE_CONTAB);
    const caAm = amP.some((p) => CA_IDS.includes(p.id));
    const caPm = pmP.some((p) => CA_IDS.includes(p.id));
    const dayActive = need.am > 0 || need.pm > 0;

    coverage[iso] = {
      am: { present: amP.length, need: need.am, ok: need.am === 0 || amP.length >= need.am, vendedor: need.am === 0 || vendAm },
      pm: { present: pmP.length, need: need.pm, ok: need.pm === 0 || pmP.length >= need.pm, vendedor: need.pm === 0 || vendPm },
      isQuincena: q,
      contabOk: !q || !dayActive || contabPresent,
      caAm: !q || need.am === 0 || caAm,
      caPm: !q || need.pm === 0 || caPm,
    };

    if (need.am > 0 && amP.length < need.am) {
      score -= 3;
      alerts.push({ severity: "warn", title: "Falta personal · " + dl + " a.m.", detail: "Hay " + amP.length + " de " + need.am + " personas requeridas." });
    }
    if (need.pm > 0 && pmP.length < need.pm) {
      score -= 3;
      alerts.push({ severity: "warn", title: "Falta personal · " + dl + " p.m.", detail: "Hay " + pmP.length + " de " + need.pm + " personas requeridas." });
    }
    if (need.am > 0 && amP.length > need.am) score -= 0.35 * (amP.length - need.am);
    if (need.pm > 0 && pmP.length > need.pm) score -= 0.35 * (pmP.length - need.pm);
    if (need.am > 0 && !vendAm) {
      score -= 6;
      alerts.push({ severity: "error", title: "Sin vendedor · " + dl + " a.m.", detail: "Todo turno activo debe tener al menos un vendedor." });
    }
    if (need.pm > 0 && !vendPm) {
      score -= 6;
      alerts.push({ severity: "error", title: "Sin vendedor · " + dl + " p.m.", detail: "Todo turno activo debe tener al menos un vendedor." });
    }
    if (q && dayActive && !contabPresent) {
      score -= 5;
      alerts.push({ severity: "error", title: "Contabilidad ausente · " + dl, detail: "En sábados de quincena, Jocelyn (contabilidad) debe estar presente." });
    }
    if (q && need.am > 0 && !caAm) {
      score -= 5;
      alerts.push({ severity: "error", title: "Falta César/Alejandra · " + dl + " a.m.", detail: "En quincena, cada turno debe incluir a César o Alejandra." });
    }
    if (q && need.pm > 0 && !caPm) {
      score -= 5;
      alerts.push({ severity: "error", title: "Falta César/Alejandra · " + dl + " p.m.", detail: "En quincena, cada turno debe incluir a César o Alejandra." });
    }
  });

  const personCompliance: Record<string, PersonCompliance> = {};
  P.forEach((p) => {
    let libreN = 0;
    let compN = 0;
    let am = false;
    let pm = false;
    isos.forEach((iso) => {
      const c = codeOf(iso, p.id);
      if (c === "L") libreN++;
      if (c === "C") compN++;
      if (inAM(c)) am = true;
      if (inPM(c)) pm = true;
    });
    personCompliance[p.id] = { libre: libreN === 1, completo: compN === 1, am, pm, libreN, compN };
    if (isos.length >= 2) {
      if (libreN === 0) {
        score -= 3;
        alerts.push({ severity: "warn", title: p.name + " sin sábado libre", detail: "Cada colaborador debe tener exactamente un sábado libre en el mes." });
      } else if (libreN > 1) {
        score -= 3;
        alerts.push({ severity: "warn", title: p.name + " con " + libreN + " sábados libres", detail: "Cada colaborador debe tener exactamente un sábado libre (máximo 1)." });
      }
      if (compN === 0) {
        score -= 3;
        alerts.push({ severity: "warn", title: p.name + " sin sábado completo", detail: "Cada colaborador debe tener exactamente un sábado a tiempo completo." });
      } else if (compN > 1) {
        score -= 3;
        alerts.push({ severity: "warn", title: p.name + " con " + compN + " sábados completos", detail: "Cada colaborador debe tener exactamente un sábado completo (máximo 1)." });
      }
      if (!am) {
        score -= 2;
        alerts.push({ severity: "warn", title: p.name + " sin turno a.m.", detail: "Cada colaborador debe cubrir al menos un turno de mañana." });
      }
      if (!pm) {
        score -= 2;
        alerts.push({ severity: "warn", title: p.name + " sin turno p.m.", detail: "Cada colaborador debe cubrir al menos un turno de tarde." });
      }
    }
  });

  return { coverage, personCompliance, alerts, score };
}

// --- Generación automática -------------------------------------------------
type Rng = () => number;

function mulberry32(a: number): Rng {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAttempt(
  isos: string[],
  needs: Needs[],
  qFlags: boolean[],
  rng: Rng,
  people: Person[],
): Schedule {
  const P = people;
  const n = isos.length;
  const byId = (id: string) => P.find((p) => p.id === id)!;
  const sched: Schedule = {};
  isos.forEach((iso) => {
    sched[iso] = {};
    P.forEach((p) => {
      sched[iso][p.id] = "L";
    });
  });
  const randInt = (m: number) => Math.floor(rng() * m);
  const shuffle = (a: string[]) => {
    for (let k = a.length - 1; k > 0; k--) {
      const j = randInt(k + 1);
      const t = a[k];
      a[k] = a[j];
      a[j] = t;
    }
  };
  const lockedLibre: Set<string>[] = isos.map(() => new Set<string>());
  const needTotal = needs.map((nd) => nd.am + nd.pm);
  const wpick = (weights: number[], ex: number): number => {
    let tot = 0;
    const w = weights.map((x, i) => (i === ex ? 0 : Math.max(0.0001, x)));
    w.forEach((x) => (tot += x));
    let r = rng() * tot;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  };

  // Sembrar EXACTAMENTE un completo (prefiere alta demanda / quincena) + un
  // libre (prefiere baja demanda), en días distintos.
  P.forEach((p) => {
    if (n < 1) return;
    const compW = needTotal.map((t, i) => t + (qFlags[i] ? 3 : 0) + 0.5);
    const cDay = wpick(compW, -1);
    sched[isos[cDay]][p.id] = "C";
    if (n >= 2) {
      const libW = needTotal.map((t, i) => 1 / (1 + t + (qFlags[i] ? 2 : 0)));
      const lDay = wpick(libW, cDay);
      sched[isos[lDay]][p.id] = "L";
      lockedLibre[lDay].add(p.id);
    }
  });

  const inAMc = (iso: string, pid: string) => {
    const c = sched[iso][pid];
    return c === "AM" || c === "C";
  };
  const inPMc = (iso: string, pid: string) => {
    const c = sched[iso][pid];
    return c === "PM" || c === "C";
  };

  isos.forEach((iso, i) => {
    const need = needs[i];
    const q = qFlags[i];
    const amCount = () => P.filter((p) => inAMc(iso, p.id)).length;
    const pmCount = () => P.filter((p) => inPMc(iso, p.id)).length;
    const hasVentas = (shift: "AM" | "PM") =>
      P.some((p) => p.role === ROLE_VENTAS && (shift === "AM" ? inAMc(iso, p.id) : inPMc(iso, p.id)));
    const hasCA = (shift: "AM" | "PM") =>
      P.some((p) => CA_IDS.includes(p.id) && (shift === "AM" ? inAMc(iso, p.id) : inPMc(iso, p.id)));
    const contabPresent = () => P.some((p) => p.role === ROLE_CONTAB && sched[iso][p.id] !== "L");

    const avail = P.filter((p) => sched[iso][p.id] === "L" && !lockedLibre[i].has(p.id)).map((p) => p.id);
    shuffle(avail);
    // NUNCA asignar un segundo completo: la cobertura usa solo AM/PM.
    const takeTo = (pred: (p: Person) => boolean, shift: ShiftCode): string | null => {
      const idx = avail.findIndex((pid) => pred(byId(pid)));
      if (idx >= 0) {
        const pid = avail[idx];
        sched[iso][pid] = shift;
        avail.splice(idx, 1);
        return pid;
      }
      return null;
    };

    // vendedor en cada turno activo
    if (need.am > 0 && !hasVentas("AM")) takeTo((p) => p.role === ROLE_VENTAS, "AM");
    if (need.pm > 0 && !hasVentas("PM")) takeTo((p) => p.role === ROLE_VENTAS, "PM");
    // reglas de quincena
    if (q) {
      if ((need.am > 0 || need.pm > 0) && !contabPresent()) {
        const shift: ShiftCode = need.am > 0 && need.am >= need.pm ? "AM" : need.pm > 0 ? "PM" : "AM";
        takeTo((p) => p.role === ROLE_CONTAB, shift);
      }
      if (need.am > 0 && !hasCA("AM")) takeTo((p) => CA_IDS.includes(p.id), "AM");
      if (need.pm > 0 && !hasCA("PM")) takeTo((p) => CA_IDS.includes(p.id), "PM");
    }
    // cubrir el cupo de cada turno
    let g = 0;
    while (amCount() < need.am && avail.length > 0 && g++ < 30) {
      const pid = avail.shift()!;
      sched[iso][pid] = "AM";
    }
    g = 0;
    while (pmCount() < need.pm && avail.length > 0 && g++ < 30) {
      const pid = avail.shift()!;
      sched[iso][pid] = "PM";
    }
    // el resto TRABAJA (solo se permite 1 libre al mes por persona)
    while (avail.length > 0) {
      const pid = avail.shift()!;
      let shift: ShiftCode;
      if (need.am > 0 && need.pm === 0) shift = "AM";
      else if (need.pm > 0 && need.am === 0) shift = "PM";
      else shift = amCount() <= pmCount() ? "AM" : "PM";
      sched[iso][pid] = shift;
    }
  });
  return sched;
}

/**
 * Genera la mejor asignación probando hasta 600 combinaciones aleatorias y
 * quedándose con la de mayor puntaje (corta al encontrar puntaje >= 0).
 * `seed` permite resultados deterministas (por defecto usa la hora actual).
 */
export function generateSchedule(
  isos: string[],
  needs: Needs[],
  qFlags: boolean[],
  people: Person[],
  seed: number = Date.now(),
): { schedule: Schedule; score: number } {
  if (!isos.length) return { schedule: {}, score: 0 };
  let best: Schedule | null = null;
  let bestScore = -1e9;
  const seedBase = (seed >>> 0) as number;
  for (let a = 0; a < 600; a++) {
    const rng = mulberry32((seedBase + a * 2654435761) >>> 0);
    const sched = buildAttempt(isos, needs, qFlags, rng, people);
    const { score } = evaluate(sched, isos, needs, qFlags, people);
    if (score > bestScore) {
      bestScore = score;
      best = sched;
      if (score >= 0) break;
    }
  }
  return { schedule: best!, score: bestScore };
}
