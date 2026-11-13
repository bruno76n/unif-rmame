/**
 * La pestaña Rendimiento: el cajón de una prenda (`?cajon=rendimiento&id={producto}`) va en la dirección.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Rendimiento»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaRendimiento } from "../../departamentos/patronaje/pestanas/rendimiento.tsx";

export const Route = createFileRoute("/patronaje/rendimiento")({ component: PestanaRendimiento });
