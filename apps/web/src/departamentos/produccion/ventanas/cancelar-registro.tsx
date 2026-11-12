/**
 * La ventana «Cancelar el registro de {persona}»: «{n} {operación} en {bulto}, del {fecha}» y el motivo. «Cancelar
 * registro» llama `produccion.cancelar_registro` con la versión del registro; si otro lo cambió mientras se veía, lo
 * dice y vuelve a leer el lote.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Cancelar el registro de {persona}»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { cancelarRegistro } from "@uniformame/compartido/contratos/produccion/registros";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { leerFalla, useAccion, volverALeer } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";

/** El registro que se cancela, como lo trae el cajón. */
export interface RegistroPorCancelar {
	registro_id: string;
	version: number;
	persona: string;
	operacion: string;
	bulto: string;
	cuando: string;
	buenas: number;
	danadas: number;
}

/**
 * La ventana para cancelar un registro de la tablet.
 * @param props El registro (cerrada si es nulo), el folio de su lote y qué hacer al cerrar.
 */
export function VentanaCancelarRegistro({
	registro,
	folioDelLote,
	alCerrar,
}: {
	registro: RegistroPorCancelar | null;
	folioDelLote: string;
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const formulario = useForm({
		resolver: zodResolver(cancelarRegistro.entrada),
		defaultValues: { registro_id: registro?.registro_id ?? "", motivo: "" },
	});
	const consultas = useQueryClient();
	const cancelar = useAccion(cancelarRegistro, loQueCambiaEnProduccion);
	useEffect(() => {
		formulario.reset({ registro_id: registro?.registro_id ?? "", motivo: "" });
		cancelar.reset();
	}, [registro, formulario, cancelar.reset]);
	const falla = cancelar.error === null ? null : leerFalla(cancelar.error);
	const error =
		formulario.formState.errors.motivo?.message ??
		(falla?.tipo === "regla" ? (falla.campos.motivo ?? undefined) : undefined);
	const piezas = registro === null ? 0 : registro.buenas + registro.danadas;
	const fecha = registro?.cuando.split(" · ")[0] ?? "";
	return (
		<Ventana
			abierta={registro !== null}
			alCerrar={alCerrar}
			titulo={`Cancelar el registro de ${registro?.persona ?? ""}`}
			{...(registro === null
				? {}
				: { subtitulo: `${piezas} ${registro.operacion} en ${registro.bulto}, del ${fecha}` })}
			accion={
				<Boton
					variante="peligro"
					disabled={!conConexion || cancelar.isPending || formulario.watch("motivo").trim() === ""}
					onClick={formulario.handleSubmit((datos) =>
						cancelar.mutate(
							{ datos, version: registro?.version ?? 0 },
							{
								onSuccess: () => alCerrar(),
								// Con un choque, se vuelve a leer lo nuevo y se conserva lo escrito.
								onError: () => void volverALeer(consultas, loQueCambiaEnProduccion),
							},
						),
					)}
				>
					Cancelar registro
				</Boton>
			}
		>
			{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={folioDelLote} /> : null}
			<Campo etiqueta="Motivo" enVentana error={error} {...formulario.register("motivo")} />
		</Ventana>
	);
}
