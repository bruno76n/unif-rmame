/**
 * La pestaña Defectos.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Defectos»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaDefectos } from "../../departamentos/calidad/pestanas/defectos.tsx";

export const Route = createFileRoute("/calidad/defectos")({ component: PestanaDefectos });
