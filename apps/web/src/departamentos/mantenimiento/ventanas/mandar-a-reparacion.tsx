/**
 * La ventana «Mandar {máquina} a reparación»: el técnico (de la lista, u «Otro técnico» con «Técnico o taller», que se
 * queda en la lista) y «¿La máquina se queda parada?» («Sí, se para»); si ya está parada no se pregunta: sigue así hasta
 * la reparación. «Mandar a reparación» llama `mantenimiento.mandar_a_reparacion` con la versión de la falla; el cajón se
 * queda abierto con lo nuevo.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (regla 8, «`mantenimiento.mandar_a_reparacion`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import type { fallaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { opcionesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { mandarAReparacion } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { erroresEnSusCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** La falla del cajón. */
type Falla = z.infer<typeof fallaDeMantenimiento.resultado>;

/** El valor de «Otro técnico» en el selector. */
const otroTecnico = "otro";

/** Lo capturado. */
const capturado = z.object({
	falla_id: z.string(),
	tecnico_id: z.string(),
	tecnico_nombre: z.string(),
	se_queda_parada: z.boolean(),
});

/**
 * Lo capturado como los datos de la acción: con «Otro técnico» va su nombre; si no, el de la lista.
 * @param valores Lo capturado.
 */
function aDatos(valores: z.infer<typeof capturado>): z.input<typeof mandarAReparacion.entrada> {
	return {
		falla_id: valores.falla_id,
		...(valores.tecnico_id === otroTecnico
			? { tecnico_nombre: valores.tecnico_nombre }
			: { tecnico_id: valores.tecnico_id === "" ? undefined : valores.tecnico_id }),
		se_queda_parada: valores.se_queda_parada,
	};
}

/** El formulario, revisado con el esquema del contrato. */
const formulario = capturado.transform(aDatos).pipe(mandarAReparacion.entrada);

/**
 * La ventana para mandar una falla reportada a reparación.
 * @param props La falla y cómo cerrar la ventana.
 */
export function VentanaMandarAReparacion({ falla, alCerrar }: { falla: Falla; alCerrar: () => void }) {
	const opciones = useConsulta(opcionesDeMantenimiento, {});
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(mandarAReparacion);
	const forma = useForm<z.infer<typeof capturado>, unknown, z.output<typeof formulario>>({
		resolver: zodResolver(formulario),
		// «Sí, se para» empieza marcado si la falla ya la detuvo (lo dice su motivo).
		defaultValues: { falla_id: falla.falla_id, tecnico_id: "", tecnico_nombre: "", se_queda_parada: falla.detuvo },
	});
	const mandar = forma.handleSubmit(async (datos) => {
		const salio = await enviar({ datos, version: falla.version }, (fallo) => {
			erroresEnSusCampos(fallo.campos, forma);
			if (fallo.codigo === "tecnico_de_baja") forma.setError("tecnico_id", { message: fallo.mensaje });
		});
		if (salio !== undefined) alCerrar();
	});
	const error = (campo: keyof z.infer<typeof capturado>) => forma.formState.errors[campo]?.message;
	const seQuedaParada = forma.watch("se_queda_parada");
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Mandar ${falla.maquina} a reparación`}
			subtitulo={`${falla.folio} · ${falla.motivo}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void mandar()}>
					Mandar a reparación
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={3}>
				{({ tecnicos }) => (
					<form className="flex flex-col gap-3" onSubmit={(evento) => void mandar(evento)}>
						{choco ? <EstadoDePantalla tipo="choque" documento={falla.folio} /> : null}
						<Selector
							etiqueta="Técnico"
							enVentana
							vacio="Escoge el técnico"
							opciones={[
								...tecnicos.map((tecnico) => ({ valor: tecnico.id, texto: tecnico.nombre })),
								{ valor: otroTecnico, texto: "Otro técnico" },
							]}
							error={error("tecnico_id")}
							{...forma.register("tecnico_id")}
						/>
						{forma.watch("tecnico_id") === otroTecnico ? (
							<Campo
								etiqueta="Técnico o taller"
								enVentana
								maxLength={60}
								autoComplete="off"
								error={error("tecnico_nombre")}
								{...forma.register("tecnico_nombre")}
							/>
						) : null}
						{falla.detuvo ? null : (
							<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
								<legend className="mb-1 font-semibold text-etiqueta text-tinta2">¿La máquina se queda parada?</legend>
								<Casilla
									etiqueta="Sí, se para"
									marcada={seQuedaParada}
									alCambiar={(marcada) => forma.setValue("se_queda_parada", marcada)}
								/>
							</fieldset>
						)}
					</form>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
