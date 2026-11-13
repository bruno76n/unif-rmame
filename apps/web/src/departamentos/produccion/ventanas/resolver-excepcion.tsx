/**
 * La ventana «Resolver excepción»: qué pasó y «Qué se hizo». Resolverla no mueve nada: si hace falta, primero se cancela
 * el registro. Llama `inventario.resolver_excepcion` con la versión de la excepción.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Resolver excepción»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { resolverExcepcion } from "@uniformame/compartido/contratos/inventario/excepciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { leerFalla, useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";

/** La excepción que se resuelve, como la trae Pendientes. */
export interface ExcepcionPorResolver {
	excepcion_id: string;
	version: number;
	titulo: string;
	detalle: string;
}

/**
 * La ventana para resolver una excepción del taller.
 * @param props La excepción (cerrada si es nula) y qué hacer al cerrar.
 */
export function VentanaResolverExcepcion({
	excepcion,
	alCerrar,
}: {
	excepcion: ExcepcionPorResolver | null;
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const formulario = useForm({
		resolver: zodResolver(resolverExcepcion.entrada),
		defaultValues: { excepcion_id: excepcion?.excepcion_id ?? "", resolucion: "" },
	});
	const resolver = useAccion(resolverExcepcion, loQueCambiaEnProduccion);
	useEffect(() => {
		formulario.reset({ excepcion_id: excepcion?.excepcion_id ?? "", resolucion: "" });
	}, [excepcion?.excepcion_id, formulario]);
	const falla = resolver.error === null ? null : leerFalla(resolver.error);
	const error =
		formulario.formState.errors.resolucion?.message ??
		(falla?.tipo === "regla" ? (falla.campos.resolucion ?? undefined) : undefined);
	return (
		<Ventana
			abierta={excepcion !== null}
			alCerrar={alCerrar}
			titulo="Resolver excepción"
			{...(excepcion === null ? {} : { subtitulo: `${excepcion.titulo} · ${excepcion.detalle}` })}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || resolver.isPending || formulario.watch("resolucion").trim() === ""}
					onClick={formulario.handleSubmit((datos) =>
						resolver.mutate({ datos, version: excepcion?.version ?? 0 }, { onSuccess: () => alCerrar() }),
					)}
				>
					Resolver
				</Boton>
			}
		>
			<Campo etiqueta="Qué se hizo" enVentana error={error} {...formulario.register("resolucion")} />
		</Ventana>
	);
}
