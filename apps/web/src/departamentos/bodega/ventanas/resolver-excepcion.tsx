/**
 * La ventana «Resolver excepción»: qué pasó y «Qué se hizo» (5 letras o más). «Resolver» llama
 * `inventario.resolver_excepcion` con la versión de la excepción; resolverla no mueve nada.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Ventanas») y docs/modulos/inventario/excepciones.md
 */

import type { excepcionDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { resolverExcepcion } from "@uniformame/compartido/contratos/inventario/excepciones";
import type { z } from "zod";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";

/**
 * La ventana «Resolver excepción».
 * @param props La excepción y cómo cerrar la ventana.
 */
export function VentanaResolverExcepcion({
	excepcion,
	alCerrar,
}: {
	excepcion: z.infer<typeof excepcionDeBodega>;
	alCerrar: () => void;
}) {
	const { enviar, enviando } = useEnvio(resolverExcepcion);
	return (
		<VentanaConMotivo
			titulo="Resolver excepción"
			subtitulo={excepcion.descripcion}
			textoAccion="Resolver"
			ejemplo="Qué se hizo"
			peligro={false}
			enviando={enviando}
			alCerrar={alCerrar}
			alConfirmar={async (resolucion) => {
				let error: string | undefined;
				const salio = await enviar(
					{ datos: { excepcion_id: excepcion.excepcion_id, resolucion }, version: excepcion.version },
					(falla) => {
						error = falla.campos.resolucion;
					},
				);
				if (salio !== undefined) alCerrar();
				return error;
			}}
		/>
	);
}
