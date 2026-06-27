import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planificador de Sábados",
  description:
    "Simula los cursos de cada turno y genera la asignación automáticamente respetando todas las reglas del equipo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
