/**
 * La pestaña Lotes: el cajón del lote (`?lote=`) y el lote recién cortado (`?marcado=`) van en la dirección.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaLotes } from "../../departamentos/produccion/pestanas/lotes.tsx";

export const Route = createFileRoute("/produccion/lotes")({ component: PestanaLotes });
