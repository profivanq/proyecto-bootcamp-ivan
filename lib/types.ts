// Tipos del dominio del Planificador de Sábados.

export type ShiftCode = "L" | "AM" | "PM" | "C";

export interface Role {
  id: string;
  label: string;
  color_fg: string;
  color_bg: string;
}

export interface Person {
  id: string;
  name: string;
  role: string; // role.id
}

export interface ShiftCodeMeta {
  code: ShiftCode;
  label: string;
  sub: string;
}

export interface Needs {
  am: number;
  pm: number;
}

export interface PlanParams {
  baseStaff: number;
  coursesPerExtra: number;
}

export interface Courses {
  am: number;
  pm: number;
}

// iso (YYYY-MM-DD) -> personId -> código de turno
export type Schedule = Record<string, Record<string, ShiftCode>>;

// iso -> cursos a.m./p.m.
export type CoursesMap = Record<string, Courses>;

// iso -> es quincena
export type QuincenaMap = Record<string, boolean>;

export type Severity = "error" | "warn";

export interface Alert {
  severity: Severity;
  title: string;
  detail: string;
}

export interface ShiftCoverage {
  present: number;
  need: number;
  ok: boolean;
  vendedor: boolean;
}

export interface DayCoverage {
  am: ShiftCoverage;
  pm: ShiftCoverage;
  isQuincena: boolean;
  contabOk: boolean;
  caAm: boolean;
  caPm: boolean;
}

export interface PersonCompliance {
  libre: boolean;
  completo: boolean;
  am: boolean;
  pm: boolean;
  libreN: number;
  compN: number;
}

export interface Evaluation {
  coverage: Record<string, DayCoverage>;
  personCompliance: Record<string, PersonCompliance>;
  alerts: Alert[];
  score: number;
}

// Estado completo de un plan, tal como lo entrega/consume la API.
export interface PlanState {
  year: number;
  month: number; // 0 = enero ... 11 = diciembre
  params: PlanParams;
  people: Person[];
  roles: Record<string, Role>;
  shiftCodes: Record<string, ShiftCodeMeta>;
  isos: string[];
  courses: CoursesMap;
  quincena: QuincenaMap;
  schedule: Schedule;
}
