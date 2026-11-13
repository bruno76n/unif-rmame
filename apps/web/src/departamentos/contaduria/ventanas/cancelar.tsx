/**
 * Las ventanas de cancelar con motivo de Contaduría: «Cancelar {PG}» (con «Confirmar con Google»), «Cancelar
 * compensación» (también con Google), «Cancelar {PR}», «Cancelar {FP}» y «Cancelar {G}». Cada una llama a su acción con
 * la versión del documento; el aviso de abajo dice lo que regresa.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/interfaz/comunes.md («La ventana», regla 3)
 */

import { cancelarGasto } from "@uniformame/compartido/contratos/contaduria/gastos";
import { cancelarPago } from "@uniformame/compartido/contratos/contaduria/pagos";
import {
	cancelarCompensacion,
	cancelarDeuda,
	cancelarFacturaProveedor,
} from "@uniformame/compartido/contratos/contaduria/por-pagar";
import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import type { z } from "zod";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que se cancela: su tipo, su id, su versión y cómo se nombra. */
export type ACancelar =
	| { tipo: "pago"; id: string; version: number; folio: string }
	| { tipo: "compensacion"; id: string; version: number; tercero: string }
	| { tipo: "deuda"; id: string; version: number; folio: string }
	| { tipo: "factura"; id: string; version: number; folio: string }
	| { tipo: "gasto"; id: string; version: number; folio: string };

/**
 * Una ventana con motivo sobre una acción de cancelar.
 * @param props La acción, su título, el texto del botón, cómo arma sus datos, la versión y qué hacer al cerrar.
 */
function VentanaDeCancelar<Contrato extends ContratoDeAccion>({
	contrato,
	titulo,
	textoAccion,
	datos,
	version,
	alCerrar,
}: {
	contrato: Contrato;
	titulo: string;
	textoAccion: string;
	datos: (motivo: string) => z.input<Contrato["entrada"]>;
	version: number;
	alCerrar: () => void;
}) {
	const { enviar, enviando } = useEnvio(contrato);
	return (
		<VentanaConMotivo
			alCerrar={alCerrar}
			titulo={titulo}
			textoAccion={textoAccion}
			enviando={enviando}
			alConfirmar={async (motivo) => {
				let error: string | undefined;
				const salio = await enviar({ datos: datos(motivo), version }, (campos) => {
					error = campos.motivo;
				});
				if (salio !== undefined) alCerrar();
				return error;
			}}
		/>
	);
}

/**
 * La ventana de cancelar lo que se diga.
 * @param props Lo que se cancela y qué hacer al cerrar.
 */
export function VentanaCancelar({ cancelar, alCerrar }: { cancelar: ACancelar; alCerrar: () => void }) {
	switch (cancelar.tipo) {
		case "pago":
			return (
				<VentanaDeCancelar
					contrato={cancelarPago}
					titulo={`Cancelar ${cancelar.folio}`}
					textoAccion="Confirmar con Google y cancelar"
					datos={(motivo) => ({ pago_id: cancelar.id, motivo })}
					version={cancelar.version}
					alCerrar={alCerrar}
				/>
			);
		case "compensacion":
			return (
				<VentanaDeCancelar
					contrato={cancelarCompensacion}
					titulo="Cancelar compensación"
					textoAccion="Confirmar con Google y cancelar"
					datos={(motivo) => ({ compensacion_id: cancelar.id, motivo })}
					version={cancelar.version}
					alCerrar={alCerrar}
				/>
			);
		case "deuda":
			return (
				<VentanaDeCancelar
					contrato={cancelarDeuda}
					titulo={`Cancelar ${cancelar.folio}`}
					textoAccion="Cancelar deuda"
					datos={(motivo) => ({ deuda_id: cancelar.id, motivo })}
					version={cancelar.version}
					alCerrar={alCerrar}
				/>
			);
		case "factura":
			return (
				<VentanaDeCancelar
					contrato={cancelarFacturaProveedor}
					titulo={`Cancelar ${cancelar.folio}`}
					textoAccion="Cancelar factura"
					datos={(motivo) => ({ factura_proveedor_id: cancelar.id, motivo })}
					version={cancelar.version}
					alCerrar={alCerrar}
				/>
			);
		case "gasto":
			return (
				<VentanaDeCancelar
					contrato={cancelarGasto}
					titulo={`Cancelar ${cancelar.folio}`}
					textoAccion="Cancelar gasto"
					datos={(motivo) => ({ gasto_id: cancelar.id, motivo })}
					version={cancelar.version}
					alCerrar={alCerrar}
				/>
			);
	}
}
