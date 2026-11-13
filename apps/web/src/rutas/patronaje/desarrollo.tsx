/**
 * La pestaña Desarrollo de producto: el cajón de un desarrollo (`?cajon=desarrollo&id={desarrollo}`) y la tarjeta
 * recién registrada (`?marcado=`) van en la dirección.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Desarrollo de producto»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaDesarrollo } from "../../departamentos/patronaje/pestanas/desarrollo.tsx";

export const Route = createFileRoute("/patronaje/desarrollo")({ component: PestanaDesarrollo });
