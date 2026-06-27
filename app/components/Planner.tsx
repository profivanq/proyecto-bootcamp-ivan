"use client";

import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  dayNumOf,
  dateLabel,
  evaluate,
  monthLabel,
  needsFor,
} from "@/lib/planner";
import { CODE_ORDER, SHIFT_COLORS } from "@/lib/ui";
import type { PlanState, Schedule, ShiftCode } from "@/lib/types";

// --- Helpers de estilo (portados del original) -----------------------------
function cellStyle(code: ShiftCode): CSSProperties {
  const c = SHIFT_COLORS[code];
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    width: "100%",
    minHeight: 48,
    padding: 6,
    borderRadius: 10,
    cursor: "pointer",
    background: c.bg,
    color: c.fg,
    border: c.border,
    fontWeight: 600,
    fontSize: 12.5,
    lineHeight: 1.1,
    transition: "transform .08s ease, box-shadow .12s ease",
    outline: "none",
  };
}
function needBadgeStyle(code: ShiftCode, ok: boolean): CSSProperties {
  const c = SHIFT_COLORS[code];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    background: ok ? c.bg : "#FEF3F2",
    color: ok ? c.fg : "#B42318",
    border: "1px solid " + (ok ? "transparent" : "#FECDCA"),
  };
}
function quincenaPillStyle(on: boolean): CSSProperties {
  return on
    ? {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        borderRadius: 8,
        fontSize: 11.5,
        fontWeight: 600,
        background: "#F5F3FF",
        color: "#6D28D9",
        border: "1px solid #DDD6FE",
        cursor: "pointer",
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        borderRadius: 8,
        fontSize: 11.5,
        fontWeight: 600,
        background: "#F8FAFC",
        color: "#98A2B3",
        border: "1px solid #E4E7EC",
        cursor: "pointer",
      };
}
function reqStyle(ok: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    background: ok ? "#ECFDF3" : "#FEF3F2",
    color: ok ? "#067647" : "#D92D20",
    border: "1px solid " + (ok ? "#A6F4C5" : "#FECDCA"),
  };
}
function alertBoxStyle(sev: "error" | "warn"): CSSProperties {
  const m = sev === "error" ? { bg: "#FEF3F2", bd: "#FECDCA" } : { bg: "#FFFAEB", bd: "#FEDF89" };
  return {
    display: "flex",
    gap: 10,
    padding: "11px 12px",
    borderRadius: 10,
    background: m.bg,
    border: "1px solid " + m.bd,
  };
}
function alertDotStyle(sev: "error" | "warn"): CSSProperties {
  const col = sev === "error" ? "#D92D20" : "#DC6803";
  return { flex: "0 0 auto", width: 8, height: 8, borderRadius: "50%", background: col, marginTop: 5 };
}
function tagStyle(ok: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 10.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    background: ok ? "#ECFDF3" : "#FEF3F2",
    color: ok ? "#067647" : "#B42318",
    border: "1px solid " + (ok ? "#A6F4C5" : "#FECDCA"),
  };
}
function countStyle(ok: boolean, active: boolean): CSSProperties {
  const base: CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
  if (!active) return { ...base, color: "#98A2B3" };
  return { ...base, color: ok ? "#101828" : "#B42318" };
}
function swatchStyle(code: ShiftCode): CSSProperties {
  const c = SHIFT_COLORS[code];
  return { width: 15, height: 15, borderRadius: 5, flex: "0 0 auto", background: c.bg, border: c.border };
}

const HEADERS = { "Content-Type": "application/json" };

