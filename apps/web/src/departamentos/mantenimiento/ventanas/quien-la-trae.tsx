/**
 * La ventana «{máquina}: ¿quién la trae?»: la gente activa del Taller y «Una falla abierta guarda quién la traía al
 * fallar.». «Guardar» llama `mantenimiento.cambiar_asignacion_maquina` con la versión de la máquina.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (regla 12, «`mantenimiento.cambiar_asignacion_maquina`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import type { maquinaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { opcionesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { cambiarAsignacionMaquina } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { erroresEnSusCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** La máquina del cajón. */
type Maquina = z.infer<typeof maquinaDeMantenimiento.resultado>;

/**
 * La ventana para cambiar quién trae una máquina.
 * @param props La máquina y cómo cerrar la ventana.
 */
export function VentanaQuienLaTrae({ maquina, alCerrar }: { maquina: Maquina; alCerrar: () => void }) {
	const opciones = useConsulta(opcionesDeMantenimiento, {});
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(cambiarAsignacionMaquina);
	const forma = useForm<
		z.input<typeof cambiarAsignacionMaquina.entrada>,
		unknown,
		z.output<typeof cambiarAsignacionMaquina.entrada>
	>({
		resolver: zodResolver(cambiarAsignacionMaquina.entrada),
		defaultValues: { maquina_id: maquina.maquina_id, persona_id: maquina.la_trae?.id ?? "" },
	});
	const guardar = forma.handleSubmit(async (datos) => {
		const salio = await enviar({ datos, version: maquina.version }, (fallo) => {
			erroresEnSusCampos(fallo.campos, forma);
			if (fallo.codigo === "persona_no_valida") forma.setError("persona_id", { message: fallo.mensaje });
		});
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`${maquina.nombre}: ¿quién la trae?`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void guardar()}>
					Guardar
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={2}>
				{({ personas }) => (
					<form className="flex flex-col gap-3" onSubmit={(evento) => void guardar(evento)}>
						{choco ? <EstadoDePantalla tipo="choque" documento={maquina.nombre} /> : null}
						<Selector
							etiqueta="La trae"
							enVentana
							vacio="¿Quién la trae?"
							opciones={personas.map((persona) => ({ valor: persona.id, texto: persona.nombre }))}
							error={forma.formState.errors.persona_id?.message}
							{...forma.register("persona_id")}
						/>
						<LineaDeAviso tono="info">Una falla abierta guarda quién la traía al fallar.</LineaDeAviso>
					</form>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
