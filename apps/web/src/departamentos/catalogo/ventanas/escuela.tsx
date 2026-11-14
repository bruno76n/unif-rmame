/**
 * La ventana «Agregar escuela» (→ `catalogo.agregar_escuela`) y la de editar una escuela (→ `catalogo.editar_escuela`):
 * Nombre y Municipio, validados con el mismo esquema del contrato; los errores del servidor salen junto a su campo.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Ventanas», «Escuelas y tallas»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { agregarEscuela, editarEscuela } from "@uniformame/compartido/contratos/catalogo/escuelas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { esperar, useAccionDeCatalogo } from "../acciones.ts";

/** Lo que se captura de una escuela. */
type DatosDeEscuela = z.input<typeof agregarEscuela.entrada>;

/** Una escuela que se edita. */
interface EscuelaQueSeEdita {
	id: string;
	version: number;
	nombre: string;
	municipio: string;
}

/**
 * La ventana de una escuela: nueva si no trae escuela.
 * @param props La escuela que se edita (o ninguna), si está abierta y qué hacer al cerrar.
 */
export function VentanaEscuela({
	escuela,
	abierta,
	alCerrar,
}: {
	escuela?: EscuelaQueSeEdita | undefined;
	abierta: boolean;
	alCerrar: () => void;
}) {
	const agregar = useAccionDeCatalogo(agregarEscuela);
	const editar = useAccionDeCatalogo(editarEscuela);
	const conConexion = useConConexion();
	const formulario = useForm<DatosDeEscuela>({
		resolver: zodResolver(agregarEscuela.entrada),
		defaultValues: { nombre: escuela?.nombre ?? "", municipio: escuela?.municipio ?? "" },
	});
	const { errors, isSubmitting } = formulario.formState;
	const guardar = formulario.handleSubmit(async (datos) => {
		const salida =
			escuela === undefined
				? await esperar(agregar.mutateAsync({ datos }))
				: await esperar(editar.mutateAsync({ datos: { escuela_id: escuela.id, ...datos }, version: escuela.version }));
		if (salida.bien) {
			formulario.reset();
			alCerrar();
			return;
		}
		if (salida.falla.tipo === "regla") {
			for (const [campo, mensaje] of Object.entries(salida.falla.campos)) {
				if (campo === "nombre" || campo === "municipio") formulario.setError(campo, { message: mensaje });
			}
		}
	});
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo={escuela === undefined ? "Agregar escuela" : `Editar ${escuela.nombre}`}
			accion={
				<Boton disabled={isSubmitting || !conConexion} onClick={() => void guardar()}>
					{escuela === undefined ? "Agregar escuela" : "Guardar"}
				</Boton>
			}
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={(evento) => {
					evento.preventDefault();
					void guardar();
				}}
			>
				<Campo etiqueta="Nombre" enVentana error={errors.nombre?.message} {...formulario.register("nombre")} />
				<Campo etiqueta="Municipio" enVentana error={errors.municipio?.message} {...formulario.register("municipio")} />
			</form>
		</Ventana>
	);
}
