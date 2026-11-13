/**
 * La ventana «Reportar falla»: la máquina (las activas sin falla abierta), «Qué tiene» (los motivos de falla) y «Nota»
 * (opcional, hasta 200). Con un motivo que detiene la máquina: «La máquina queda parada.». «Reportar falla» llama
 * `mantenimiento.reportar_falla`.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («`mantenimiento.reportar_falla`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { opcionesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { reportarFalla } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { erroresEnSusCampos } from "../comun.tsx";
import { useEnvio } from "../envio.ts";

/** El formulario, con el esquema del contrato: la nota vacía no va. */
const formulario = z.object({
	maquina_id: reportarFalla.entrada.shape.maquina_id,
	motivo_falla_id: reportarFalla.entrada.shape.motivo_falla_id,
	nota: reportarFalla.entrada.shape.nota,
});

/**
 * La ventana «Reportar falla».
 * @param props Cómo cerrarla.
 */
export function VentanaReportarFalla({ alCerrar }: { alCerrar: () => void }) {
	const opciones = useConsulta(opcionesDeMantenimiento, {});
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(reportarFalla);
	const forma = useForm<z.input<typeof formulario>, unknown, z.output<typeof formulario>>({
		resolver: zodResolver(formulario),
		defaultValues: { maquina_id: "", motivo_falla_id: "", nota: "" },
	});
	const motivo = opciones.data?.motivos.find((uno) => uno.id === forma.watch("motivo_falla_id"));
	const reportar = forma.handleSubmit(async ({ nota, ...datos }) => {
		const salio = await enviar(
			{ datos: { ...datos, ...(nota === undefined || nota === "" ? {} : { nota }) } },
			(falla) => erroresEnSusCampos(falla.campos, forma),
		);
		if (salio !== undefined) alCerrar();
	});
	const error = (campo: keyof z.input<typeof formulario>) => forma.formState.errors[campo]?.message;
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Reportar falla"
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void reportar()}>
					Reportar falla
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={3}>
				{({ maquinas, motivos }) => (
					<form className="flex flex-col gap-3" onSubmit={(evento) => void reportar(evento)}>
						<Selector
							etiqueta="Máquina"
							enVentana
							vacio="Escoge la máquina"
							opciones={maquinas
								.filter((maquina) => !maquina.con_falla_abierta)
								.map((maquina) => ({ valor: maquina.id, texto: `${maquina.folio} · ${maquina.nombre}` }))}
							error={error("maquina_id")}
							{...forma.register("maquina_id")}
						/>
						<Selector
							etiqueta="Qué tiene"
							enVentana
							vacio="Escoge"
							opciones={motivos.map((uno) => ({ valor: uno.id, texto: uno.nombre }))}
							error={error("motivo_falla_id")}
							{...forma.register("motivo_falla_id")}
						/>
						{motivo?.detiene === true ? <LineaDeAviso tono="advertencia">La máquina queda parada.</LineaDeAviso> : null}
						<Campo
							etiqueta="Nota (opcional)"
							enVentana
							maxLength={200}
							autoComplete="off"
							error={error("nota")}
							{...forma.register("nota")}
						/>
					</form>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
