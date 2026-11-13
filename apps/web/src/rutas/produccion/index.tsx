/**
 * Pendientes de Producción, la primera pestaña: el filtro (`?grupo=`) y el cajón del lote (`?cajon=lote&id=`) van en la
 * dirección.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaPendientes } from "../../departamentos/produccion/pestanas/pendientes.tsx";

export const Route = createFileRoute("/produccion/")({ component: PestanaPendientes });
