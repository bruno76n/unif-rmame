/**
 * La ventana «Defecto nuevo»: Defecto (4 letras o más) y «En qué operaciones pasa» (un botón por operación del
 * catálogo; al menos una). «Agregar al catálogo» llama `calidad.agregar_defecto`.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Defecto nuevo»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { agregarDefecto } from "@uniformame/compartido/contratos/calidad/revision";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";

/**
 * La ventana del defecto nuevo.
 * @param props Si está abierta, qué hacer al cerrarla y las operaciones del catálogo.
 */
export function VentanaDefectoNuevo({
	abierta,
	alCerrar,
	operaciones,
}: {
	abierta: boolean;
	alCerrar: () => void;
	operaciones: readonly { operacion_id: string; nombre: string }[];
}) {
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof agregarDefecto.entrada>>({
		resolver: zodResolver(agregarDefecto.entrada),
		defaultValues: { nombre: "", operacion_ids: [] },
	});
	const agregar = useAccion(agregarDefecto, loQueCambiaEnCalidad);
	// Al abrir, vacía.
	useEffect(() => {
		if (!abierta) return;
		formulario.reset({ nombre: "", operacion_ids: [] });
		agregar.reset();
	}, [abierta, formulario, agregar.reset]);
	const escogidas = formulario.watch("operacion_ids");
	const falla = agregar.error === null ? null : leerFalla(agregar.error);
	const errorDe = (campo: "nombre" | "operacion_ids") =>
		formulario.formState.errors[campo]?.message ?? (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	/** Prende o apaga una operación. */
	const alternar = (operacionId: string) =>
		formulario.setValue(
			"operacion_ids",
			escogidas.includes(operacionId) ? escogidas.filter((una) => una !== operacionId) : [...escogidas, operacionId],
			{ shouldValidate: formulario.formState.isSubmitted },
		);
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo="Defecto nuevo"
			ancha
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || agregar.isPending}
					onClick={formulario.handleSubmit((datos) => agregar.mutate({ datos }, { onSuccess: alCerrar }))}
				>
					Agregar al catálogo
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Campo
					etiqueta="Defecto"
					enVentana
					maxLength={60}
					error={errorDe("nombre")}
					{...formulario.register("nombre")}
				/>
				<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
					<legend className="mb-2 font-semibold text-etiqueta text-tinta2">En qué operaciones pasa</legend>
					<div className="flex flex-wrap gap-1.5">
						{operaciones.map((operacion) => {
							const prendida = escogidas.includes(operacion.operacion_id);
							return (
								<Boton
									key={operacion.operacion_id}
									chico
									variante={prendida ? "principal" : "secundario"}
									aria-pressed={prendida}
									{...(prendida ? { icono: Check } : {})}
									onClick={() => alternar(operacion.operacion_id)}
								>
									{operacion.nombre}
								</Boton>
							);
						})}
					</div>
					{errorDe("operacion_ids") === undefined ? null : (
						<LineaDeAviso tono="error">{errorDe("operacion_ids")}</LineaDeAviso>
					)}
				</fieldset>
			</div>
		</Ventana>
	);
}
