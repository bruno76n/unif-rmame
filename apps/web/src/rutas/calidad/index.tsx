/**
 * Pendientes de Calidad, la primera pestaña: el filtro (`?grupo=`) y la ventana de una devolución
 * (`?cajon=devolucion&id=`) van en la dirección.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaPendientes } from "../../departamentos/calidad/pestanas/pendientes.tsx";

export const Route = createFileRoute("/calidad/")({ component: PestanaPendientes });
