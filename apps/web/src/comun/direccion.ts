/**
 * La dirección de las pantallas de un departamento: lo que comparten todos para leerla y cambiarla. La pestaña es la
 * ruta, y los filtros y el cajón abierto van en la búsqueda (`?cajon=<nombre>&id=<id>`), así un enlace abre la pantalla
 * tal como estaba y otro departamento abre un cajón sin importar su componente. Cada `direccion.ts` de un departamento
 * pone encima solo sus rutas, sus parámetros (o el esquema Zod de su búsqueda) y lo suyo, como abrir y cerrar su cajón.
 * Fase 19 · .claude/rules/react.md (regla 5) y docs/interfaz/comunes.md («La página de un departamento», regla 2)
 */

import { useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { z } from "zod";

/**
 * Junta los cambios con la búsqueda de ahora: lo que se cambia gana, y lo que queda sin valor (`undefined` o vacío) se
 * quita.
 * @param actual La búsqueda de ahora (vacía si se cambia de pestaña).
 * @param cambios Lo que se cambia.
 * @returns La búsqueda nueva, solo con lo que tiene valor.
 * Es la única regla con que se cambia la dirección de cualquier departamento.
 */
export function juntarBusqueda<Valor>(
	actual: Readonly<Record<string, Valor | undefined>>,
	cambios: Readonly<Record<string, Valor | undefined>>,
): Record<string, Valor> {
	const junta: Record<string, Valor> = {};
	for (const [clave, valor] of Object.entries({ ...actual, ...cambios })) {
		if (valor !== undefined && valor !== "") junta[clave] = valor;
	}
	return junta;
}

/**
 * Escribe una dirección con su búsqueda; lo que no tiene valor no viaja.
 * @param ruta La ruta de la pestaña.
 * @param busqueda Los parámetros, como texto.
 * @returns `ruta`, o `ruta?parametros` si alguno tiene valor.
 */
export function direccionCon(ruta: string, busqueda: Readonly<Record<string, string | undefined>>): string {
	const texto = new URLSearchParams(juntarBusqueda(busqueda, {})).toString();
	return texto === "" ? ruta : `${ruta}?${texto}`;
}

/**
 * La dirección a la que se va al cambiar unos parámetros: en la misma ruta, los demás se quedan; en otra, empiezan de
 * cero.
 * @param ruta La ruta de ahora.
 * @param busqueda La búsqueda de ahora, como viene en la dirección (`grupo=lotes&cajon=lote`).
 * @param cambios Los parámetros que cambian; vacío quita uno.
 * @param otraRuta La ruta a la que se va, si cambia de pestaña.
 */
export function direccionTrasCambios(
	ruta: string,
	busqueda: string,
	cambios: Readonly<Record<string, string | undefined>>,
	otraRuta?: string,
): string {
	const destino = otraRuta ?? ruta;
	const base = destino === ruta ? Object.fromEntries(new URLSearchParams(busqueda)) : {};
	return direccionCon(destino, juntarBusqueda(base, cambios));
}

/**
 * Lee y cambia los parámetros de la dirección de un departamento, como texto.
 * @returns `leer(parametro)`, e `ir(cambios, ruta?, reemplazar?)`, que cambia esos parámetros (vacío quita uno) y, si
 * se dice, cambia de pestaña sin llevarse los parámetros de la anterior; con `reemplazar`, no deja paso en el historial
 * (lo que se escribe en un buscador).
 */
export function useDireccionDeDepartamento<Parametro extends string>() {
	const router = useRouter();
	const ruta = useRouterState({ select: (estado) => estado.location.pathname });
	const busqueda = useRouterState({ select: (estado) => estado.location.searchStr });
	const leer = useCallback(
		(parametro: Parametro): string | undefined => new URLSearchParams(busqueda).get(parametro) ?? undefined,
		[busqueda],
	);
	const ir = useCallback(
		(cambios: Partial<Record<Parametro, string | undefined>>, otraRuta?: string, reemplazar = false) => {
			const a = direccionTrasCambios(ruta, busqueda, cambios, otraRuta);
			if (reemplazar) router.history.replace(a);
			else router.history.push(a);
		},
		[router, ruta, busqueda],
	);
	return { leer, ir };
}

/**
 * Lee la búsqueda de un departamento con el esquema Zod de sus pantallas y da cómo cambiarla: los cambios se juntan
 * con lo que ya hay y lo que se pone sin valor se quita; con otra pestaña, la búsqueda empieza de cero.
 * @param esquema El esquema de la búsqueda del departamento: lo que no cumple, no se lee.
 * @param rutaDe La ruta de cada pestaña del departamento.
 * @returns La búsqueda y `navegar(cambios, pestana?)`.
 */
export function useBusquedaDeDepartamento<Busqueda extends Record<string, unknown>, Pestana extends string>(
	esquema: z.ZodType<Busqueda>,
	rutaDe: (pestana: Pestana) => string,
) {
	const busqueda = esquema.parse(useSearch({ strict: false }));
	const navigate = useNavigate();
	const navegar = useCallback(
		(cambios: Partial<Busqueda>, pestana?: Pestana) => {
			void navigate({
				to: pestana === undefined ? "." : rutaDe(pestana),
				search: esquema.parse(juntarBusqueda(pestana === undefined ? busqueda : {}, cambios)),
			});
		},
		[busqueda, navigate, esquema, rutaDe],
	);
	return { busqueda, navegar };
}
