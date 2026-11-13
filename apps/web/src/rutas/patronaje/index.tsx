/**
 * Pendientes de Patronaje, la primera pestaña: el filtro (`?grupo=`) y los cajones (`?cajon=…&id=`) van en la
 * dirección.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaPendientes } from "../../departamentos/patronaje/pestanas/pendientes.tsx";

export const Route = createFileRoute("/patronaje/")({ component: PestanaPendientes });
