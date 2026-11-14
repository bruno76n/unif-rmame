/**
 * La ventana «Resolver excepción»: qué pasó y «Qué se hizo» (al menos `general.largo_minimo_motivo` letras), con la
 * ventana con motivo de lo común, la misma de Bodega. «Resolver» llama a `inventario.resolver_excepcion` con la versión
 * de la excepción; el error que la API le da a lo que se hizo sale junto al campo.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/inventario/excepciones.md
 */

import { resolverExcepcion } from "@uniformame/compartido/contratos/inventario/excepciones";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
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
	return (
		<VentanaConMotivo
			titulo="Resolver excepción"
			subtitulo={`${excepcion.que_paso} · ${excepcion.documento}`}
			textoAccion="Resolver"
			ejemplo="Qué se hizo"
			peligro={false}
			enviando={enviando}
			alCerrar={alCerrar}
			alConfirmar={async (resolucion) => {
				let error: string | undefined;
				const salio = await enviar(
					{ datos: { excepcion_id: excepcion.id, resolucion }, version: excepcion.version },
					(campos) => {
						error = campos.resolucion;
					},
				);
				if (salio !== undefined) alCerrar();
				return error;
			}}
		/>
	);
}
