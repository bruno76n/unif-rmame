/**
 * La pestaña Corte: el lote escogido para cortar (`?cortar=`) va en la dirección.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Corte»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaCorte } from "../../departamentos/produccion/pestanas/corte.tsx";

export const Route = createFileRoute("/produccion/corte")({ component: PestanaCorte });
