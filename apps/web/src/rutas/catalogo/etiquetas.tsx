/**
 * Catálogo · Etiquetas.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Etiquetas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaEtiquetas } from "../../departamentos/catalogo/pestanas/etiquetas.tsx";

export const Route = createFileRoute("/catalogo/etiquetas")({ component: PestanaEtiquetas });
