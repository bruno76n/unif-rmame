/**
 * La pestaña Recetas: la búsqueda (`?buscar=`), la sección (`?seccion=`) y la página de una receta
 * (`?cajon=receta&id={producto}`, con `&version={n}` para una vieja) van en la dirección.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Recetas» y «La página de la receta»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PestanaRecetas } from "../../departamentos/patronaje/pestanas/recetas.tsx";

export const Route = createFileRoute("/patronaje/recetas")({ component: PestanaRecetas });
