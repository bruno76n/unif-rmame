/**
 * El cliente de la API para las pantallas, con TanStack Query: `useConsulta` lee una consulta por su contrato y
 * `useAccion` manda una acción, con su clave por intención, el aviso de abajo con el texto que regresa y el choque de
 * versión. Las pantallas nunca llaman `fetch`.
 * Fase 19 · docs/cimientos/PAQUETE-COMPARTIDO.md («El cliente de la API») y .claude/rules/react.md (regla 5)
 *
 * El cliente del paquete compartido reintenta sin red, pide «Confirmar con Google» ante `401 reautenticar` y repite la
 * acción con su misma clave, y avisa cuando la web es vieja.
 */

import {
	keepPreviousData,
	type QueryClient,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { crearCliente, ErrorDeConflicto, ErrorDeLaApi, ErrorSinRed } from "@uniformame/compartido/cliente/cliente";
import type { ContratoDeAccion, ContratoDeConsulta } from "@uniformame/compartido/contratos/definir";
import { useRef } from "react";
import type { z } from "zod";
import { useAvisar } from "./avisos-de-abajo.tsx";
import { confirmarConGoogle } from "./confirmar-con-google.ts";
import { marcarVersionVieja, versionDeLaWeb } from "./estado-de-la-app.ts";

/** Lo común de cada llamada: la misma dirección que la web (el proxy o el dominio de la API) y la cookie. */
const opciones = {
	urlBase: import.meta.env.VITE_DIRECCION_API ?? "",
	versionApp: versionDeLaWeb,
	credenciales: "include" as const,
	alReautenticar: () => confirmarConGoogle(),
	alActualizar: () => marcarVersionVieja(),
};

/**
 * Lee una consulta.
 * @param contrato Su contrato, del paquete compartido.
 * @param parametros Sus parámetros.
 */
export async function consultar<Contrato extends ContratoDeConsulta>(
	contrato: Contrato,
	parametros: z.input<Contrato["entrada"]>,
): Promise<z.output<Contrato["resultado"]>> {
	const cliente = crearCliente({ acciones: {}, consultas: { [contrato.nombre]: contrato } }, opciones);
	return (await cliente.consulta(contrato.nombre, parametros)).resultado;
}

/**
 * Lee una consulta con TanStack Query: se guarda por su nombre y sus parámetros, y se vuelve a leer cuando una
 * acción la invalida o llega «hay cambios».
 * @param contrato Su contrato.
 * @param parametros Sus parámetros (de la dirección).
 * @param activa Si se lee ya (un cajón cerrado no lee).
 * @param conservarAnteriores Mientras llegan los datos de otros parámetros, deja los de antes (una casilla que cambia
 * la consulta no pierde el foco ni la pantalla se vacía).
 */
export function useConsulta<Contrato extends ContratoDeConsulta>(
	contrato: Contrato,
	parametros: z.input<Contrato["entrada"]>,
	activa = true,
	conservarAnteriores = false,
) {
	return useQuery({
		queryKey: [contrato.nombre, parametros],
		queryFn: () => consultar(contrato, parametros),
		enabled: activa,
		retry: false,
		...(conservarAnteriores ? { placeholderData: keepPreviousData } : {}),
	});
}

/**
 * Sube un archivo que escogió la persona, antes de mandar la acción que lo usa: pide la dirección firmada y lo sube
 * directo al almacén (docs/modulos/admin/archivos.md, regla 1).
 * @param proposito El propósito del archivo (`foto`, `comprobante`, `factura_proveedor`, `documento_contador`…).
 * @param modulo El módulo de la acción que lo usa.
 * @param archivo El archivo.
 * @returns El `archivo_id` que se manda en la acción.
 * @throws Lo mismo que una acción: `leerFalla` lo lee (el tipo o el tamaño que no se aceptan, o sin red).
 */
export function subirArchivo(proposito: string, modulo: string, archivo: File): Promise<string> {
	return crearCliente({ acciones: {}, consultas: {} }, opciones).subirArchivo({ proposito, modulo, archivo });
}

/**
 * El cursor de la página siguiente, si la consulta lo regresa en `cursor`.
 * @param pagina Lo que regresó una página.
 */
function cursorDeLaPagina(pagina: unknown): string | undefined {
	return typeof pagina === "object" && pagina !== null && "cursor" in pagina && typeof pagina.cursor === "string"
		? pagina.cursor
		: undefined;
}

/**
 * Lee una consulta que pagina, página por página, para «Ver más»: la siguiente lleva el cursor de la anterior. Se
 * guarda con el nombre de la consulta al frente, así una acción que la invalida la vuelve a leer.
 * @param contrato Su contrato, con `cursor` en la entrada.
 * @param parametros Sus parámetros, sin el cursor.
 * @param opciones `activa` (un grupo plegado no lee) y `siguiente`, si el cursor no viene en `cursor` de la página.
 * @returns Las páginas leídas, si hay más y cómo pedir la siguiente.
 */
export function usePaginas<Contrato extends ContratoDeConsulta>(
	contrato: Contrato,
	parametros: z.input<Contrato["entrada"]>,
	opciones: { activa?: boolean; siguiente?: (pagina: z.output<Contrato["resultado"]>) => string | null } = {},
) {
	const sinCursor: string | null = null;
	return useInfiniteQuery({
		queryKey: [contrato.nombre, parametros, "paginas"],
		queryFn: ({ pageParam }) =>
			consultar(contrato, pageParam === null ? parametros : { ...parametros, cursor: pageParam }),
		initialPageParam: sinCursor,
		getNextPageParam: (pagina: z.output<Contrato["resultado"]>) =>
			(opciones.siguiente === undefined ? cursorDeLaPagina(pagina) : opciones.siguiente(pagina)) ?? undefined,
		enabled: opciones.activa ?? true,
		retry: false,
	});
}

/** Lo que la pantalla sabe de una acción que no salió. */
export type FallaDeAccion =
	| { tipo: "regla"; codigo: string | null; mensaje: string; campos: Record<string, string> }
	| { tipo: "choque"; datos: unknown }
	| { tipo: "sin_red" };

/**
 * Lee la falla de una acción como la necesita la pantalla.
 * @param error Lo que lanzó el cliente.
 */
export function leerFalla(error: unknown): FallaDeAccion {
	if (error instanceof ErrorDeConflicto) return { tipo: "choque", datos: error.datos };
	if (error instanceof ErrorDeLaApi) {
		const { codigo, mensaje, campos } = error.respuesta;
		return { tipo: "regla", codigo: codigo ?? null, mensaje, campos: campos ?? {} };
	}
	if (error instanceof ErrorSinRed) return { tipo: "sin_red" };
	return { tipo: "regla", codigo: null, mensaje: "No se pudo. Intenta otra vez.", campos: {} };
}

/**
 * Manda una acción por su contrato. La clave nace cuando la persona aprieta el botón y se reusa si vuelve a intentar
 * la misma intención después de una falla sin respuesta; al salir bien, avisa abajo con el `mensaje` que regresa y
 * sus avisos que no bloquean («Crédito de X: 30 días. Los pedidos ya guardados conservan sus días»), y vuelve a leer
 * las consultas que se le digan.
 * @param contrato Su contrato.
 * @param invalidar Las consultas (por nombre) que cambian con ella.
 */
export function useAccion<Contrato extends ContratoDeAccion>(contrato: Contrato, invalidar: readonly string[] = []) {
	const consultas = useQueryClient();
	const avisar = useAvisar();
	// La clave de la intención en curso: se reusa si no hubo respuesta y la persona vuelve a intentar.
	const clave = useRef<string | undefined>(undefined);
	// Los avisos que no bloquean de la última respuesta: salen en el aviso verde, después del mensaje.
	const avisos = useRef<readonly string[]>([]);
	return useMutation({
		mutationFn: (peticion: { datos: z.input<Contrato["entrada"]>; version?: number }) => {
			avisos.current = [];
			const cliente = crearCliente(
				{ acciones: { [contrato.nombre]: contrato }, consultas: {} },
				{ ...opciones, alAvisos: (llegados) => (avisos.current = llegados) },
			);
			clave.current = clave.current ?? crypto.randomUUID();
			return cliente.accion(contrato.nombre, peticion, clave.current);
		},
		onSuccess: (resultado: z.output<Contrato["resultado"]>) => {
			clave.current = undefined;
			const mensaje = (resultado as { mensaje?: unknown }).mensaje;
			const partes = [...(typeof mensaje === "string" ? [mensaje] : []), ...avisos.current];
			if (partes.length > 0) avisar(partes.join(". "), "bien");
			return volverALeer(consultas, invalidar);
		},
		onError: (error) => {
			const falla = leerFalla(error);
			// Con respuesta, la intención terminó: la siguiente lleva otra clave. Sin red, se reusa.
			if (falla.tipo !== "sin_red") clave.current = undefined;
			if (falla.tipo === "regla" && Object.keys(falla.campos).length === 0) avisar(falla.mensaje, "no_se_pudo");
			if (falla.tipo === "sin_red") avisar("No hay conexión con el sistema.", "no_se_pudo");
		},
	});
}

/**
 * Vuelve a leer las consultas que cambiaron.
 * @param consultas El cliente de TanStack Query.
 * @param nombres Los nombres de las consultas.
 */
export function volverALeer(consultas: QueryClient, nombres: readonly string[]): Promise<void> {
	return Promise.all(nombres.map((nombre) => consultas.invalidateQueries({ queryKey: [nombre] }))).then(
		() => undefined,
	);
}
