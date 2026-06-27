-- ============================================================================
-- Planificador de Sábados — Esquema de base de datos (PostgreSQL / Neon)
-- ============================================================================
-- Modela la lógica del planificador de turnos de sábados:
--   roles            -> tipos de colaborador (ventas, soporte, ...)
--   shift_codes      -> códigos de turno (L / AM / PM / C)
--   people           -> colaboradores del equipo
--   plans            -> un mes de planificación (año + mes + parámetros)
--   plan_saturdays   -> cada sábado del mes (cursos a.m./p.m. + flag quincena)
--   assignments      -> el turno asignado a cada persona en cada sábado
--
-- Es idempotente: se puede ejecutar varias veces sin error.
-- ============================================================================

-- Roles del equipo. fg/bg son los colores usados por la interfaz.
CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,                       -- 'ventas', 'soporte', ...
  label       TEXT    NOT NULL,
  color_fg    TEXT    NOT NULL,
  color_bg    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Códigos de turno. 'sub' es el rango horario mostrado bajo la etiqueta.
CREATE TABLE IF NOT EXISTS shift_codes (
  code        TEXT PRIMARY KEY,                       -- 'L', 'AM', 'PM', 'C'
  label       TEXT    NOT NULL,
  sub         TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Colaboradores. El 'id' es un slug estable (se usa en las reglas de negocio).
CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,                       -- 'natalie', 'cesar', ...
  name        TEXT    NOT NULL,
  role_id     TEXT    NOT NULL REFERENCES roles(id),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un plan = un mes concreto a planificar.
-- month sigue la convención de JavaScript Date: 0 = enero ... 11 = diciembre.
-- base_staff y courses_per_extra parametrizan la fórmula de dotación de personal.
CREATE TABLE IF NOT EXISTS plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year              INTEGER NOT NULL,
  month             INTEGER NOT NULL CHECK (month BETWEEN 0 AND 11),
  base_staff        INTEGER NOT NULL DEFAULT 1 CHECK (base_staff BETWEEN 1 AND 3),
  courses_per_extra INTEGER NOT NULL DEFAULT 2 CHECK (courses_per_extra BETWEEN 1 AND 6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

-- Cada sábado dentro de un plan, con sus cursos simulados y si es quincena.
CREATE TABLE IF NOT EXISTS plan_saturdays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID    NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  sat_date     DATE    NOT NULL,
  courses_am   INTEGER NOT NULL DEFAULT 3 CHECK (courses_am BETWEEN 0 AND 20),
  courses_pm   INTEGER NOT NULL DEFAULT 2 CHECK (courses_pm BETWEEN 0 AND 20),
  is_quincena  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (plan_id, sat_date)
);

-- El "schedule": un turno (code) por persona y por sábado.
CREATE TABLE IF NOT EXISTS assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_saturday_id UUID NOT NULL REFERENCES plan_saturdays(id) ON DELETE CASCADE,
  person_id        TEXT NOT NULL REFERENCES people(id)         ON DELETE CASCADE,
  code             TEXT NOT NULL REFERENCES shift_codes(code)  DEFAULT 'L',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_saturday_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_saturdays_plan ON plan_saturdays (plan_id);
CREATE INDEX IF NOT EXISTS idx_assignments_sat     ON assignments (plan_saturday_id);
CREATE INDEX IF NOT EXISTS idx_assignments_person  ON assignments (person_id);
CREATE INDEX IF NOT EXISTS idx_people_role         ON people (role_id);
