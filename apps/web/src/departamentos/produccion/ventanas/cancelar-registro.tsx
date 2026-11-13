/**
 * La ventana «Cancelar el registro de {persona}»: «{n} {operación} en {bulto}, del {fecha}» y el motivo, con la ventana
 * con motivo de lo común. «Cancelar registro» llama `produccion.cancelar_registro` con la versión del registro; si otro
 * lo cambió mientras se veía, lo dice y vuelve a leer el lote, sin perder el motivo.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Cancelar el registro de {persona}») y
 * docs/interfaz/comunes.md («La ventana», regla 3)
 */

import { cancelarRegistro } from "@uniformame/compartido/contratos/produccion/registros";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEnvio } from "../../../comun/envio.ts";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { loQueCambiaEnProduccion } from "../invalidar.ts";

/** El registro que se cancela, como lo trae el cajón. */
export interface RegistroPorCancelar {
	registro_id: string;
	version: number;
	persona: string;
	operacion: string;
	bulto: string;
	cuando: string;
	buenas: number;
	danadas: number;
}

/**
 * La ventana para cancelar un registro de la tablet.
 * @param props El registro (cerrada si es nulo), el folio de su lote y qué hacer al cerrar.
 */
export function VentanaCancelarRegistro({
	registro,
	folioDelLote,
	alCerrar,
}: {
	registro: RegistroPorCancelar | null;
	folioDelLote: string;
	alCerrar: () => void;
}) {
	const cancelar = useEnvio(cancelarRegistro, loQueCambiaEnProduccion);
	const piezas = registro === null ? 0 : registro.buenas + registro.danadas;
	const fecha = registro?.cuando.split(" · ")[0] ?? "";
	return (
		<VentanaConMotivo
			abierta={registro !== null}
			alCerrar={alCerrar}
			titulo={`Cancelar el registro de ${registro?.persona ?? ""}`}
			subtitulo={registro === null ? undefined : `${piezas} ${registro.operacion} en ${registro.bulto}, del ${fecha}`}
			textoAccion="Cancelar registro"
			enviando={cancelar.enviando}
			alConfirmar={async (motivo) => {
				if (registro === null) return undefined;
				let error: string | undefined;
				const salio = await cancelar.enviar(
					{ datos: { registro_id: registro.registro_id, motivo }, version: registro.version },
					(falla) => {
						error = falla.campos.motivo ?? falla.mensaje;
					},
				);
				if (salio !== undefined) alCerrar();
				return error;
			}}
		>
			{cancelar.choco ? <EstadoDePantalla tipo="choque" documento={folioDelLote} /> : null}
		</VentanaConMotivo>
	);
}
