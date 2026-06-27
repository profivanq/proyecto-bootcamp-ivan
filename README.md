# Planificador de Sábados — Next.js + Neon (Postgres)

Aplicación para planificar los **turnos de los sábados** de un equipo: simula los
cursos de cada turno, calcula el personal requerido, genera la asignación
automáticamente respetando las reglas (cobertura, vendedor por turno, quincenas
con contabilidad, y requisitos por persona) y valida todo en tiempo real.

Originalmente era un único archivo HTML con los datos en `localStorage`. Ahora es
una app **Next.js 16 (App Router)** en TypeScript, con los datos persistidos en
**PostgreSQL (Neon)**.

> El HTML original se conserva como referencia en
> [`legacy/planificador-original.html`](legacy/planificador-original.html).

---

## 🧱 Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **PostgreSQL (Neon)** vía `@neondatabase/serverless` (driver HTTP, ideal para serverless/Vercel)
- Desplegable en **Vercel** sin configuración extra

## 📂 Estructura

```
app/
  layout.tsx            Layout raíz (fuentes, metadata)
  page.tsx              Server Component: carga el estado desde la BD
  globals.css           Estilos globales
  components/Planner.tsx Componente cliente: UI + interacciones + validación
  api/
    plan/route.ts       GET  estado del mes (genera si está vacío)
    generate/route.ts   POST regenera la asignación
    courses/route.ts    PUT  actualiza cursos a.m./p.m.
    quincena/route.ts   PUT  marca/desmarca quincena
    cell/route.ts       PUT  asigna un turno a una persona
    clear/route.ts      POST limpia el mes
lib/
  planner.ts            Lógica pura (dotación, quincena, validación, generación)
  types.ts              Tipos del dominio
  db.ts                 Cliente Neon (conexión perezosa)
  queries.ts            Acceso a datos (solo servidor)
  ui.ts                 Colores de turnos
  http.ts               Helpers de las rutas API
db/
  schema.sql            Tablas (roles, people, shift_codes, plans, plan_saturdays, assignments)
  seed.sql              Datos demo (roles, códigos de turno, 6 colaboradores)
scripts/
  migrate.mjs           Crea las tablas y carga los datos demo
```

## 🗃️ Modelo de datos

| Tabla            | Qué guarda                                                        |
| ---------------- | ----------------------------------------------------------------- |
| `roles`          | Roles del equipo (ventas, soporte, contabilidad, administrativo)  |
| `shift_codes`    | Códigos de turno: `L` (libre), `AM`, `PM`, `C` (completo)         |
| `people`         | Colaboradores (id, nombre, rol)                                   |
| `plans`          | Un mes a planificar (año, mes, parámetros de dotación)            |
| `plan_saturdays` | Cada sábado del mes: cursos a.m./p.m. + si es quincena            |
| `assignments`    | El turno asignado a cada persona en cada sábado                  |

---

## 🚀 Puesta en marcha

### 1) Requisitos

- Node.js 18.18+ (recomendado 20 o 24 LTS) y npm.

### 2) Instalar dependencias

```bash
npm install
```

### 3) Crear la base de datos en Neon (desde Vercel)

1. Entra a tu proyecto en **[vercel.com](https://vercel.com)** → pestaña **Storage**.
2. **Create Database → Postgres (Neon)** → elige región y crea.
3. Vercel inyecta automáticamente las variables (`POSTGRES_URL`, `DATABASE_URL`, …)
   en el proyecto. En **Storage → tu base de datos → `.env.local`** puedes copiar
   la cadena de conexión.

> ¿Prefieres la integración nativa de Neon? En **Vercel → Integrations →
> Marketplace → Neon**, conéctala y se añadirá `DATABASE_URL`. La app acepta
> ambas variables.

### 4) Configurar el entorno local

```bash
cp .env.example .env.local
# pega tu cadena real en DATABASE_URL (o POSTGRES_URL)
```

### 5) Crear las tablas y los datos demo

```bash
npm run db:migrate
```

### 6) Arrancar en desarrollo

```bash
npm run dev
# http://localhost:3000
```

---

## ☁️ Despliegue en Vercel

1. El repo ya está en GitHub. En Vercel: **Add New → Project → Import** el repo.
2. Framework: **Next.js** (autodetectado). No hace falta tocar build/output.
3. Asegúrate de tener la base de datos creada (paso 3) en el **mismo proyecto**
   para que las variables de entorno estén disponibles.
4. **Deploy**. Tras el primer despliegue, ejecuta la migración una vez:
   - localmente con `.env.local` apuntando a la BD de producción, o
   - con la CLI de Vercel: `vercel env pull .env.local && npm run db:migrate`.

> La página y las rutas API son **dinámicas** (`force-dynamic`): no se
> prerenderizan en build, así que el build de Vercel no necesita la base de datos.

---

## ✅ Reglas del planificador (resumen)

- **Dotación**: `personal = base + ⌈cursos / N⌉`, mínimo 2, tope = nº de colaboradores.
- **Cobertura**: cada turno activo necesita el personal requerido.
- **Vendedor**: todo turno activo debe incluir al menos una persona de _ventas_.
- **Quincena**: debe estar presente _contabilidad_ y cada turno debe incluir a
  _César_ o _Alejandra_.
- **Por persona/mes**: exactamente 1 sábado libre, 1 completo, y al menos un turno
  a.m. y uno p.m.

## 📜 Scripts

| Script              | Acción                                          |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo                          |
| `npm run build`     | Build de producción                             |
| `npm run start`     | Sirve el build                                  |
| `npm run typecheck` | Verifica tipos sin compilar                     |
| `npm run db:migrate`| Crea tablas + carga datos demo                  |
| `npm run db:seed`   | Solo recarga/actualiza los datos demo           |