// --- Componente principal --------------------------------------------------
export default function Planner({ initial }: { initial: PlanState }) {
  const [s, setS] = useState<PlanState>(initial);
  const [menu, setMenu] = useState<{ x: number; y: number; iso: string; personId: string } | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Identifica la última carga lanzada para ignorar respuestas obsoletas (carreras).
  const reqIdRef = useRef(0);

  // --- Persistencia ---
  // Devuelve true si el cambio se guardó; en caso contrario muestra el error.
  async function persist(method: string, url: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, { method, headers: HEADERS, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "No se pudo guardar el cambio.");
        return false;
      }
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
      return false;
    }
  }

  // Persiste y, si falla, re-sincroniza desde la BD para no dejar la UI con un
  // cambio optimista que no se guardó.
  async function persistOrResync(method: string, url: string, body: unknown) {
    const ok = await persist(method, url, body);
    if (!ok) await loadMonth(s.year, s.month);
  }

  async function loadMonth(year: number, month: number) {
    const reqId = ++reqIdRef.current;
    setBusy(true);
    setMenu(null);
    try {
      const res = await fetch(`/api/plan?year=${year}&month=${month}`);
      const data = await res.json();
      // Ignora la respuesta si ya se lanzó otra carga más reciente.
      if (reqId !== reqIdRef.current) return;
      if (res.ok) {
        setS(data as PlanState);
        setStale(false);
        setError(null);
      } else {
        setError(data.error || "No se pudo cargar el mes.");
      }
    } catch (e) {
      if (reqId === reqIdRef.current) {
        setError(e instanceof Error ? e.message : "Error de red.");
      }
    } finally {
      if (reqId === reqIdRef.current) setBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    if (busy) return;
    let m = s.month + delta;
    let y = s.year;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    void loadMonth(y, m);
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setMenu(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ year: s.year, month: s.month }),
      });
      const data = await res.json();
      if (res.ok) {
        setS(data as PlanState);
        setStale(false);
        setError(null);
      } else {
        setError(data.error || "No se pudo generar la asignación.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setBusy(false);
    }
  }

  function clearMonth() {
    if (busy) return;
    setMenu(null);
    setS((prev) => {
      const schedule: Schedule = {};
      prev.isos.forEach((iso) => (schedule[iso] = {}));
      return { ...prev, schedule };
    });
    setStale(true);
    void persistOrResync("POST", "/api/clear", { year: s.year, month: s.month });
  }

  function incCourse(iso: string, shift: "am" | "pm", delta: number) {
    if (busy) return;
    const cur = s.courses[iso] ?? { am: 3, pm: 2 };
    const nv = Math.max(0, Math.min(20, cur[shift] + delta));
    if (nv === cur[shift]) return;
    setS((prev) => {
      const c = prev.courses[iso] ?? { am: 3, pm: 2 };
      return { ...prev, courses: { ...prev.courses, [iso]: { ...c, [shift]: nv } } };
    });
    setStale(true);
    void persistOrResync("PUT", "/api/courses", { year: s.year, month: s.month, date: iso, shift, value: nv });
  }

  function toggleQuincena(iso: string) {
    if (busy) return;
    const nv = !s.quincena[iso];
    setS((prev) => ({ ...prev, quincena: { ...prev.quincena, [iso]: nv } }));
    setStale(true);
    void persistOrResync("PUT", "/api/quincena", { year: s.year, month: s.month, date: iso, value: nv });
  }

  function setCell(iso: string, pid: string, code: ShiftCode) {
    if (busy) return;
    setS((prev) => ({
      ...prev,
      schedule: { ...prev.schedule, [iso]: { ...(prev.schedule[iso] || {}), [pid]: code } },
    }));
    setMenu(null);
    void persistOrResync("PUT", "/api/cell", { year: s.year, month: s.month, date: iso, personId: pid, code });
  }

  function openMenu(e: MouseEvent, iso: string, pid: string) {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    const w = window.innerWidth || 1200;
    const h = window.innerHeight || 800;
    const x = Math.max(8, Math.min(e.clientX, w - 198));
    const y = Math.max(8, Math.min(e.clientY, h - 214));
    setMenu({ x, y, iso, personId: pid });
  }

  // --- Valores derivados (validación instantánea) ---
  const numPeople = s.people.length;
  const needs = s.isos.map((iso) => needsFor(s.courses[iso] ?? { am: 3, pm: 2 }, s.params, numPeople));
  const qFlags = s.isos.map((iso) => !!s.quincena[iso]);
  const ev = evaluate(s.schedule, s.isos, needs, qFlags, s.people);
  const per = s.params.coursesPerExtra;
  const base = s.params.baseStaff;

  const statSat = s.isos.length;
  const statQuincena = qFlags.filter(Boolean).length;
  let satisfied = 0;
  s.people.forEach((p) => {
    const c = ev.personCompliance[p.id];
    satisfied += (c.libre ? 1 : 0) + (c.completo ? 1 : 0) + (c.am ? 1 : 0) + (c.pm ? 1 : 0);
  });
  const compPct = numPeople ? Math.round((100 * satisfied) / (numPeople * 4)) : 0;
  const errCount = ev.alerts.filter((a) => a.severity === "error").length;
  const statAlertColor = ev.alerts.length === 0 ? "#067647" : errCount > 0 ? "#B42318" : "#B54708";

  const valBase: CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1,
    marginTop: 7,
  };
  const codeOf = (iso: string, pid: string): ShiftCode => (s.schedule[iso] && s.schedule[iso][pid]) || "L";

  const gridCols = `190px repeat(${s.isos.length}, minmax(116px,1fr)) 188px`;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 90px" }} onClick={() => menu && setMenu(null)}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#4338CA", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(67,56,202,.35)" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="3"></rect>
                <path d="M3 9h18M8 2v4M16 2v4"></path>
              </svg>
            </div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>Planificador de Sábados</h1>
          </div>
          <p style={{ margin: "9px 0 0", color: "#667085", fontSize: 13.5, maxWidth: 580, lineHeight: 1.5 }}>
            Simula los cursos de cada turno y genera la asignación automáticamente respetando todas las reglas del equipo.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #E4E7EC", borderRadius: 10, padding: 4 }}>
            <button className="icon-btn" onClick={() => shiftMonth(-1)} disabled={busy} style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 7, cursor: busy ? "default" : "pointer", fontSize: 19, color: "#475467", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <div style={{ minWidth: 132, textAlign: "center", fontWeight: 600, fontSize: 13.5 }}>{monthLabel(s.year, s.month)}</div>
            <button className="icon-btn" onClick={() => shiftMonth(1)} disabled={busy} style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 7, cursor: busy ? "default" : "pointer", fontSize: 19, color: "#475467", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>
          <button className="btn-soft" onClick={clearMonth} disabled={busy} style={{ background: "#fff", border: "1px solid #E4E7EC", color: "#475467", borderRadius: 10, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>Limpiar</button>
          <button className="btn-primary" onClick={generate} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#4338CA", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: busy ? "wait" : "pointer", boxShadow: "0 2px 6px rgba(67,56,202,.3)", opacity: busy ? 0.7 : 1 }}>
            {stale && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FDB022", boxShadow: "0 0 0 3px rgba(253,176,34,.3)" }}></span>}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path>
              <path d="M21 3v5h-5"></path>
            </svg>
            {busy ? "Generando…" : "Generar asignación"}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "#FEF3F2", border: "1px solid #FECDCA", color: "#B42318", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Sábados" value={String(statSat)} sub="en el mes" />
        <StatCard label="Quincenas" value={String(statQuincena)} sub="requieren contabilidad" valueColor="#6D28D9" />
        <div style={statCardWrap}>
          <div style={statLabel}>Cumplimiento</div>
          <div style={{ ...valBase, color: compPct >= 100 ? "#067647" : "#B54708" }}>{compPct}%</div>
          <div style={statSub}>requisitos del mes</div>
        </div>
        <div style={statCardWrap}>
          <div style={statLabel}>Alertas</div>
          <div style={{ ...valBase, color: statAlertColor }}>{ev.alerts.length}</div>
          <div style={statSub}>{ev.alerts.length === 0 ? "sin alertas" : "por revisar"}</div>
        </div>
      </section>

      {/* Simulación de cursos */}
      <section style={cardWrap}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"></path>
              <path d="M7 14l4-4 3 3 5-6"></path>
            </svg>
            <h2 style={h2}>Simulación de cursos</h2>
          </div>
          <span style={{ fontSize: 11.5, color: "#667085", fontFamily: "'IBM Plex Mono', monospace", background: "#F8FAFC", border: "1px solid #EAECF0", padding: "4px 9px", borderRadius: 7 }}>
            {`Personal = ${base} + 1 por cada ${per} curso${per > 1 ? "s" : ""} · mín. 2`}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(92px,0.8fr) 1.2fr 1.2fr 1fr 0.9fr", gap: 10, padding: "0 4px 8px", fontSize: 10.5, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".04em" }}>
          <span>Sábado</span>
          <span>Cursos a.m.</span>
          <span>Cursos p.m.</span>
          <span>Personal req.</span>
          <span style={{ textAlign: "right" }}>Quincena</span>
        </div>
        {s.isos.map((iso, i) => {
          const courses = s.courses[iso] ?? { am: 3, pm: 2 };
          return (
            <div key={iso} style={{ display: "grid", gridTemplateColumns: "minmax(92px,0.8fr) 1.2fr 1.2fr 1fr 0.9fr", gap: 10, alignItems: "center", padding: "9px 4px", borderTop: "1px solid #F2F4F7" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 600 }}>{dayNumOf(iso)}</span>
                <span style={{ fontSize: 10, color: "#98A2B3", fontWeight: 600, textTransform: "uppercase" }}>Sáb</span>
              </div>
              <Stepper value={courses.am} onDec={() => incCourse(iso, "am", -1)} onInc={() => incCourse(iso, "am", 1)} />
              <Stepper value={courses.pm} onDec={() => incCourse(iso, "pm", -1)} onInc={() => incCourse(iso, "pm", 1)} />
              <div style={{ display: "flex", gap: 5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", background: "#FEF3C7", color: "#92400E" }}>a.m. {needs[i].am}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", background: "#DBEAFE", color: "#1D4ED8" }}>p.m. {needs[i].pm}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => toggleQuincena(iso)} style={quincenaPillStyle(qFlags[i])}>{qFlags[i] ? "Quincena" : "Normal"}</button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Asignación de turnos */}
      <section style={cardWrap}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <h2 style={h2}>Asignación de turnos</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Legend color="#FEF3C7" border="#FCD34D" label="a.m." />
            <Legend color="#DBEAFE" border="#93C5FD" label="p.m." />
            <Legend color="#D1FAE5" border="#6EE7B7" label="Completo" />
            <Legend color="#F1F5F9" border="#CBD5E1" dashed label="Libre" />
          </div>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#98A2B3" }}>Haz clic en cualquier turno para cambiarlo manualmente. La validación se actualiza al instante.</p>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 780 }}>
            {/* cabecera */}
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, alignItems: "end", padding: "0 4px 12px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".04em", paddingLeft: 4 }}>Colaborador</div>
              {s.isos.map((iso, i) => {
                const cov = ev.coverage[iso];
                const amOk = cov.am.ok && cov.am.vendedor && (!qFlags[i] || cov.caAm) && (!qFlags[i] || cov.contabOk);
                const pmOk = cov.pm.ok && cov.pm.vendedor && (!qFlags[i] || cov.caPm) && (!qFlags[i] || cov.contabOk);
                return (
                  <div key={iso} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 2 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".05em" }}>Sáb</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 600 }}>{dayNumOf(iso)}</span>
                    </div>
                    {qFlags[i] && <span style={{ fontSize: 8.5, fontWeight: 600, color: "#6D28D9", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "1px 6px", borderRadius: 5, letterSpacing: ".03em" }}>QUINCENA</span>}
                    <div style={{ display: "flex", gap: 4 }}>
                      <span style={needBadgeStyle("AM", amOk || needs[i].am === 0)}>a.m. {needs[i].am}</span>
                      <span style={needBadgeStyle("PM", pmOk || needs[i].pm === 0)}>p.m. {needs[i].pm}</span>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".04em" }}>Requisitos / mes</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, width: "100%" }}>
                  <span style={reqHeadCell}>Libre</span>
                  <span style={reqHeadCell}>Compl</span>
                  <span style={reqHeadCell}>a.m.</span>
                  <span style={reqHeadCell}>p.m.</span>
                </div>
              </div>
            </div>
            {/* filas por persona */}
            {s.people.map((p) => {
              const role = s.roles[p.role];
              const c = ev.personCompliance[p.id];
              const reqs: Array<{ key: string; full: string; ok: boolean }> = [
                { key: "L", full: "Exactamente 1 sábado libre", ok: c.libre },
                { key: "C", full: "Exactamente 1 sábado completo", ok: c.completo },
                { key: "AM", full: "Turno a.m.", ok: c.am },
                { key: "PM", full: "Turno p.m.", ok: c.pm },
              ];
              return (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, alignItems: "center", padding: "7px 4px", borderTop: "1px solid #F2F4F7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 2 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flex: "0 0 auto", background: role?.color_bg ?? "#EEE", color: role?.color_fg ?? "#333" }}>{p.name[0]}</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 600, marginTop: 3, background: role?.color_bg ?? "#EEE", color: role?.color_fg ?? "#333" }}>{role?.label ?? p.role}</span>
                    </div>
                  </div>
                  {s.isos.map((iso) => {
                    const code = codeOf(iso, p.id);
                    const meta = s.shiftCodes[code];
                    return (
                      <button key={iso} className="cell" onClick={(e) => openMenu(e, iso, p.id)} style={cellStyle(code)}>
                        <span>{meta?.label ?? code}</span>
                        {meta?.sub ? <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.78, fontFamily: "'IBM Plex Mono', monospace" }}>{meta.sub}</span> : null}
                      </button>
                    );
                  })}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
                    {reqs.map((r) => (
                      <div key={r.key} style={reqStyle(r.ok)} title={r.full}>{r.ok ? "✓" : "✗"}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Validación + Cobertura */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Validación de reglas */}
        <div style={cardWrap}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4"></path>
              <path d="M21 12c0 1.66-4 7-9 7s-9-5.34-9-7 4-7 9-7 9 5.34 9 7Z"></path>
            </svg>
            <h2 style={h2}>Validación de reglas</h2>
          </div>
          {ev.alerts.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 14, borderRadius: 11, background: "#ECFDF3", border: "1px solid #A6F4C5" }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "#067647", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#054F31" }}>Todo cumple las reglas del mes</div>
                <div style={{ fontSize: 12, color: "#067647", marginTop: 1 }}>Cobertura, roles, quincenas y requisitos individuales correctos.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 430, overflowY: "auto" }}>
              {ev.alerts.map((a, idx) => (
                <div key={idx + "-" + a.title} style={alertBoxStyle(a.severity)}>
                  <span style={alertDotStyle(a.severity)}></span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#101828" }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: "#667085", marginTop: 1, lineHeight: 1.4 }}>{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cobertura por sábado */}
        <div style={cardWrap}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="3"></rect>
              <path d="M3 10h18M8 2v4M16 2v4"></path>
            </svg>
            <h2 style={h2}>Cobertura por sábado</h2>
          </div>
          <div style={{ maxHeight: 430, overflowY: "auto" }}>
            {s.isos.map((iso, i) => {
              const cov = ev.coverage[iso];
              const need = needs[i];
              const q = qFlags[i];
              const shifts = [
                { key: "am", name: "Mañana", sc: cov.am, vendedor: cov.am.vendedor, ca: cov.caAm, showCa: q && need.am > 0 },
                { key: "pm", name: "Tarde", sc: cov.pm, vendedor: cov.pm.vendedor, ca: cov.caPm, showCa: q && need.pm > 0 },
              ];
              const showContab = q && (need.am > 0 || need.pm > 0);
              return (
                <div key={iso} style={{ padding: "11px 0", borderTop: "1px solid #F2F4F7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600 }}>{dateLabel(iso)}</span>
                    {q && <span style={{ fontSize: 9, fontWeight: 600, color: "#6D28D9", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "1px 6px", borderRadius: 5 }}>QUINCENA</span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {shifts.map((sh) => {
                      const closed = sh.sc.need === 0;
                      const understaffed = sh.sc.present < sh.sc.need;
                      return (
                        <div key={sh.key} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ width: 52, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>{sh.name}</span>
                          {closed ? (
                            <span style={countStyle(true, false)}>cerrado</span>
                          ) : (
                            <>
                              <span style={countStyle(!understaffed, true)}>{sh.sc.present}/{sh.sc.need} pax</span>
                              <span style={tagStyle(sh.vendedor)}>{(sh.vendedor ? "✓" : "✗") + " Vendedor"}</span>
                              {sh.showCa && <span style={tagStyle(sh.ca)}>{(sh.ca ? "✓" : "✗") + " César/Alejandra"}</span>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {showContab && (
                    <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={tagStyle(cov.contabOk)}>{(cov.contabOk ? "✓" : "✗") + " Contabilidad presente"}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Menú contextual */}
      {menu && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 55 }}></div>
          <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 60 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 13, boxShadow: "0 14px 36px rgba(16,24,40,.2)", padding: 6, width: 188, animation: "popIn .12s ease" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase", letterSpacing: ".05em", padding: "7px 8px 5px" }}>Asignar turno</div>
              {CODE_ORDER.map((code) => {
                const meta = s.shiftCodes[code];
                return (
                  <button key={code} className="menu-opt" onClick={() => setCell(menu.iso, menu.personId, code)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 9, border: "1px solid #fff", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#101828" }}>
                    <span style={swatchStyle(code)}></span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span>{meta?.label ?? code}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: "#98A2B3", fontFamily: "'IBM Plex Mono', monospace" }}>{meta?.sub || "Día de descanso"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Subcomponentes / estilos compartidos ----------------------------------
const statCardWrap: CSSProperties = {
  background: "#fff",
  border: "1px solid #EAECF0",
  borderRadius: 13,
  padding: "15px 16px",
  boxShadow: "0 1px 2px rgba(16,24,40,.04)",
};
const statLabel: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#667085" };
const statSub: CSSProperties = { fontSize: 11, color: "#98A2B3", marginTop: 4 };
const cardWrap: CSSProperties = {
  background: "#fff",
  border: "1px solid #EAECF0",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 1px 2px rgba(16,24,40,.04)",
  marginBottom: 16,
};
const h2: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const reqHeadCell: CSSProperties = { textAlign: "center", fontSize: 9, color: "#98A2B3", fontWeight: 600 };

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={statCardWrap}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600, lineHeight: 1, marginTop: 7, color: valueColor }}>{value}</div>
      <div style={statSub}>{sub}</div>
    </div>
  );
}

function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button className="stepper-btn" onClick={onDec} style={stepBtn}>−</button>
      <span style={{ minWidth: 24, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600 }}>{value}</span>
      <button className="stepper-btn" onClick={onInc} style={stepBtn}>+</button>
    </div>
  );
}
const stepBtn: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: "1px solid #E4E7EC",
  background: "#fff",
  color: "#475467",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

function Legend({ color, border, label, dashed }: { color: string; border: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>
      <span style={{ width: 13, height: 13, borderRadius: 4, background: color, border: (dashed ? "1px dashed " : "1px solid ") + border }}></span>
      {label}
    </span>
  );
}
