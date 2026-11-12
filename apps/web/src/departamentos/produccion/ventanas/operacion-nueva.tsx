/**
 * La ventana «Operación nueva en {flujo}»: Operación (propone los nombres del catálogo), «La hace» y «Va antes de»
 * (propone `produccion.operacion_antes_por_omision`, Planchado, o la última). «Agregar operación» llama
 * `produccion.agregar_operacion_flujo` con la versión del flujo.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Operación nueva en {flujo}»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { agregarOperacionFlujo } from "@uniformame/compartido/contratos/produccion/flujos";
import type { operacionesDeProduccion } from "@uniformame/compartido/contratos/produccion/operaciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion, volverALeer } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";

/** Lo que regresa `produccion.operaciones`. */
type Operaciones = z.infer<typeof operacionesDeProduccion.resultado>;

/**
 * La ventana de la operación nueva.
 * @param props El flujo (cerrada si es nulo), qué hacer al cerrarla y lo que regresa `produccion.operaciones`.
 */
export function VentanaOperacionNueva({
	flujo,
	alCerrar,
	operaciones,
}: {
	flujo: Operaciones["flujos"][number] | null;
	alCerrar: () => void;
	operaciones: Operaciones;
}) {
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof agregarOperacionFlujo.entrada>>({
		resolver: zodResolver(agregarOperacionFlujo.entrada),
		defaultValues: { flujo_id: "", operacion: "", persona_base_id: "", va_antes_de_id: "" },
	});
	const consultas = useQueryClient();
	const agregar = useAccion(agregarOperacionFlujo, loQueCambiaEnProduccion);
	// Al abrir: el flujo y la que propone «Va antes de» (la de por omisión, o la última).
	useEffect(() => {
		if (flujo === null) return;
		const propuesta =
			flujo.operaciones.find((operacion) => operacion.operacion === operaciones.antes_por_omision) ??
			flujo.operaciones.at(-1);
		formulario.reset({
			flujo_id: flujo.flujo_id,
			operacion: "",
			persona_base_id: "",
			va_antes_de_id: propuesta?.flujo_operacion_id ?? "",
		});
		agregar.reset();
	}, [flujo, operaciones.antes_por_omision, formulario, agregar.reset]);
	const falla = agregar.error === null ? null : leerFalla(agregar.error);
	const errorDe = (campo: "operacion" | "persona_base_id" | "va_antes_de_id") =>
		formulario.formState.errors[campo]?.message ?? (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	return (
		<Ventana
			abierta={flujo !== null}
			alCerrar={alCerrar}
			titulo={`Operación nueva en ${flujo?.nombre ?? ""}`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || agregar.isPending}
					onClick={formulario.handleSubmit((datos) =>
						agregar.mutate(
							{ datos, version: flujo?.version ?? 0 },
							{
								onSuccess: alCerrar,
								// Con un choque, se vuelve a leer lo nuevo y se conserva lo escrito.
								onError: () => void volverALeer(consultas, loQueCambiaEnProduccion),
							},
						),
					)}
				>
					Agregar operación
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={flujo?.nombre ?? ""} /> : null}
				<Campo
					etiqueta="Operación"
					enVentana
					list="operaciones-del-catalogo"
					maxLength={40}
					error={errorDe("operacion")}
					{...formulario.register("operacion")}
				/>
				<datalist id="operaciones-del-catalogo">
					{operaciones.catalogo.map((nombre) => (
						<option key={nombre} value={nombre} />
					))}
				</datalist>
				<Selector
					etiqueta="La hace"
					enVentana
					vacio="Escoge a la persona"
					opciones={operaciones.personas.map((persona) => ({ valor: persona.persona_id, texto: persona.nombre }))}
					error={errorDe("persona_base_id")}
					{...formulario.register("persona_base_id")}
				/>
				<Selector
					etiqueta="Va antes de"
					enVentana
					opciones={(flujo?.operaciones ?? [])
						.filter((operacion) => !operacion.es_corte)
						.map((operacion) => ({ valor: operacion.flujo_operacion_id, texto: operacion.operacion }))}
					error={errorDe("va_antes_de_id")}
					{...formulario.register("va_antes_de_id")}
				/>
			</div>
		</Ventana>
	);
}
