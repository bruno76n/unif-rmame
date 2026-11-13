/**
 * La pestaña Reclamos: el reclamo escogido (`?reclamo=`) y lo que se busca (`?buscar=`) van en la dirección.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Reclamos»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaReclamos } from "../../departamentos/calidad/pestanas/reclamos.tsx";

export const Route = createFileRoute("/calidad/reclamos")({ component: PestanaReclamos });
