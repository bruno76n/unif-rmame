/**
 * La ventana «Compensar con {tercero}»: «Lo que nos debe se descuenta de lo que le debemos. No se mueve dinero.», las
 * cifras de antes y después que cambian al escribir, y el monto (lleno con el máximo). «Compensar» llama a
 * `contaduria.compensar`.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/terceros-y-deudas.md (regla 5)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { terceroDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-terceros";
import { compensar } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { useEnvio } from "../envio.ts";

/** Lo que se lee del tercero. */
type Tercero = z.infer<typeof terceroDeContaduria.resultado>;

/** El formulario: el monto, con el esquema del contrato. */
const formularioDeCompensacion = z.object({
	monto: z
		.string()
		.refine(
			(texto) => compensar.entrada.shape.monto_centavos.safeParse(pesosACentavos(texto)).success,
			"Escribe el monto en pesos",
		),
});

/**
 * La ventana para compensar lo que un tercero nos debe con lo que le debemos.
 * @param props El tercero y qué hacer al cerrar.
 */
export function VentanaCompensar({ tercero, alCerrar }: { tercero: Tercero; alCerrar: () => void }) {
	const { enviar, enviando } = useEnvio(compensar);
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof formularioDeCompensacion>>({
		resolver: zodResolver(formularioDeCompensacion),
		defaultValues: { monto: centavosACampo(tercero.maximo_compensar_centavos) },
	});
	// Las cifras de después se mueven con lo que se escribe: el mismo monto baja de los dos lados.
	const monto = pesosACentavos(formulario.watch("monto")) ?? 0;
	const nosDebe = tercero.nos_debe_centavos ?? 0;
	const leDebemos = tercero.le_debemos_centavos ?? 0;
	const guardar = formulario.handleSubmit(async (valores) => {
		const salio = await enviar(
			{ datos: { tercero_id: tercero.tercero_id, monto_centavos: pesosACentavos(valores.monto) ?? 0 } },
			(campos) => {
				if (campos.monto_centavos !== undefined) formulario.setError("monto", { message: campos.monto_centavos });
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Compensar con ${tercero.nombre}`}
			subtitulo="Lo que nos debe se descuenta de lo que le debemos. No se mueve dinero."
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void guardar()}>
					Compensar
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
				<div className="grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
					<Dato etiqueta="Nos debe">
						{montoEnPantalla(nosDebe)} → {montoEnPantalla(nosDebe - monto)}
					</Dato>
					<Dato etiqueta="Le debemos">
						{montoEnPantalla(leDebemos)} → {montoEnPantalla(leDebemos - monto)}
					</Dato>
					<Dato etiqueta="Saldo neto">{montoEnPantalla(tercero.neto.monto_centavos)} · no cambia</Dato>
				</div>
				<Campo
					enVentana
					etiqueta="Monto"
					inputMode="numeric"
					error={formulario.formState.errors.monto?.message}
					{...formulario.register("monto")}
				/>
			</form>
		</Ventana>
	);
}
