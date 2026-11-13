/**
 * Las dos ventanas con motivo del cajón del desarrollo: «Cambios a la muestra de {prenda}» («Regresar a muestra» →
 * `patronaje.pedir_cambios_muestra`, aviso «{DS} regresa a muestra») y «Descartar {prenda}» («Descartar» →
 * `patronaje.descartar_desarrollo`, aviso «{DS} descartada. Queda en el historial con su motivo»). Abajo del título,
 * «{escuela} · {DS}». Si el desarrollo cambió mientras se veía, lo dice y conserva el motivo. Las dos son la ventana
 * con motivo común.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Ventanas»)
 */

import { descartarDesarrollo, pedirCambiosMuestra } from "@uniformame/compartido/contratos/patronaje/desarrollos";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEnvio } from "../../../comun/envio.ts";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { loQueCambiaEnPatronaje } from "../invalidar.ts";

/** El desarrollo de la ventana, como lo trae el cajón. */
export interface DesarrolloConMotivo {
	desarrollo_id: string;
	folio: string;
	version: number;
	prenda: string;
	para: string;
}

/** Los textos y la acción de cada ventana. */
const ventanas = {
	cambios: { titulo: "Cambios a la muestra de", boton: "Regresar a muestra", contrato: pedirCambiosMuestra },
	descartar: { titulo: "Descartar", boton: "Descartar", contrato: descartarDesarrollo },
} as const;

/**
 * La ventana con motivo para pedir cambios a la muestra o descartar el desarrollo.
 * @param props Cuál ventana, el desarrollo (cerrada si es nulo) y qué hacer al cerrar.
 */
export function VentanaMotivoDelDesarrollo({
	cual,
	desarrollo,
	alCerrar,
}: {
	cual: keyof typeof ventanas;
	desarrollo: DesarrolloConMotivo | null;
	alCerrar: () => void;
}) {
	const { titulo, boton, contrato } = ventanas[cual];
	const { enviar, enviando, choco } = useEnvio(contrato, loQueCambiaEnPatronaje);
	/** Manda la acción; si sale, cierra; si una regla lo rechaza, regresa lo que dice del motivo. */
	const confirmar = async (motivo: string) => {
		if (desarrollo === null) return undefined;
		let error: string | undefined;
		const salio = await enviar(
			{ datos: { desarrollo_id: desarrollo.desarrollo_id, motivo }, version: desarrollo.version },
			(falla) => {
				error = falla.campos.motivo ?? falla.mensaje;
			},
		);
		if (salio !== undefined) alCerrar();
		return error;
	};
	return (
		<VentanaConMotivo
			abierta={desarrollo !== null}
			alCerrar={alCerrar}
			titulo={`${titulo} ${desarrollo?.prenda ?? ""}`}
			subtitulo={desarrollo === null ? undefined : `${desarrollo.para} · ${desarrollo.folio}`}
			textoAccion={boton}
			peligro={cual === "descartar"}
			enviando={enviando}
			alConfirmar={confirmar}
		>
			{choco ? <EstadoDePantalla tipo="choque" documento={desarrollo?.folio ?? ""} /> : null}
		</VentanaConMotivo>
	);
}
