/**
 * Catálogo · Listas de precios.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Listas de precios»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaListasDePrecios } from "../../departamentos/catalogo/pestanas/listas-de-precios.tsx";

export const Route = createFileRoute("/catalogo/listas-de-precios")({ component: PestanaListasDePrecios });
