/**
 * La pestaña Órdenes de producción: el filtro (`?filtro=`), la tarjeta del pedido marcada (`?pedido=`) y el cajón del
 * lote (`?cajon=lote&id=`) van en la dirección.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Órdenes de producción»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaOrdenes } from "../../departamentos/produccion/pestanas/ordenes.tsx";

export const Route = createFileRoute("/produccion/ordenes")({ component: PestanaOrdenes });
