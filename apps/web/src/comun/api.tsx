/**
 * El cliente de la API para las pantallas, con TanStack Query: `useConsulta` lee una consulta por su contrato y
 * `useAccion` manda una acción, con su clave por intención, el aviso de abajo con el texto que regresa y el choque de
 * versión. Las pantallas nunca llaman `fetch`.
 * Fase 19 · docs/cimientos/PAQUETE-COMPARTIDO.md («El cliente de la API») y .claude/rules/react.md (regla 5)
 *
 * El cliente del paquete compartido reintenta sin red, pide «Confirmar con Google» ante `401 reautenticar` y repite la
 * acción con su misma clave, y avisa cuando la web es vieja.
 */

import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
 * vuelve a leer las consultas que se le digan.
 * @param contrato Su contrato.
 * @param invalidar Las consultas (por nombre) que cambian con ella.
 */
export function useAccion<Contrato extends ContratoDeAccion>(contrato: Contrato, invalidar: readonly string[] = []) {
	const consultas = useQueryClient();
	const avisar = useAvisar();
	// La clave de la intención en curso: se reusa si no hubo respuesta y la persona vuelve a intentar.
	const clave = useRef<string | undefined>(undefined);
	return useMutation({
		mutationFn: (peticion: { datos: z.input<Contrato["entrada"]>; version?: number }) => {
			const cliente = crearCliente({ acciones: { [contrato.nombre]: contrato }, consultas: {} }, opciones);
			clave.current = clave.current ?? crypto.randomUUID();
			return cliente.accion(contrato.nombre, peticion, clave.current);
		},
		onSuccess: (resultado: z.output<Contrato["resultado"]>) => {
			clave.current = undefined;
			const mensaje = (resultado as { mensaje?: unknown }).mensaje;
			if (typeof mensaje === "string") avisar(mensaje, "bien");
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
