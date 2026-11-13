/**
 * La pestaña Por revisar: la revisión de un lote (`?lote=`) va en la dirección.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Por revisar» y «Revisión de un lote»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaPorRevisar } from "../../departamentos/calidad/pestanas/por-revisar.tsx";

export const Route = createFileRoute("/calidad/por-revisar")({ component: PestanaPorRevisar });
