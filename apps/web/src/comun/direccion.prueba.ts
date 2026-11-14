/**
 * Prueba de la dirección común de los departamentos, sin navegador: el enrutador con una historia en memoria, y la
 * pantalla dibujada una vez para leer lo que dan los hooks. Cambiar unos parámetros conserva los demás en la misma
 * pestaña, vacío quita uno, otra pestaña empieza de cero, `reemplazar` no deja paso en el historial y la búsqueda con
 * esquema solo lee lo que cumple.
 * Fase 19 · docs/fases/19-web-principal.md («Construye»: la convención de la dirección para pestañas, filtros y
 * cajones; «Un cajón de otro departamento se abre por su dirección») y docs/interfaz/comunes.md («La página de un
 * departamento», regla 2)
 */

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	direccionCon,
	direccionTrasCambios,
	juntarBusqueda,
	useBusquedaDeDepartamento,
	useDireccionDeDepartamento,
} from "./direccion.ts";

/** El esquema de la búsqueda del departamento de prueba. */
const busquedaDePrueba = z.object({
	cajon: z.enum(["lote"]).optional().catch(undefined),
	id: z.uuid().optional().catch(undefined),
	anio: z.coerce.number().int().optional().catch(undefined),
	buscar: z.string().optional().catch(undefined),
});

/** Un id de prueba. */
const id = "0196f8a0-0000-7000-8000-000000000001";

/** Lo que dieron los hooks la última vez que se dibujó la pantalla. */
let conParametros: ReturnType<typeof useDireccionDeDepartamento<"grupo" | "cajon" | "id">>;
let conEsquema: ReturnType<typeof useBusquedaDeDepartamento<z.output<typeof busquedaDePrueba>, "pendientes" | "lotes">>;

/** La pantalla de prueba: solo guarda lo que dan los hooks. */
function Pantalla() {
	conParametros = useDireccionDeDepartamento<"grupo" | "cajon" | "id">();
	conEsquema = useBusquedaDeDepartamento(busquedaDePrueba, (pestana: "pendientes" | "lotes") =>
		pestana === "pendientes" ? "/prueba" : `/prueba/${pestana}`,
	);
	return null;
}

/**
 * Levanta el enrutador en una dirección, con las rutas `/prueba` y `/prueba/lotes`, y dibuja la pantalla una vez, como
 * lo haría el servidor. Después el enrutador navega como en el navegador, sobre su historia en memoria.
 * @param direccion La dirección con que empieza.
 * @returns El enrutador y `donde()`, la dirección a la que llegó.
 */
async function enLaDireccion(direccion: string) {
	const raiz = createRootRoute({ component: Outlet });
	const rutas = ["/prueba", "/prueba/lotes"].map((path) =>
		createRoute({ getParentRoute: () => raiz, path, component: Pantalla }),
	);
	const router = createRouter({
		routeTree: raiz.addChildren(rutas),
		history: createMemoryHistory({ initialEntries: [direccion] }),
	});
	await router.load();
	renderToString(createElement(RouterProvider, { router }));
	// El enrutador del servidor no navega: ya dibujada la pantalla, navega como el del navegador.
	router.update({ ...router.options, isServer: false, origin: "http://localhost" });
	return { router, donde: () => router.history.location.href };
}

describe("La convención de la dirección: las pestañas, los filtros y el cajón viven en ella", () => {
	it("juntarBusqueda: lo que cambia gana y lo vacío se quita", () => {
		expect(juntarBusqueda({ grupo: "lotes", cajon: "lote", id }, { cajon: undefined, id: "", buscar: "A-1" })).toEqual({
			grupo: "lotes",
			buscar: "A-1",
		});
	});

	it("direccionCon: sin parámetros con valor, solo la ruta", () => {
		expect(direccionCon("/prueba", { grupo: undefined, buscar: "" })).toBe("/prueba");
		expect(direccionCon("/prueba", { grupo: "lotes", buscar: "a b" })).toBe("/prueba?grupo=lotes&buscar=a+b");
	});

	it("direccionTrasCambios: en la misma ruta se quedan los demás; en otra, empiezan de cero", () => {
		expect(direccionTrasCambios("/prueba", "grupo=lotes", { cajon: "lote", id })).toBe(
			`/prueba?grupo=lotes&cajon=lote&id=${id}`,
		);
		expect(direccionTrasCambios("/prueba", "grupo=lotes", { grupo: "" })).toBe("/prueba");
		expect(direccionTrasCambios("/prueba", "grupo=lotes", { cajon: "lote" }, "/prueba/lotes")).toBe(
			"/prueba/lotes?cajon=lote",
		);
		expect(direccionTrasCambios("/prueba", "grupo=lotes", { cajon: "lote" }, "/prueba")).toBe(
			"/prueba?grupo=lotes&cajon=lote",
		);
	});

	it("useDireccionDeDepartamento: lee un parámetro, cambia varios, cambia de pestaña y reemplaza", async () => {
		const enPendientes = await enLaDireccion("/prueba?grupo=lotes");
		expect(conParametros.leer("grupo")).toBe("lotes");
		expect(conParametros.leer("cajon")).toBeUndefined();
		// Abrir un cajón conserva el filtro y deja su paso en el historial.
		conParametros.ir({ cajon: "lote", id });
		expect(enPendientes.donde()).toBe(`/prueba?grupo=lotes&cajon=lote&id=${id}`);
		expect(enPendientes.router.history.length).toBe(2);
		// Con el enlace se abre igual; cerrarlo con `reemplazar` no deja paso.
		const conCajon = await enLaDireccion(enPendientes.donde());
		expect(conParametros.leer("id")).toBe(id);
		conParametros.ir({ cajon: undefined, id: undefined }, undefined, true);
		expect(conCajon.donde()).toBe("/prueba?grupo=lotes");
		expect(conCajon.router.history.length).toBe(1);
		// Otra pestaña no se lleva el filtro ni el cajón.
		conParametros.ir({ grupo: "rechazos" }, "/prueba/lotes");
		expect(conCajon.donde()).toBe("/prueba/lotes?grupo=rechazos");
	});

	it("useBusquedaDeDepartamento: lee solo lo que cumple, junta los cambios y otra pestaña empieza de cero", async () => {
		const primera = await enLaDireccion("/prueba?cajon=otro&anio=2026&buscar=falda");
		// El cajón que no existe no se lee; el año llega como número.
		expect(conEsquema.busqueda).toEqual({ anio: 2026, buscar: "falda" });
		// `navegar` va por el enrutador, que escribe la dirección un momento después.
		conEsquema.navegar({ cajon: "lote", id, buscar: "" });
		await vi.waitFor(() => expect(primera.router.history.location.search).toContain("cajon=lote"));
		const segunda = await enLaDireccion(primera.donde());
		expect(segunda.router.state.location.pathname).toBe("/prueba");
		expect(conEsquema.busqueda).toEqual({ anio: 2026, cajon: "lote", id });
		conEsquema.navegar({ buscar: "short" }, "lotes");
		await vi.waitFor(() => expect(segunda.router.history.location.pathname).toBe("/prueba/lotes"));
		await enLaDireccion(segunda.donde());
		expect(conEsquema.busqueda).toEqual({ buscar: "short" });
	});
});
