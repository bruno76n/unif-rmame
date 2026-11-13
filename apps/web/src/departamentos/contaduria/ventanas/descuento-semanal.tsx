/**
 * La ventana «Descuento semanal»: la persona (las activas, con su área; si ya tiene, «Hoy: {monto} por semana ·
 * {motivo}»), el descuento por semana (pesos enteros; 0 lo quita) y por qué. «Guardar descuento» llama a
 * `contaduria.guardar_descuento_semanal` con la versión del vigente, si tiene.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/nomina.md (regla 9)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { nominaSemana } from "@uniformame/compartido/contratos/contaduria/consultas-nomina";
import { guardarDescuentoSemanal } from "@uniformame/compartido/contratos/contaduria/nomina";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { useEnvio } from "../envio.ts";

/** Las personas para escoger, de `contaduria.nomina_semana`. */
type Personas = z.infer<typeof nominaSemana.resultado>["personas"];

/** El formulario, con los esquemas del contrato. */
const formularioDeDescuento = z.object({
	persona_id: guardarDescuentoSemanal.entrada.shape.persona_id,
	monto: z
		.string()
		.refine(
			(texto) => guardarDescuentoSemanal.entrada.shape.monto_semanal_centavos.safeParse(pesosACentavos(texto)).success,
			"Escribe el descuento en pesos; 0 lo quita.",
		),
	motivo: z.string(),
});

/**
 * La ventana del descuento semanal de una persona.
 * @param props Las personas y qué hacer al cerrar.
 */
export function VentanaDescuentoSemanal({ personas, alCerrar }: { personas: Personas; alCerrar: () => void }) {
	const { enviar, enviando } = useEnvio(guardarDescuentoSemanal);
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof formularioDeDescuento>>({
		resolver: zodResolver(formularioDeDescuento),
		defaultValues: { persona_id: "", monto: "", motivo: "" },
	});
	const errores = formulario.formState.errors;
	const escogida = personas.find((persona) => persona.persona_id === formulario.watch("persona_id"));
	const guardar = formulario.handleSubmit(async (valores) => {
		const monto = pesosACentavos(valores.monto) ?? 0;
		const salio = await enviar(
			{
				datos: {
					persona_id: valores.persona_id,
					monto_semanal_centavos: monto,
					...(valores.motivo.trim() === "" ? {} : { motivo: valores.motivo.trim() }),
				},
				...(escogida?.version === null || escogida?.version === undefined ? {} : { version: escogida.version }),
			},
			(campos) => {
				if (campos.motivo !== undefined) formulario.setError("motivo", { message: campos.motivo });
				if (campos.monto_semanal_centavos !== undefined) {
					formulario.setError("monto", { message: campos.monto_semanal_centavos });
				}
				if (campos.persona_id !== undefined) formulario.setError("persona_id", { message: campos.persona_id });
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Descuento semanal"
			{...(escogida?.descuento_semanal_centavos === undefined
				? {}
				: {
						subtitulo: `Hoy: ${montoEnPantalla(escogida.descuento_semanal_centavos)} por semana · ${escogida.descuento_motivo ?? ""}`,
					})}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void guardar()}>
					Guardar descuento
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
				<Selector
					enVentana
					etiqueta="Persona"
					vacio="Escoge a la persona"
					opciones={personas.map((persona) => ({
						valor: persona.persona_id,
						texto: `${persona.nombre} · ${persona.area}`,
					}))}
					error={errores.persona_id?.message}
					{...formulario.register("persona_id")}
				/>
				<Campo
					enVentana
					etiqueta="Descuento por semana"
					inputMode="numeric"
					error={errores.monto?.message}
					{...formulario.register("monto")}
				/>
				<Campo enVentana etiqueta="Por qué" error={errores.motivo?.message} {...formulario.register("motivo")} />
			</form>
		</Ventana>
	);
}
