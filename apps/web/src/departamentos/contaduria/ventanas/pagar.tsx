/**
 * La ventana «Pagar a {beneficiario}»: el documento y su vencimiento; el monto (lleno con el saldo; se puede pagar una
 * parte), de dónde sale y la referencia. «Confirmar con Google y pagar» llama a `contaduria.pagar_cuenta_por_pagar`.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/cuentas-por-pagar.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { pagarCuentaPorPagar } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { type CuentaDeLaFabrica, medioDe, opcionesDeSaleDe } from "../comun.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que se paga: la cuenta con su versión, a quién, qué, cuándo vence y su saldo. */
export interface CuentaAPagar {
	id: string;
	version: number;
	beneficiario: string;
	documento: string;
	vence: string;
	saldoCentavos: number | undefined;
}

/** El formulario: el monto en pesos, de dónde sale y la referencia del contrato. */
const formularioDePago = z.object({
	monto: z.string().refine((texto) => pesosACentavos(texto) !== null, "Escribe el monto en pesos"),
	sale_de: z.string().min(1, "Escoge de dónde sale."),
	referencia: pagarCuentaPorPagar.entrada.shape.referencia,
});

/**
 * La ventana para pagar una cuenta por pagar.
 * @param props La cuenta, las cuentas de la fábrica y qué hacer al cerrar.
 */
export function VentanaPagar({
	cuenta,
	cuentasFabrica,
	alCerrar,
}: {
	cuenta: CuentaAPagar;
	cuentasFabrica: readonly CuentaDeLaFabrica[];
	alCerrar: () => void;
}) {
	const { enviar, enviando, choco } = useEnvio(pagarCuentaPorPagar);
	const conConexion = useConConexion();
	const opciones = opcionesDeSaleDe(cuentasFabrica);
	const formulario = useForm<z.input<typeof formularioDePago>>({
		resolver: zodResolver(formularioDePago),
		defaultValues: { monto: centavosACampo(cuenta.saldoCentavos), sale_de: opciones[0]?.valor ?? "", referencia: "" },
	});
	const errores = formulario.formState.errors;
	const pagar = formulario.handleSubmit(async ({ monto, sale_de, referencia }) => {
		const salio = await enviar(
			{
				datos: {
					cuenta_por_pagar_id: cuenta.id,
					monto_centavos: pesosACentavos(monto) ?? 0,
					...medioDe(sale_de),
					referencia,
				},
				version: cuenta.version,
			},
			(campos) => {
				if (campos.monto_centavos !== undefined) formulario.setError("monto", { message: campos.monto_centavos });
				if (campos.referencia !== undefined) formulario.setError("referencia", { message: campos.referencia });
				if (campos.cuenta_fabrica_id !== undefined)
					formulario.setError("sale_de", { message: campos.cuenta_fabrica_id });
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Pagar a ${cuenta.beneficiario}`}
			subtitulo={`${cuenta.documento} · vence ${cuenta.vence}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void pagar()}>
					Confirmar con Google y pagar
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void pagar(evento)}>
				{choco ? <EstadoDePantalla tipo="choque" documento={cuenta.documento} /> : null}
				<Campo
					enVentana
					etiqueta="Monto"
					inputMode="decimal"
					error={errores.monto?.message}
					{...formulario.register("monto")}
				/>
				<Selector
					enVentana
					etiqueta="Sale de"
					opciones={opciones}
					error={errores.sale_de?.message}
					{...formulario.register("sale_de")}
				/>
				<Campo
					enVentana
					etiqueta="Referencia"
					placeholder="SPEI o recibo"
					autoComplete="off"
					error={errores.referencia?.message}
					{...formulario.register("referencia")}
				/>
			</form>
		</Ventana>
	);
}
