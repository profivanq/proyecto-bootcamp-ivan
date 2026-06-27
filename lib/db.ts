// Cliente de base de datos (Neon serverless, driver HTTP).
// Lee la cadena de conexión de las variables de entorno que inyecta Vercel
// Postgres (POSTGRES_URL) o la integración de Neon (DATABASE_URL). La conexión
// es perezosa: no se evalúa en tiempo de build, solo al ejecutar una consulta.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "Falta la cadena de conexión a Postgres. Define DATABASE_URL o POSTGRES_URL " +
        "(ver .env.example). En Vercel se inyecta automáticamente al crear la base de datos.",
    );
  }
  return url;
}

let _sql: NeonQueryFunction<false, false> | null = null;

/** Devuelve el cliente SQL de Neon (memoizado). Usar como tagged-template. */
export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(connectionString());
  return _sql;
}
