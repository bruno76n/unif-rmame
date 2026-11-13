/**
 * La ventana «Máquina nueva»: Nombre («cómo le dicen en el taller»), Tipo (los que hay, u «Otro tipo» con «¿Qué
 * tipo?»), Área, Marca, Modelo y Serie (opcionales) y «La trae». «Dar de alta» llama `mantenimiento.alta_maquina`.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («`mantenimiento.alta_maquina`»)
 *
 * Lo capturado se vuelve los datos de la acción y se revisa con el esquema de su contrato: «Otro tipo» manda el tipo
 * nuevo y lo opcional vacío no va.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { opcionesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { altaMaquina } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { erroresEnSusCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** El valor de «Otro tipo» en el selector de tipos. */
const otroTipo = "otro";

/** Lo capturado, como texto. */
const capturado = z.object({
	nombre: z.string(),
	tipo_maquina_id: z.string(),
	tipo_nuevo: z.string(),
	area_id: z.string(),
	marca: z.string(),
	modelo: z.string(),
	serie: z.string(),
	persona_id: z.string(),
});

/** Lo capturado, como texto. */
type Capturado = z.infer<typeof capturado>;

/**
 * Lo capturado como los datos de `mantenimiento.alta_maquina`: con «Otro tipo» va el tipo nuevo; lo opcional vacío no
 * va.
 * @param capturado Lo capturado.
 */
function aDatos(capturado: Capturado): z.input<typeof altaMaquina.entrada> {
	const opcional = (texto: string) => (texto.trim() === "" ? undefined : texto);
	return {
		nombre: capturado.nombre,
		...(capturado.tipo_maquina_id === otroTipo
			? { tipo_nuevo: capturado.tipo_nuevo }
			: { tipo_maquina_id: opcional(capturado.tipo_maquina_id) }),
		area_id: capturado.area_id,
		marca: opcional(capturado.marca),
		modelo: opcional(capturado.modelo),
		serie: opcional(capturado.serie),
		persona_id: capturado.persona_id,
	};
}

/** El formulario: lo capturado, como texto, se vuelve los datos de la acción y se revisa con el esquema del contrato. */
const formulario = capturado.transform(aDatos).pipe(altaMaquina.entrada);

/**
 * La ventana «Máquina nueva».
 * @param props Cómo cerrarla.
 */
export function VentanaMaquinaNueva({ alCerrar }: { alCerrar: () => void }) {
	const opciones = useConsulta(opcionesDeMantenimiento, {});
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(altaMaquina);
	const forma = useForm<Capturado, unknown, z.output<typeof altaMaquina.entrada>>({
		resolver: zodResolver(formulario),
		defaultValues: {
			nombre: "",
			tipo_maquina_id: "",
			tipo_nuevo: "",
			area_id: "",
			marca: "",
			modelo: "",
			serie: "",
			persona_id: "",
		},
	});
	const darDeAlta = forma.handleSubmit(async (datos) => {
		const salio = await enviar({ datos }, (falla) => {
			erroresEnSusCampos(falla.campos, forma);
			if (falla.codigo === "maquina_repetida") forma.setError("nombre", { message: falla.mensaje });
			if (falla.codigo === "serie_repetida") forma.setError("serie", { message: falla.mensaje });
			if (falla.codigo === "persona_no_valida") forma.setError("persona_id", { message: falla.mensaje });
		});
		if (salio !== undefined) alCerrar();
	});
	const error = (campo: keyof Capturado) => forma.formState.errors[campo]?.message;
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo="Máquina nueva"
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void darDeAlta()}>
					Dar de alta
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={4}>
				{({ tipos, areas, personas }) => (
					<form className="flex flex-col gap-3" onSubmit={(evento) => void darDeAlta(evento)}>
						<Campo
							etiqueta="Nombre"
							enVentana
							placeholder="cómo le dicen en el taller"
							maxLength={40}
							autoComplete="off"
							error={error("nombre")}
							{...forma.register("nombre")}
						/>
						<Selector
							etiqueta="Tipo"
							enVentana
							vacio="Escoge el tipo"
							opciones={[
								...tipos.map((tipo) => ({ valor: tipo.id, texto: tipo.nombre })),
								{ valor: otroTipo, texto: "Otro tipo" },
							]}
							error={error("tipo_maquina_id")}
							{...forma.register("tipo_maquina_id")}
						/>
						{forma.watch("tipo_maquina_id") === otroTipo ? (
							<Campo
								etiqueta="¿Qué tipo?"
								enVentana
								maxLength={40}
								autoComplete="off"
								error={error("tipo_nuevo")}
								{...forma.register("tipo_nuevo")}
							/>
						) : null}
						<Selector
							etiqueta="Área"
							enVentana
							vacio="Escoge el área"
							opciones={areas.map((area) => ({ valor: area.id, texto: area.nombre }))}
							error={error("area_id")}
							{...forma.register("area_id")}
						/>
						<div className="grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
							<Campo
								etiqueta="Marca (opcional)"
								enVentana
								autoComplete="off"
								error={error("marca")}
								{...forma.register("marca")}
							/>
							<Campo
								etiqueta="Modelo (opcional)"
								enVentana
								autoComplete="off"
								error={error("modelo")}
								{...forma.register("modelo")}
							/>
							<Campo
								etiqueta="Serie (opcional)"
								enVentana
								autoComplete="off"
								error={error("serie")}
								{...forma.register("serie")}
							/>
						</div>
						<Selector
							etiqueta="La trae"
							enVentana
							vacio="¿Quién la trae?"
							opciones={personas.map((persona) => ({ valor: persona.id, texto: persona.nombre }))}
							error={error("persona_id")}
							{...forma.register("persona_id")}
						/>
					</form>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
