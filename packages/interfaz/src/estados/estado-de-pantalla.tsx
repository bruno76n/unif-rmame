/**
 * Los estados de una pantalla: ninguna se queda en blanco. Cargando (la forma en gris, sin girar nada), vacío (el
 * texto de su archivo y la acción para crear), error («No se pudo cargar. Intenta otra vez», con «Reintentar»), sin
 * permiso, sin conexión (una franja arriba), choque de versión y versión vieja.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»)
 *
 * Uso: `<EstadoDePantalla tipo="vacio" texto="Sin pendientes" />`. El detalle de un error va a la bitácora del
 * servidor, nunca a la pantalla.
 */

import { CircleCheck, Lock, RefreshCw, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Boton } from "../botones/boton.tsx";
import { unirClases } from "../clases.ts";

/** Los textos fijos de los estados de una pantalla. */
export const textosDeEstadoDePantalla = {
	error: "No se pudo cargar. Intenta otra vez",
	sinPermiso: "No tienes acceso a esta pantalla",
	sinConexion: "Sin conexión: los cambios no se guardan hasta que vuelva",
	versionVieja: "Hay una versión nueva del sistema",
} as const;

/**
 * El aviso de un choque de versión.
 * @param documento El documento que cambió («PE-0145»).
 */
export function textoDeChoque(documento: string): string {
	return `${documento} cambió mientras lo veías. Revisa los cambios y vuelve a guardar`;
}

/** Lo que recibe el estado de una pantalla. */
export type PropsDeEstadoDePantalla =
	| { tipo: "cargando"; renglones?: number }
	| { tipo: "vacio"; texto: string; bien?: boolean; accion?: ReactNode }
	| { tipo: "error"; alReintentar: () => void }
	| { tipo: "sin_permiso" }
	| { tipo: "sin_conexion" }
	| { tipo: "choque"; documento: string }
	| { tipo: "version_vieja"; alActualizar: () => void };

/**
 * Un estado de pantalla.
 * @param props Cuál, con lo que necesita.
 */
export function EstadoDePantalla(props: PropsDeEstadoDePantalla) {
	switch (props.tipo) {
		case "cargando":
			return (
				<div role="status" aria-busy="true" className="flex flex-col gap-3">
					<span className="sr-only">Cargando</span>
					{Array.from({ length: props.renglones ?? 5 }, (_, numero) => `renglon-${numero}`).map((clave) => (
						<div key={clave} className="h-renglon animate-pulse rounded-mediano bg-riel" />
					))}
				</div>
			);
		case "vacio":
			return (
				<div className="flex flex-col items-center gap-4 py-12 text-center">
					<p className={unirClases("m-0 font-semibold", props.bien === true ? "text-texto-bien" : "text-tinta2")}>
						{props.bien === true ? <CircleCheck aria-hidden="true" className="mr-1.5 inline" size={18} /> : null}
						{props.texto}
					</p>
					{props.accion}
				</div>
			);
		case "error":
			return (
				<div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
					<p className="m-0 font-semibold text-tinta2">{textosDeEstadoDePantalla.error}</p>
					<Boton icono={RefreshCw} onClick={props.alReintentar}>
						Reintentar
					</Boton>
				</div>
			);
		case "sin_permiso":
			return (
				<div className="flex flex-col items-center gap-3 py-16 text-center text-tinta2">
					<Lock aria-hidden="true" size={22} strokeWidth={1.9} />
					<p className="m-0 font-semibold">{textosDeEstadoDePantalla.sinPermiso}</p>
				</div>
			);
		case "sin_conexion":
			return (
				<div
					role="status"
					className="flex items-center justify-center gap-2 bg-tinta px-4 py-2 font-semibold text-sm text-white"
				>
					<WifiOff aria-hidden="true" size={16} strokeWidth={1.9} />
					{textosDeEstadoDePantalla.sinConexion}
				</div>
			);
		case "choque":
			return (
				<div role="alert" className="rounded-mediano bg-marca-fondo px-4 py-3 font-semibold text-marca-texto">
					{textoDeChoque(props.documento)}
				</div>
			);
		case "version_vieja":
			return (
				<div
					role="alert"
					className="flex items-center justify-center gap-4 bg-tinta px-4 py-2 font-semibold text-sm text-white"
				>
					{textosDeEstadoDePantalla.versionVieja}
					<Boton chico variante="secundario" onClick={props.alActualizar}>
						Actualizar
					</Boton>
				</div>
			);
	}
}
