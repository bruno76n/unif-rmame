/**
 * Catálogo · Escuelas y tallas.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Escuelas y tallas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaEscuelasYTallas } from "../../departamentos/catalogo/pestanas/escuelas-y-tallas.tsx";

export const Route = createFileRoute("/catalogo/escuelas-y-tallas")({ component: PestanaEscuelasYTallas });
