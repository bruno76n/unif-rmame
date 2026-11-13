/**
 * La ventana «Pagar a {cliente}» (devolver el saldo a favor): el monto (lleno con el saldo a favor), de dónde sale y la
 * referencia. «Confirmar con Google y pagar» llama a `contaduria.devolver_saldo_a_favor`.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/pagos-y-saldo-a-favor.md
 * (regla 8)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { clienteDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { devolverSaldoAFavor } from "@uniformame/compartido/contratos/contaduria/saldo-favor";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { medioDe, opcionesDeSaleDe } from "../comun.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que se lee del cliente. */
type Cliente = z.infer<typeof clienteDeContaduria.resultado>;

/** El formulario, con la referencia del contrato. */
const formularioDeDevolucion = z.object({
	monto: z.string().refine((texto) => pesosACentavos(texto) !== null, "Escribe el monto en pesos"),
	sale_de: z.string().min(1, "Escoge de dónde sale."),
	referencia: devolverSaldoAFavor.entrada.shape.referencia,
});

/**
 * La ventana para devolver el saldo a favor de un cliente.
 * @param props El cliente y qué hacer al cerrar.
 */
export function VentanaDevolverSaldoAFavor({ cliente, alCerrar }: { cliente: Cliente; alCerrar: () => void }) {
	const { enviar, enviando } = useEnvio(devolverSaldoAFavor);
	const conConexion = useConConexion();
	const opciones = opcionesDeSaleDe(cliente.cuentas_fabrica);
	const formulario = useForm<z.input<typeof formularioDeDevolucion>>({
		resolver: zodResolver(formularioDeDevolucion),
		defaultValues: {
			monto: centavosACampo(cliente.saldo_favor_centavos),
			sale_de: opciones[0]?.valor ?? "",
			referencia: "",
		},
	});
	const errores = formulario.formState.errors;
	const pagar = formulario.handleSubmit(async (valores) => {
		const salio = await enviar(
			{
				datos: {
					cliente_id: cliente.cliente_id,
					monto_centavos: pesosACentavos(valores.monto) ?? 0,
					...medioDe(valores.sale_de),
					referencia: valores.referencia,
				},
			},
			(campos) => {
				if (campos.monto_centavos !== undefined) formulario.setError("monto", { message: campos.monto_centavos });
				if (campos.referencia !== undefined) formulario.setError("referencia", { message: campos.referencia });
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Pagar a ${cliente.nombre}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void pagar()}>
					Confirmar con Google y pagar
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void pagar(evento)}>
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
					autoComplete="off"
					error={errores.referencia?.message}
					{...formulario.register("referencia")}
				/>
			</form>
		</Ventana>
	);
}
