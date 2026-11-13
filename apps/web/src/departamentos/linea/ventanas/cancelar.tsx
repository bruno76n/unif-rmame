/**
 * La ventana «Cancelar {W}»: lo que pasa al cancelar y el motivo. «Cancelar pedido» llama a `linea.cancelar_pedido` con
 * la versión que se leyó; el aviso de abajo dice lo que regresa. Si ya no se puede, el aviso dice por qué.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Ventanas») y docs/modulos/linea/pedidos-en-linea.md
 * («`linea.cancelar_pedido`»)
 */

import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";

/**
 * La ventana para cancelar un W-.
 * @param props Su folio, si la acción va en camino, qué hacer al confirmar (regresa el error del motivo, si hay) y al
 * cerrar.
 */
export function VentanaCancelarPedido({
	folio,
	enviando,
	alConfirmar,
	alCerrar,
}: {
	folio: string;
	enviando: boolean;
	alConfirmar: (motivo: string) => Promise<string | undefined>;
	alCerrar: () => void;
}) {
	return (
		<VentanaConMotivo
			titulo={`Cancelar ${folio}`}
			textoAccion="Cancelar pedido"
			enviando={enviando}
			alCerrar={alCerrar}
			alConfirmar={alConfirmar}
		>
			<p className="m-0 text-tinta2">
				No se borra: queda con quién, cuándo y por qué. Lo que ya está en aduana regresa a su origen y lo que viene en
				camino se reparte al llegar. El reembolso lo hace uniformame.mx con su pasarela.
			</p>
		</VentanaConMotivo>
	);
}
