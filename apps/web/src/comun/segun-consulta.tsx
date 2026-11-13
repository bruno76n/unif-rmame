/**
 * Los estados de una pantalla mientras llega su consulta: cargando (la forma en gris), sin conexión, sin permiso y
 * error con «Reintentar»; con los datos, pinta la pantalla. Lo usan todas las pestañas y los cajones.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»)
 *
 * Uso: `<SegunConsulta consulta={useConsulta(...)} renglones={6}>{(datos) => <Pestana datos={datos} />}</SegunConsulta>`.
 */

import type { UseQueryResult } from "@tanstack/react-query";
import { ErrorDeLaApi, ErrorSinRed } from "@uniformame/compartido/cliente/cliente";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import type { ReactNode } from "react";

/**
 * Pinta los estados de una consulta y, con sus datos, la pantalla.
 * @param props La consulta, cuántos renglones grises mientras carga y la pantalla con los datos.
 */
export function SegunConsulta<Datos>({
	consulta,
	renglones = 5,
	children,
}: {
	consulta: UseQueryResult<Datos>;
	renglones?: number;
	children: (datos: Datos) => ReactNode;
}) {
	if (consulta.data !== undefined) return <>{children(consulta.data)}</>;
	if (consulta.isError) {
		if (consulta.error instanceof ErrorSinRed) return <EstadoDePantalla tipo="sin_conexion" />;
		if (consulta.error instanceof ErrorDeLaApi && consulta.error.respuesta.error === "sin_permiso") {
			return <EstadoDePantalla tipo="sin_permiso" />;
		}
		return <EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />;
	}
	return <EstadoDePantalla tipo="cargando" renglones={renglones} />;
}
