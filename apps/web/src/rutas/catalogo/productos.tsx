/**
 * Catálogo · Productos.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Productos»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaProductos } from "../../departamentos/catalogo/pestanas/productos.tsx";

export const Route = createFileRoute("/catalogo/productos")({ component: PestanaProductos });
