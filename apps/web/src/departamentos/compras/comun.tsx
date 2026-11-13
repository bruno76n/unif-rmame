/**
 * Las piezas que comparten las pestañas y los cajones de Compras: lo que se ve mientras una consulta carga o si falla,
 * el buscador que escribe en la dirección, el encabezado de un grupo plegable, la muestra de color de un material y un
 * dato con su etiqueta.
 * Fase 19 · docs/interfaz/fabrica/compras.md y docs/interfaz/comunes.md («Los estados de una pantalla»)
 */

import { Buscador as BuscadorDelSistema } from "@uniformame/interfaz/captura/buscador";
import { type ReactNode, useEffect, useState } from "react";
import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";
import { leerFalla } from "../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../comun/cambios-sin-guardar.tsx";
import { useDireccionDeCompras } from "./direccion.ts";

/** Un día en milisegundos. */
const unDia = 86_400_000;

/**
 * Los días entre dos días ISO («2026-11-12»), para dibujar: cuántos caben entre uno y otro.
 * @param desde El primero.
 * @param hasta El segundo.
 */
export function diasEntre(desde: string, hasta: string): number {
	return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / unDia);
}

/**
 * Un día ISO más unos días.
 * @param dia El día.
 * @param dias Cuántos días después.
 */
export function sumarDias(dia: string, dias: number): string {
	return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * unDia).toISOString().slice(0, 10);
}

/**
 * El buscador de una pestaña de Compras: el del sistema de diseño, con lo escrito en la dirección (`buscar`).
 * @param props Su etiqueta y lo que dice adentro.
 */
export function Buscador({ etiqueta, ejemplo }: { etiqueta: string; ejemplo: string }) {
	const { busqueda, ir } = useDireccionDeCompras();
	return (
		<div className="min-w-0 flex-1 basis-72">
			<BuscadorDelSistema
				etiqueta={etiqueta}
				ayuda={ejemplo}
				valor={busqueda.buscar ?? ""}
				alBuscar={(texto) => ir({ buscar: texto === "" ? undefined : texto })}
			/>
		</div>
	);
}

/**
 * El título de una sección dentro de un cajón.
 * @param props El título y, a la derecha, lo que lo acompaña.
 */
export function TituloDeSeccion({ titulo, derecha }: { titulo: string; derecha?: ReactNode }) {
	return (
		<div className="mt-5 mb-2 flex items-center justify-between gap-3">
			<h3 className="m-0 font-bold text-subtitulo">{titulo}</h3>
			{derecha}
		</div>
	);
}

/**
 * El validador de un formulario con el esquema del contrato de su acción: lo capturado (texto) se vuelve los datos de la
 * acción y se revisa con su mismo esquema, así la pantalla valida igual que la API. Cada error va al campo del mismo
 * nombre.
 * @param esquema La entrada del contrato.
 * @param aDatos Cómo lo capturado se vuelve los datos de la acción.
 */
export function validadorDelContrato<Valores extends FieldValues>(
	esquema: z.ZodType,
	aDatos: (valores: Valores) => unknown,
): Resolver<Valores> {
	return (valores) => {
		const leido = esquema.safeParse(aDatos(valores));
		if (leido.success) return { values: valores, errors: {} };
		const errores: FieldErrors<Valores> = {};
		for (const problema of leido.error.issues) {
			const campo = String(problema.path[0] ?? "root");
			if (!(campo in errores)) Object.assign(errores, { [campo]: { type: problema.code, message: problema.message } });
		}
		return { values: {}, errors: errores };
	};
}

/**
 * Un número escrito en un campo, o `undefined` si está vacío (y el esquema dice el error).
 * @param texto Lo que se escribió.
 */
export function numeroEscrito(texto: string | undefined): number | undefined {
	const limpio = (texto ?? "").replaceAll(",", "").trim();
	return limpio === "" ? undefined : Number(limpio);
}

/**
 * Pone junto a su campo los errores que regresó una acción (`400` con `campos`, o un `422` de un campo), y regresa el
 * mensaje que no es de ningún campo para que se vea arriba.
 * @param falla Lo que lanzó la acción.
 * @param valores Lo capturado: dice qué campos hay.
 * @param ponerError Cómo se pone el error de un campo (`setError` de React Hook Form).
 * @param porCodigo Los errores de regla que van en un campo, por su código (`nombre_repetido` → `nombre`).
 */
export function erroresDeLaAccion<Valores extends FieldValues>(
	falla: unknown,
	valores: Valores,
	ponerError: (campo: Extract<keyof Valores, string>, error: { message: string }) => void,
	porCodigo: Readonly<Record<string, Extract<keyof Valores, string>>> = {},
): void {
	const leida = leerFalla(falla);
	if (leida.tipo !== "regla") return;
	const esCampo = (campo: string): campo is Extract<keyof Valores, string> => campo in valores;
	for (const [campo, mensaje] of Object.entries(leida.campos)) {
		if (esCampo(campo)) ponerError(campo, { message: mensaje });
	}
	const delCodigo = leida.codigo === null ? undefined : porCodigo[leida.codigo];
	if (delCodigo !== undefined) ponerError(delCodigo, { message: leida.mensaje });
}

/**
 * El cierre de un cajón con captura: con cambios sin guardar, cambiar de pestaña o salir por el menú pregunta antes, y
 * cerrar el cajón lo pregunta el cajón mismo; ya decidido salir, la dirección cambia sin volver a preguntar.
 * @param conCambios Si hay cambios sin guardar.
 * @param cerrar Cómo se cierra el cajón (quita el cajón de la dirección).
 * @returns `alCerrar` para el cajón y `pregunta`, la ventana que hay que pintar.
 */
export function useCierreDelCajon(conCambios: boolean, cerrar: () => void) {
	const [saliendo, setSaliendo] = useState(false);
	const pregunta = usePreguntarAntesDeSalir(conCambios && !saliendo);
	useEffect(() => {
		if (saliendo) cerrar();
	}, [saliendo, cerrar]);
	return { alCerrar: () => setSaliendo(true), pregunta };
}
