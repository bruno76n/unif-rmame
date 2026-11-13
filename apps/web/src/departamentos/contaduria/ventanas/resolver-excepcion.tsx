/**
 * La ventana «Resolver excepción»: qué pasó y «Qué se hizo» (al menos `general.largo_minimo_motivo` letras). «Resolver»
 * llama a `inventario.resolver_excepcion` con la versión de la excepción.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/inventario/excepciones.md
 */

import { resolverExcepcion } from "@uniformame/compartido/contratos/inventario/excepciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useLargoMinimoDelMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";

/** La excepción que se resuelve. */
export interface ExcepcionAResolver {
	id: string;
	version: number;
	que_paso: string;
	documento: string;
}

/**
 * La ventana para resolver una excepción de dinero.
 * @param props La excepción y qué hacer al cerrar.
 */
export function VentanaResolverExcepcion({
	excepcion,
	alCerrar,
}: {
	excepcion: ExcepcionAResolver;
	alCerrar: () => void;
}) {
	const { enviar, enviando } = useEnvio(resolverExcepcion);
	const conConexion = useConConexion();
	const largoMinimo = useLargoMinimoDelMotivo();
	const [resolucion, setResolucion] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	const resolver = async () => {
		const salio = await enviar(
			{ datos: { excepcion_id: excepcion.id, resolucion: resolucion.trim() }, version: excepcion.version },
			(campos) => setError(campos.resolucion),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Resolver excepción"
			subtitulo={`${excepcion.que_paso} · ${excepcion.documento}`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || resolucion.trim().length < largoMinimo}
					onClick={() => void resolver()}
				>
					Resolver
				</Boton>
			}
		>
			<Campo
				enVentana
				etiqueta="Qué se hizo"
				value={resolucion}
				error={error}
				onChange={(evento) => setResolucion(evento.target.value)}
			/>
		</Ventana>
	);
}
