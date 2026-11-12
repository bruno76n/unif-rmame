/**
 * La pestaña Producción por persona.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Producción por persona»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaPorPersona } from "../../departamentos/produccion/pestanas/por-persona.tsx";

export const Route = createFileRoute("/produccion/por-persona")({ component: PestanaPorPersona });
