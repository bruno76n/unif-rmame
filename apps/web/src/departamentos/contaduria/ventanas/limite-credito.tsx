/**
 * La ventana «Límite de crédito de {cliente}»: el límite de hoy y cuánto debe; «Límite nuevo, en pesos» (0 lo deja sin
 * crédito) y «Días de crédito». «Guardar» manda cada campo que cambió, primero el límite
 * (`contaduria.cambiar_limite_credito`) y después los días (`contaduria.cambiar_dias_credito`), con la versión del
 * crédito.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/credito-de-clientes.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { clienteDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { cambiarDiasCredito, cambiarLimiteCredito } from "@uniformame/compartido/contratos/contaduria/credito";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { useEnvio } from "../envio.ts";

/** Lo que se lee del cliente. */
type Cliente = z.infer<typeof clienteDeContaduria.resultado>;

/** El formulario, con los esquemas del contrato. */
const formularioDeLimite = z.object({
	limite: z
		.string()
		.refine(
			(texto) => cambiarLimiteCredito.entrada.shape.limite_centavos.safeParse(pesosACentavos(texto)).success,
			"Escribe el límite en pesos, sin centavos.",
		),
	dias: z
		.string()
		.refine(
			(texto) => cambiarDiasCredito.entrada.shape.dias_credito.safeParse(Number(texto)).success,
			"Escribe los días de crédito.",
		),
});

/**
 * La ventana del límite y los días de crédito de un cliente.
 * @param props El cliente y qué hacer al cerrar.
 */
export function VentanaLimiteCredito({ cliente, alCerrar }: { cliente: Cliente; alCerrar: () => void }) {
	const limite = useEnvio(cambiarLimiteCredito);
	const dias = useEnvio(cambiarDiasCredito);
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof formularioDeLimite>>({
		resolver: zodResolver(formularioDeLimite),
		defaultValues: { limite: centavosACampo(cliente.limite_centavos), dias: String(cliente.dias_credito) },
	});
	const errores = formulario.formState.errors;
	const guardar = formulario.handleSubmit(async (valores) => {
		const limiteNuevo = pesosACentavos(valores.limite) ?? 0;
		const diasNuevos = Number(valores.dias);
		let version = cliente.version_credito;
		if (limiteNuevo !== cliente.limite_centavos) {
			const salio = await limite.enviar(
				{ datos: { cliente_id: cliente.cliente_id, limite_centavos: limiteNuevo }, version },
				(campos) => {
					if (campos.limite_centavos !== undefined) formulario.setError("limite", { message: campos.limite_centavos });
				},
			);
			if (salio === undefined) return;
			version = salio.version ?? version;
		}
		if (diasNuevos !== cliente.dias_credito) {
			const salio = await dias.enviar(
				{ datos: { cliente_id: cliente.cliente_id, dias_credito: diasNuevos }, version },
				(campos) => {
					if (campos.dias_credito !== undefined) formulario.setError("dias", { message: campos.dias_credito });
				},
			);
			if (salio === undefined) return;
		}
		alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Límite de crédito de ${cliente.nombre}`}
			subtitulo={`Hoy: ${cliente.limite_centavos === 0 ? "Sin crédito" : montoEnPantalla(cliente.limite_centavos)} · debe ${montoEnPantalla(cliente.nos_debe_centavos)}`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || limite.enviando || dias.enviando}
					onClick={() => void guardar()}
				>
					Guardar
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
				{limite.choco || dias.choco ? (
					<EstadoDePantalla tipo="choque" documento={`El crédito de ${cliente.nombre}`} />
				) : null}
				<Campo
					enVentana
					etiqueta="Límite nuevo, en pesos"
					inputMode="numeric"
					error={errores.limite?.message}
					{...formulario.register("limite")}
				/>
				<Campo
					enVentana
					etiqueta="Días de crédito"
					inputMode="numeric"
					error={errores.dias?.message}
					{...formulario.register("dias")}
				/>
			</form>
		</Ventana>
	);
}
