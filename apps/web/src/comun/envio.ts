/**
 * Cómo mandan sus acciones los cajones y las ventanas de cualquier departamento: la acción por su contrato (con su
 * clave, su aviso de abajo y lo que vuelve a leer, de `useAccion`), lo que dijo la API de una regla para que el
 * formulario lo ponga en sus campos, y el choque de versión, que vuelve a leer lo nuevo y lo avisa sin perder lo
 * capturado.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 *
 * Uso: `const { enviar, enviando, choco } = useEnvio(contrato, consultasDeMiDepartamento);`, o `useEnvioConCampos` si el
 * formulario solo necesita el error de cada campo.
 */

import { useQueryClient } from "@tanstack/react-query";
import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useState } from "react";
import type { z } from "zod";
import { leerFalla, useAccion, volverALeer } from "./api.tsx";

/** Lo que la pantalla sabe de una acción que no salió por una regla. */
export interface FallaDeRegla {
	codigo: string | null;
	mensaje: string;
	/** El error de cada campo, por su nombre. */
	campos: Record<string, string>;
}

/**
 * Una acción lista para un cajón o una ventana.
 * @param contrato Su contrato.
 * @param consultas Las consultas que cambian con ella: se vuelven a leer al salir y al chocar.
 * @returns `enviar(peticion, alFallar)` (regresa el resultado, o nada si no salió), si va en camino y si chocó.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato, consultas: readonly string[]) {
	const accion = useAccion(contrato, consultas);
	const cliente = useQueryClient();
	const [choco, setChoco] = useState(false);
	const enviar = async (
		peticion: { datos: z.input<Contrato["entrada"]>; version?: number },
		alFallar?: (falla: FallaDeRegla) => void,
	): Promise<z.output<Contrato["resultado"]> | undefined> => {
		setChoco(false);
		try {
			return await accion.mutateAsync(peticion);
		} catch (error) {
			const falla = leerFalla(error);
			if (falla.tipo === "regla") alFallar?.(falla);
			if (falla.tipo === "choque") {
				setChoco(true);
				await volverALeer(cliente, consultas);
			}
			return undefined;
		}
	};
	return { enviar, enviando: accion.isPending, choco };
}

/**
 * Lo mismo que `useEnvio`, para los formularios que solo ponen en sus campos lo que dijo la API de una regla.
 * @param contrato Su contrato.
 * @param consultas Las consultas que cambian con ella.
 * @returns Lo de `useEnvio`; `enviar(peticion, alCampos, alFallar)` entrega el error de cada campo, si la regla dijo
 * alguno, y la falla completa a quien necesite su código.
 */
export function useEnvioConCampos<Contrato extends ContratoDeAccion>(contrato: Contrato, consultas: readonly string[]) {
	const envio = useEnvio(contrato, consultas);
	return {
		...envio,
		enviar: (
			peticion: Parameters<typeof envio.enviar>[0],
			alCampos?: (campos: Record<string, string>) => void,
			alFallar?: (falla: FallaDeRegla) => void,
		) =>
			envio.enviar(peticion, (falla) => {
				if (alCampos !== undefined && Object.keys(falla.campos).length > 0) alCampos(falla.campos);
				alFallar?.(falla);
			}),
	};
}
