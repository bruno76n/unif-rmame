/**
 * La ventana «Reparación de {máquina}» o «Registrar servicio», la misma en dos formas. La reparación dice abajo «{FM} ·
 * {lo que le pasa}» y su botón es «Marcar resuelta»; el servicio suelto suma el campo Máquina (las activas) y su botón
 * es «Registrar servicio». Campos: Técnico (de la lista; empieza en el de la falla), «Qué se hizo», Costo (pesos, puede
 * ser 0) y «Horas de paro» (enteras; propone las que lleva la falla si detuvo la máquina, si no 0). Llama
 * `mantenimiento.registrar_servicio` con la versión de la falla, o la de la máquina si es suelto.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (regla 10, «`mantenimiento.registrar_servicio`»)
 *
 * El costo se escribe en pesos y viaja en centavos (`pesosACentavos`, la misma lectura del dinero de todo el sistema).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { fallaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { opcionesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { registrarServicio } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
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

/** La falla del cajón, si es una reparación. */
type Falla = z.infer<typeof fallaDeMantenimiento.resultado>;

/** Lo capturado, como texto. */
const capturado = z.object({
	falla_id: z.string(),
	maquina_id: z.string(),
	tecnico_id: z.string(),
	que_se_hizo: z.string(),
	/** El costo como se escribe, en pesos; se llama como el dato de la acción para que su error caiga aquí. */
	costo_centavos: z.string(),
	horas_paro: z.string(),
});

/** Lo capturado, como texto. */
type Capturado = z.infer<typeof capturado>;

/**
 * Lo capturado como los datos de la acción: la falla o la máquina, el costo en centavos y las horas como número.
 * @param valores Lo capturado.
 */
function aDatos(valores: Capturado): z.input<typeof registrarServicio.entrada> {
	const horas = valores.horas_paro.trim();
	return {
		...(valores.falla_id === "" ? { maquina_id: valores.maquina_id } : { falla_id: valores.falla_id }),
		tecnico_id: valores.tecnico_id,
		que_se_hizo: valores.que_se_hizo,
		// Lo que no es dinero ni un número llega como NaN, y el esquema dice su error.
		costo_centavos: pesosACentavos(valores.costo_centavos.trim()) ?? Number.NaN,
		horas_paro: horas === "" ? Number.NaN : Number(horas),
	};
}

/** El formulario, revisado con el esquema del contrato. */
const formulario = capturado.transform(aDatos).pipe(registrarServicio.entrada);

/**
 * La ventana de una reparación (con la falla) o de un servicio suelto (sin ella).
 * @param props La falla, si es una reparación; cómo cerrarla; y qué hacer al registrar (por omisión, cerrarla).
 */
export function VentanaServicio({
	falla,
	alCerrar,
	alRegistrar = alCerrar,
}: {
	falla?: Falla;
	alCerrar: () => void;
	alRegistrar?: () => void;
}) {
	const opciones = useConsulta(opcionesDeMantenimiento, {});
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(registrarServicio);
	const forma = useForm<Capturado, unknown, z.output<typeof formulario>>({
		resolver: zodResolver(formulario),
		defaultValues: {
			falla_id: falla?.falla_id ?? "",
			maquina_id: "",
			tecnico_id: falla?.tecnico_id ?? "",
			que_se_hizo: "",
			costo_centavos: "",
			horas_paro: String(falla?.horas_propuestas ?? 0),
		},
	});
	const registrar = forma.handleSubmit(async (datos) => {
		// La reparación va con la versión de su falla; el servicio suelto, con la de su máquina.
		const version =
			falla?.version ?? opciones.data?.maquinas.find((maquina) => maquina.id === datos.maquina_id)?.version;
		const salio = await enviar({ datos, ...(version === undefined ? {} : { version }) }, (fallo) => {
			erroresEnSusCampos(fallo.campos, forma);
			if (fallo.codigo === "tecnico_de_baja") forma.setError("tecnico_id", { message: fallo.mensaje });
		});
		if (salio !== undefined) alRegistrar();
	});
	const error = (campo: keyof Capturado) => forma.formState.errors[campo]?.message;
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={falla === undefined ? "Registrar servicio" : `Reparación de ${falla.maquina}`}
			{...(falla === undefined ? {} : { subtitulo: `${falla.folio} · ${falla.motivo}` })}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void registrar()}>
					{falla === undefined ? "Registrar servicio" : "Marcar resuelta"}
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={4}>
				{({ maquinas, tecnicos }) => (
					<form className="flex flex-col gap-3" onSubmit={(evento) => void registrar(evento)}>
						{choco ? <EstadoDePantalla tipo="choque" documento={falla?.folio ?? "La máquina"} /> : null}
						{falla === undefined ? (
							<Selector
								etiqueta="Máquina"
								enVentana
								vacio="Escoge la máquina"
								opciones={maquinas.map((maquina) => ({
									valor: maquina.id,
									texto: `${maquina.nombre} · ${maquina.folio}`,
								}))}
								error={error("maquina_id")}
								{...forma.register("maquina_id")}
							/>
						) : null}
						<Selector
							etiqueta="Técnico"
							enVentana
							vacio="Escoge el técnico"
							opciones={tecnicos.map((tecnico) => ({ valor: tecnico.id, texto: tecnico.nombre }))}
							error={error("tecnico_id")}
							{...forma.register("tecnico_id")}
						/>
						<Campo
							etiqueta="Qué se hizo"
							enVentana
							placeholder="Por ejemplo: cambio de motor"
							maxLength={80}
							autoComplete="off"
							error={error("que_se_hizo")}
							{...forma.register("que_se_hizo")}
						/>
						<div className="grid grid-cols-2 gap-3">
							<Campo
								etiqueta="Costo"
								enVentana
								inputMode="decimal"
								maxLength={12}
								autoComplete="off"
								error={error("costo_centavos")}
								{...forma.register("costo_centavos")}
							/>
							<Campo
								etiqueta="Horas de paro"
								enVentana
								inputMode="numeric"
								maxLength={4}
								autoComplete="off"
								error={error("horas_paro")}
								{...forma.register("horas_paro")}
							/>
						</div>
					</form>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
