/**
 * La ventana que confirma algo con motivo: cancelar un pedido, cancelar una nota o dar de baja a un cliente. El motivo
 * se valida con el esquema del contrato de la acción; el largo mínimo lo revisa la API y su error sale abajo del campo.
 * Fase 19 · docs/interfaz/comunes.md («La ventana», regla 3) y docs/interfaz/fabrica/ventas.md («Ventanas»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";

/** Lo que recibe la ventana con motivo. */
export interface PropsDeVentanaConMotivo {
	titulo: string;
	/** Lo que pasa, arriba del motivo. */
	texto?: ReactNode;
	/** El texto del botón de la acción. */
	accion: string;
	/** El esquema del motivo, del contrato de la acción. */
	esquema: z.ZodType<string, string>;
	/** Manda la acción; regresa si salió. */
	alConfirmar: (motivo: string, alCampos: (campos: Record<string, string>) => void) => Promise<boolean>;
	alCerrar: () => void;
	enviando: boolean;
}

/**
 * Una ventana con su motivo.
 * @param props El título, lo que pasa, el botón, el esquema, qué hacer al confirmar y al cerrar.
 */
export function VentanaConMotivo({
	titulo,
	texto,
	accion,
	esquema,
	alConfirmar,
	alCerrar,
	enviando,
}: PropsDeVentanaConMotivo) {
	const formulario = useForm<{ motivo: string }>({
		resolver: zodResolver(z.object({ motivo: esquema })),
		defaultValues: { motivo: "" },
	});
	const conConexion = useConConexion();
	const motivo = formulario.watch("motivo");
	const confirmar = formulario.handleSubmit(async ({ motivo: escrito }) => {
		const salio = await alConfirmar(escrito, (campos) => {
			for (const [campo, mensaje] of Object.entries(campos)) {
				if (campo === "motivo") formulario.setError("motivo", { message: mensaje });
			}
		});
		if (salio) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={titulo}
			accion={
				<Boton
					variante="peligro"
					disabled={!conConexion || enviando || motivo.trim() === ""}
					onClick={() => void confirmar()}
				>
					{accion}
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void confirmar(evento)}>
				{texto === undefined ? null : <p className="m-0 text-tinta2">{texto}</p>}
				<Campo
					enVentana
					etiqueta="Motivo"
					error={formulario.formState.errors.motivo?.message}
					{...formulario.register("motivo")}
				/>
			</form>
		</Ventana>
	);
}
