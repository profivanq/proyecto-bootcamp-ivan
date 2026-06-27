import Planner from "./components/Planner";
import { getPlanStateEnsured } from "@/lib/queries";
import type { PlanState } from "@/lib/types";

// La página consulta la base de datos en cada petición; no se pre-renderiza.
export const dynamic = "force-dynamic";

export default async function Page() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = enero

  let initial: PlanState | null = null;
  let dbError: string | null = null;
  try {
    initial = await getPlanStateEnsured(year, month);
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Error de base de datos";
  }

  if (!initial) {
    return <SetupNotice message={dbError} />;
  }
  return <Planner initial={initial} />;
}

function SetupNotice({ message }: { message: string | null }) {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "64px 24px",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        color: "#101828",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #EAECF0",
          borderRadius: 14,
          padding: 28,
          boxShadow: "0 1px 2px rgba(16,24,40,.04)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>
          Planificador de Sábados
        </h1>
        <p style={{ margin: "0 0 16px", color: "#667085", fontSize: 14, lineHeight: 1.5 }}>
          La base de datos todavía no está configurada o no se pudo conectar. Sigue
          estos pasos:
        </p>
        <ol style={{ margin: "0 0 16px 18px", color: "#475467", fontSize: 14, lineHeight: 1.7 }}>
          <li>Crea una base de datos Postgres (Vercel → Storage → Neon).</li>
          <li>
            Copia la variable <code>DATABASE_URL</code> (o <code>POSTGRES_URL</code>) a{" "}
            <code>.env.local</code>.
          </li>
          <li>
            Ejecuta <code>npm run db:migrate</code> para crear las tablas y los datos
            demo.
          </li>
        </ol>
        {message && (
          <pre
            style={{
              background: "#FEF3F2",
              color: "#B42318",
              border: "1px solid #FECDCA",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              margin: 0,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {message}
          </pre>
        )}
      </div>
    </main>
  );
}
