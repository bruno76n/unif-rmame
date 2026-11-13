/**
 * La ventana «Resolver {RC}»: «Cómo se resolvió» (opcional, hasta 200). «Marcar resuelto» llama
 * `calidad.resolver_reclamo` con la versión del reclamo; si cambió mientras se veía, lo dice y conserva lo escrito.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Resolver {RC}»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { resolverReclamo } from "@uniformame/compartido/contratos/calidad/reclamos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion, volverALeer } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";

/**
 * La ventana para marcar resuelto un reclamo.
 * @param props El reclamo (cerrada si es nulo) y qué hacer al cerrarla.
 */
export function VentanaResolverReclamo({
	reclamo,
	alCerrar,
}: {
	reclamo: { reclamo_id: string; version: number; folio: string } | null;
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const consultas = useQueryClient();
	const formulario = useForm<z.input<typeof resolverReclamo.entrada>>({
		resolver: zodResolver(resolverReclamo.entrada),
		defaultValues: { reclamo_id: "", resolucion: "" },
	});
	const resolver = useAccion(resolverReclamo, loQueCambiaEnCalidad);
	const abierta = reclamo !== null;
	const reclamoId = reclamo?.reclamo_id;
	// Al abrir otro reclamo, la resolución vacía; si solo llega su versión nueva (un choque), lo escrito se queda.
	useEffect(() => {
		if (reclamoId === undefined) return;
		formulario.reset({ reclamo_id: reclamoId, resolucion: "" });
		resolver.reset();
	}, [reclamoId, formulario, resolver.reset]);
	const falla = resolver.error === null ? null : leerFalla(resolver.error);
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo={`Resolver ${reclamo?.folio ?? ""}`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || resolver.isPending}
					onClick={formulario.handleSubmit((datos) =>
						resolver.mutate(
							{ datos, version: reclamo?.version ?? 0 },
							{
								onSuccess: alCerrar,
								// Con un choque, se vuelve a leer lo nuevo y se conserva lo escrito.
								onError: () => void volverALeer(consultas, loQueCambiaEnCalidad),
							},
						),
					)}
				>
					Marcar resuelto
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={reclamo?.folio ?? ""} /> : null}
				<Campo
					etiqueta="Cómo se resolvió"
					enVentana
					maxLength={200}
					placeholder="Se repusieron las 4 piezas"
					error={formulario.formState.errors.resolucion?.message}
					{...formulario.register("resolucion")}
				/>
			</div>
		</Ventana>
	);
}
