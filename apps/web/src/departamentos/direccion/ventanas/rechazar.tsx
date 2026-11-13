/**
 * La ventana «Rechazar» de una autorización: el título y, abajo, lo que se pide; el campo «Motivo» de una línea con el
 * cursor puesto; «Volver» y «Rechazar» (rojo). El motivo se valida con el mismo esquema del contrato de
 * `direccion.decidir_autorizacion` (de 5 a 90 letras), y «Rechazar» se prende al llegar.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Cajones y ventanas»: ventana «Rechazar») y docs/interfaz/comunes.md
 * («La ventana», regla 3)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { decidirAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

/** El formulario: el motivo, obligatorio al rechazar, con la regla del contrato. */
const formulario = z.object({ motivo: decidirAutorizacion.entrada.shape.motivo.unwrap() });

/** Lo que recibe la ventana. */
export interface PropsDeRechazar {
	/** Lo que se pide, abajo del título; sin él, la ventana está cerrada. */
	resumen: string | null;
	/** Si se puede mandar (con conexión y sin otra decisión en camino). */
	puede: boolean;
	/** El error del motivo que regresó la API, si lo hubo. */
	errorDeLaApi?: string | undefined;
	alCerrar: () => void;
	alRechazar: (motivo: string) => void;
}

/**
 * La ventana «Rechazar».
 * @param props Lo que se pide, si se puede mandar, el error de la API y qué hacer al cerrar y al rechazar.
 */
export function VentanaRechazar({ resumen, puede, errorDeLaApi, alCerrar, alRechazar }: PropsDeRechazar) {
	const { register, handleSubmit, formState, reset, setError } = useForm<z.input<typeof formulario>>({
		resolver: zodResolver(formulario),
		mode: "onTouched",
		defaultValues: { motivo: "" },
	});
	// Cada vez que se abre, empieza vacía.
	useEffect(() => {
		if (resumen !== null) reset({ motivo: "" });
	}, [resumen, reset]);
	// El error del motivo que regresó la API va junto al campo.
	useEffect(() => {
		if (errorDeLaApi !== undefined) setError("motivo", { message: errorDeLaApi });
	}, [errorDeLaApi, setError]);
	const mandar = handleSubmit(({ motivo }) => alRechazar(formulario.shape.motivo.parse(motivo)));
	return (
		<Ventana
			abierta={resumen !== null}
			alCerrar={alCerrar}
			titulo="Rechazar"
			subtitulo={resumen ?? ""}
			accion={
				<Boton variante="peligro" type="submit" form="rechazar-autorizacion" disabled={!puede || !formState.isValid}>
					Rechazar
				</Boton>
			}
		>
			<form id="rechazar-autorizacion" onSubmit={mandar} noValidate>
				<Campo
					etiqueta="Motivo"
					enVentana
					autoFocus
					autoComplete="off"
					maxLength={90}
					error={formState.errors.motivo?.message}
					{...register("motivo")}
				/>
			</form>
		</Ventana>
	);
}
