/**
 * La ventana «Aplicar saldo a favor»: a qué (una nota con saldo o un pedido abierto) y el monto, hasta el saldo a favor
 * y el del documento. «Aplicar» llama a `contaduria.aplicar_saldo_a_favor`.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/pagos-y-saldo-a-favor.md
 * (regla 7)
 *
 * Los documentos son los mismos de Registrar pago (`contaduria.registrar_pago_opciones`).
 */

import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { clienteDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { registrarPagoOpciones } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { aplicarSaldoAFavor } from "@uniformame/compartido/contratos/contaduria/saldo-favor";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que se lee del cliente. */
type Cliente = z.infer<typeof clienteDeContaduria.resultado>;

/**
 * La ventana para aplicar saldo a favor de un cliente.
 * @param props El cliente y qué hacer al cerrar.
 */
export function VentanaAplicarSaldoAFavor({ cliente, alCerrar }: { cliente: Cliente; alCerrar: () => void }) {
	const opciones = useConsulta(registrarPagoOpciones, { cliente_id: cliente.cliente_id });
	const { enviar, enviando } = useEnvio(aplicarSaldoAFavor);
	const conConexion = useConConexion();
	const [documento, setDocumento] = useState<string | undefined>(undefined);
	const [monto, setMonto] = useState<string | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const documentos = opciones.data?.documentos ?? [];
	const escogido = documentos.find((uno) => uno.id === documento) ?? documentos[0];
	// Se llena con lo menor entre el saldo a favor y lo del documento.
	const propuesto = Math.min(cliente.saldo_favor_centavos ?? 0, escogido?.saldo_centavos ?? 0);
	const escrito = monto ?? centavosACampo(propuesto);
	const aplicar = async () => {
		const centavos = pesosACentavos(escrito);
		if (escogido === undefined || centavos === null || centavos <= 0) {
			setError("Escribe el monto.");
			return;
		}
		const salio = await enviar(
			{
				datos: {
					cliente_id: cliente.cliente_id,
					...(escogido.tipo === "nota" ? { nota_entrega_id: escogido.id } : { pedido_id: escogido.id }),
					monto_centavos: centavos,
				},
			},
			(campos) => setError(campos.monto_centavos),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Aplicar saldo a favor"
			subtitulo={`${cliente.nombre} · ${montoEnPantalla(cliente.saldo_favor_centavos)} a favor`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || escogido === undefined}
					onClick={() => void aplicar()}
				>
					Aplicar
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={2}>
				{() => (
					<div className="flex flex-col gap-4">
						<Selector
							enVentana
							etiqueta="A qué"
							opciones={documentos.map((uno) => ({
								valor: uno.id,
								texto: `${uno.folio} · ${montoEnPantalla(uno.saldo_centavos)} · ${uno.detalle}`,
							}))}
							value={escogido?.id ?? ""}
							onChange={(evento) => {
								setDocumento(evento.target.value);
								setMonto(undefined);
							}}
						/>
						<Campo
							enVentana
							etiqueta="Monto"
							inputMode="decimal"
							value={escrito}
							error={error}
							onChange={(evento) => setMonto(evento.target.value)}
						/>
					</div>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
