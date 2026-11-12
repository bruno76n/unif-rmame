/**
 * La ventana «Flujo nuevo»: Nombre y «Parte de» (un flujo vigente, que se copia con sus operaciones, personas y
 * tarifas, o «Una sola operación: la prenda completa la hace una persona»); con una sola operación, «¿Quién corta?» y
 * «¿Quién la hace?». «Crear flujo» llama `produccion.crear_flujo`.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Flujo nuevo»)
 */

import { crearFlujo } from "@uniformame/compartido/contratos/produccion/flujos";
import type { operacionesDeProduccion } from "@uniformame/compartido/contratos/produccion/operaciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";

/** La opción de «Parte de» que no copia ningún flujo. */
const unaSola = "una_sola_operacion";

/** Lo que se captura: «Parte de» junta el flujo de origen y «Una sola operación». */
interface Captura {
	nombre: string;
	parte: string;
	persona_corte_id: string;
	persona_base_id: string;
}

/**
 * La ventana del flujo nuevo.
 * @param props Si está abierta, qué hacer al cerrarla y lo que regresa `produccion.operaciones`.
 */
export function VentanaFlujoNuevo({
	abierta,
	alCerrar,
	operaciones,
}: {
	abierta: boolean;
	alCerrar: () => void;
	operaciones: z.infer<typeof operacionesDeProduccion.resultado>;
}) {
	const conConexion = useConConexion();
	const formulario = useForm<Captura>({
		defaultValues: { nombre: "", parte: "", persona_corte_id: "", persona_base_id: "" },
	});
	const crear = useAccion(crearFlujo, loQueCambiaEnProduccion);
	const parte = formulario.watch("parte");
	const falla = crear.error === null ? null : leerFalla(crear.error);
	// La entrada del contrato, armada con lo capturado: así se valida igual que en la API.
	const entrada = (captura: Captura): z.input<typeof crearFlujo.entrada> =>
		captura.parte === unaSola
			? {
					nombre: captura.nombre,
					parte_de: "una_sola_operacion",
					persona_corte_id: captura.persona_corte_id,
					persona_base_id: captura.persona_base_id,
				}
			: { nombre: captura.nombre, parte_de: "flujo", flujo_origen_id: captura.parte };
	const validado = crearFlujo.entrada.safeParse(entrada(formulario.watch()));
	const errorDe = (campo: string) =>
		(formulario.formState.isSubmitted && !validado.success
			? validado.error.issues.find((problema) => problema.path[0] === campo)?.message
			: undefined) ?? (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	const cerrar = () => {
		formulario.reset();
		crear.reset();
		alCerrar();
	};
	const personas = operaciones.personas.map((persona) => ({ valor: persona.persona_id, texto: persona.nombre }));
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo="Flujo nuevo"
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || crear.isPending}
					onClick={formulario.handleSubmit((captura) => {
						const datos = crearFlujo.entrada.safeParse(entrada(captura));
						if (datos.success) crear.mutate({ datos: datos.data }, { onSuccess: cerrar });
					})}
				>
					Crear flujo
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Campo
					etiqueta="Nombre"
					enVentana
					maxLength={60}
					error={errorDe("nombre")}
					{...formulario.register("nombre")}
				/>
				<Selector
					etiqueta="Parte de"
					enVentana
					vacio="Escoge de cuál parte"
					opciones={[
						...operaciones.flujos.map((flujo) => ({ valor: flujo.flujo_id, texto: flujo.nombre })),
						{ valor: unaSola, texto: "Una sola operación: la prenda completa la hace una persona" },
					]}
					error={errorDe("parte_de") ?? errorDe("flujo_origen_id")}
					{...formulario.register("parte")}
				/>
				{parte === unaSola ? (
					<>
						<Selector
							etiqueta="¿Quién corta?"
							enVentana
							vacio="Escoge a la persona"
							opciones={personas}
							error={errorDe("persona_corte_id")}
							{...formulario.register("persona_corte_id")}
						/>
						<Selector
							etiqueta="¿Quién la hace?"
							enVentana
							vacio="Escoge a la persona"
							opciones={personas}
							error={errorDe("persona_base_id")}
							{...formulario.register("persona_base_id")}
						/>
					</>
				) : null}
			</div>
		</Ventana>
	);
}
