/**
 * Catálogo · Bitácora.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Bitácora»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaBitacora } from "../../departamentos/catalogo/pestanas/bitacora.tsx";

export const Route = createFileRoute("/catalogo/bitacora")({ component: PestanaBitacora });
