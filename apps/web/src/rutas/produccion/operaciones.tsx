/**
 * La pestaña Operaciones: los flujos y sus operaciones.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Operaciones»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaOperaciones } from "../../departamentos/produccion/pestanas/operaciones.tsx";

export const Route = createFileRoute("/produccion/operaciones")({ component: PestanaOperaciones });
