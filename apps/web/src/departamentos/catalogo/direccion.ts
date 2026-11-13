/**
 * La dirección de Catálogo: la pestaña es la ruta (`/catalogo/productos`) y los filtros y los cajones van en la
 * búsqueda, así un enlace abre la pantalla tal como estaba. Un cajón se abre con `?cajon=<nombre>&id=<id>` en cualquier
 * pestaña, como en todo el sistema: la ficha con `?cajon=producto&id=<producto_id>` y el alta con
 * `?cajon=nuevo_producto&origen=<catalogo|pedido|desarrollo>` (más `base`, `seccion_alta`, `cliente`, `desarrollo` y
 * `pedido`, el pedido al que regresa).
 * Fase 19 · docs/interfaz/fabrica/catalogo.md y .claude/rules/react.md (regla 5)
 */

import { getRouteApi, useRouter, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { rutaDePestana } from "../../comun/pagina-de-departamento.tsx";

/** Un texto de la dirección, si viene. */
const texto = z.string().optional().catch(undefined);

/** Todo lo que Catálogo pone en la búsqueda. */
export const busquedaDeCatalogo = z.object({
	// Pendientes
	grupo: z.enum(["todos", "productos", "etiquetas"]).optional().catch(undefined),
	// Productos, Listas de precios y Bitácora
	buscar: texto,
	seccion: texto,
	escuela: texto,
	estado: z.enum(["activos", "descontinuados", "todos"]).optional().catch(undefined),
	canal: z.enum(["mostrador", "en_linea", "externos"]).optional().catch(undefined),
	pildora: z.enum(["sin_foto", "sin_etiqueta", "sin_precio_cliente"]).optional().catch(undefined),
	vista: z.enum(["lista", "galeria"]).optional().catch(undefined),
	lista: texto,
	tipo: texto,
	// Etiquetas: el producto de «Por variante»
	etiquetas_de: texto,
	// Los cajones
	cajon: z.enum(["producto", "nuevo_producto"]).optional().catch(undefined),
	id: texto,
	origen: z.enum(["catalogo", "pedido", "desarrollo"]).optional().catch(undefined),
	base: texto,
	seccion_alta: texto,
	cliente: texto,
	desarrollo: texto,
	pedido: texto,
});

/** La búsqueda de Catálogo. */
export type BusquedaDeCatalogo = z.infer<typeof busquedaDeCatalogo>;

/** Las pestañas de Catálogo, en orden; la clave es su ruta. */
export const pestanasDeCatalogo = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "productos", texto: "Productos" },
	{ clave: "listas-de-precios", texto: "Listas de precios" },
	{ clave: "etiquetas", texto: "Etiquetas" },
	{ clave: "escuelas-y-tallas", texto: "Escuelas y tallas" },
	{ clave: "bitacora", texto: "Bitácora" },
] as const;

/** La clave de una pestaña de Catálogo. */
export type PestanaDeCatalogo = (typeof pestanasDeCatalogo)[number]["clave"];

/** Lo que dejan los cajones en la búsqueda: al cambiar de pestaña con un filtro nuevo, se conservan. */
const delCajon = ["cajon", "id", "origen", "base", "seccion_alta", "cliente", "desarrollo", "pedido"] as const;

/**
 * La dirección de una pestaña con su búsqueda.
 * @param pestana La pestaña.
 * @param busqueda Lo que va en la búsqueda; lo vacío no viaja.
 */
export function direccionDe(pestana: PestanaDeCatalogo, busqueda: BusquedaDeCatalogo): string {
	const parametros = new URLSearchParams();
	for (const [clave, valor] of Object.entries(busqueda)) {
		if (typeof valor === "string" && valor !== "") parametros.set(clave, valor);
	}
	const sufijo = parametros.size === 0 ? "" : `?${parametros.toString()}`;
	return `${rutaDePestana("catalogo", pestana)}${sufijo}`;
}

/** La ruta de Catálogo, para leer su búsqueda desde cualquier pestaña. */
const rutaDeCatalogo = getRouteApi("/catalogo");

/** Lee la búsqueda de Catálogo. */
export function useBusqueda(): BusquedaDeCatalogo {
	return rutaDeCatalogo.useSearch();
}

/** La pestaña que se ve, por la ruta. */
export function usePestana(): PestanaDeCatalogo {
	const ruta = useRouterState({ select: (estado) => estado.location.pathname });
	const clave = ruta.split("/")[2] ?? "";
	return pestanasDeCatalogo.find((pestana) => pestana.clave === clave)?.clave ?? "pendientes";
}

/**
 * Cambia la dirección de Catálogo: la búsqueda, la pestaña o las dos.
 * @returns `ir(cambios, pestana?)`: mezcla los cambios con la búsqueda de ahora (un `undefined` quita la llave). Si
 * cambia de pestaña, los filtros de la anterior no viajan; los cajones sí.
 */
export function useIr() {
	const router = useRouter();
	const busqueda = useBusqueda();
	const actual = usePestana();
	return (cambios: BusquedaDeCatalogo, pestana: PestanaDeCatalogo = actual) => {
		const base =
			pestana === actual
				? busqueda
				: Object.fromEntries(
						delCajon.map((clave) => [clave, busqueda[clave]]).filter(([, valor]) => valor !== undefined),
					);
		router.history.push(direccionDe(pestana, { ...base, ...cambios }));
	};
}

/** Lo que dejan los cajones vacío: cerrar uno quita todas sus llaves. */
export const sinCajon: BusquedaDeCatalogo = {
	cajon: undefined,
	id: undefined,
	origen: undefined,
	base: undefined,
	seccion_alta: undefined,
	cliente: undefined,
	desarrollo: undefined,
	pedido: undefined,
};

/**
 * La búsqueda que abre la ficha de un producto.
 * @param id El producto.
 */
export function conFicha(id: string): BusquedaDeCatalogo {
	return { ...sinCajon, cajon: "producto", id };
}

/**
 * La búsqueda que abre el alta desde Catálogo.
 * @param extra La sección o el producto base, si los hay.
 */
export function conAlta(extra: Pick<BusquedaDeCatalogo, "base" | "seccion_alta"> = {}): BusquedaDeCatalogo {
	return { ...sinCajon, cajon: "nuevo_producto", origen: "catalogo", ...extra };
}
