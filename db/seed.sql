-- ============================================================================
-- Datos semilla (demo) del Planificador de Sábados.
-- Idempotente: usa ON CONFLICT para poder re-ejecutarse sin duplicar.
-- ============================================================================

-- Roles (con sus colores de interfaz)
INSERT INTO roles (id, label, color_fg, color_bg, sort_order) VALUES
  ('ventas',         'Ventas',         '#6D28D9', '#F5F3FF', 1),
  ('soporte',        'Soporte',        '#0E7490', '#ECFEFF', 2),
  ('contabilidad',   'Contabilidad',   '#BE185D', '#FCE7F3', 3),
  ('administrativo', 'Administrativo', '#B45309', '#FFF7ED', 4)
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label,
      color_fg = EXCLUDED.color_fg,
      color_bg = EXCLUDED.color_bg,
      sort_order = EXCLUDED.sort_order;

-- Códigos de turno
INSERT INTO shift_codes (code, label, sub, sort_order) VALUES
  ('L',  'Libre',    '',            1),
  ('AM', 'a.m.',     '8:00–13:00',  2),
  ('PM', 'p.m.',     '12:00–17:00', 3),
  ('C',  'Completo', '8:00–17:00',  4)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      sub = EXCLUDED.sub,
      sort_order = EXCLUDED.sort_order;

-- Colaboradores demo (mismos ids/roles que la versión original).
-- Los ids 'cesar', 'alejandra' y 'jocelyn' se usan en las reglas de quincena.
INSERT INTO people (id, name, role_id, sort_order) VALUES
  ('natalie',   'Natalie',   'ventas',         1),
  ('alexandra', 'Alexandra', 'ventas',         2),
  ('manuela',   'Manuela',   'ventas',         3),
  ('cesar',     'César',     'soporte',        4),
  ('jocelyn',   'Jocelyn',   'contabilidad',   5),
  ('alejandra', 'Alejandra', 'administrativo', 6)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      role_id = EXCLUDED.role_id,
      sort_order = EXCLUDED.sort_order;
