// ============================================================================
// Migración / seed de la base de datos.
//   node scripts/migrate.mjs              -> crea tablas + inserta datos demo
//   node scripts/migrate.mjs --seed-only  -> solo inserta/actualiza datos demo
//
// Lee la cadena de conexión de .env.local / .env (DATABASE_URL o POSTGRES_URL).
// ============================================================================

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

config({ path: ".env.local" });
config({ path: ".env" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!url) {
  console.error(
    "✗ Falta la cadena de conexión. Define DATABASE_URL o POSTGRES_URL en .env.local\n" +
      "  (ver .env.example). En Vercel se inyecta automáticamente al crear la base de datos.",
  );
  process.exit(1);
}

const sql = neon(url);
const seedOnly = process.argv.includes("--seed-only");

/**
 * Divide un archivo .sql en sentencias individuales (Neon HTTP ejecuta de a una).
 * Es consciente de comillas simples (incluido el escape '') y de comentarios
 * de línea '--', de modo que un ';' o '--' dentro de un literal no rompe la
 * división.
 */
function splitSql(text) {
  const statements = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next; // comilla escapada ('')
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "-" && next === "-") {
      // comentario de línea: saltar hasta el fin de línea
      while (i < text.length && text[i] !== "\n") i++;
      current += "\n";
      continue;
    }
    if (ch === ";") {
      statements.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

async function runFile(name) {
  const text = readFileSync(join(root, "db", name), "utf8");
  const stmts = splitSql(text);
  for (const stmt of stmts) {
    await sql.query(stmt);
  }
  console.log(`✓ ${name} — ${stmts.length} sentencias ejecutadas`);
}

async function main() {
  console.log("→ Conectando a Postgres…");
  if (!seedOnly) {
    await runFile("schema.sql");
  } else {
    console.log("· Modo --seed-only: se omite el esquema");
  }
  await runFile("seed.sql");
  console.log("✅ Base de datos lista.");
}

main().catch((e) => {
  console.error("✗ Error en la migración:", e?.message ?? e);
  process.exit(1);
});
