/**
 * Catálogo · Pendientes, la primera pestaña.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaPendientes } from "../../departamentos/catalogo/pestanas/pendientes.tsx";

export const Route = createFileRoute("/catalogo/")({ component: PestanaPendientes });
