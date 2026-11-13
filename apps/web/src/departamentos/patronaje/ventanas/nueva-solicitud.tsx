/**
 * La ventana «Nueva solicitud de diseño» (ancha): «Para quién» («Ninguna escuela: básico o general» y cada escuela) ·
 * «Prenda» · «Tela» · «Tallas» («6 a 14») · «Qué pidieron (opcional)». «Registrar solicitud» llama
 * `patronaje.registrar_solicitud` con el mismo esquema del contrato, y abre el tablero con la tarjeta marcada; el aviso
 * dice «{DS} registrada en Solicitud».
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Ventanas»: «Nueva solicitud de diseño»)
 */

import { registrarSolicitud } from "@uniformame/compartido/contratos/patronaje/desarrollos";
import type { tableroDeDesarrollos } from "@uniformame/compartido/contratos/patronaje/tablero-de-desarrollos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useDireccion } from "../direccion.ts";
import { loQueCambiaEnPatronaje } from "../invalidar.ts";

/** Lo que se captura: la escuela va como texto en el selector («» es ninguna). */
interface Capturado {
	escuela: string;
	prenda: string;
	tela_material_id: string;
	tallas: string;
	descripcion: string;
}

/** La ventana vacía. */
const vacia: Capturado = { escuela: "", prenda: "", tela_material_id: "", tallas: "", descripcion: "" };

/**
 * Lo que manda «Registrar solicitud».
 * @param capturado Lo capturado.
 */
function datosDeLaSolicitud(capturado: Capturado): z.input<typeof registrarSolicitud.entrada> {
	return {
		escuela_id: capturado.escuela === "" ? null : capturado.escuela,
		prenda: capturado.prenda,
		tela_material_id: capturado.tela_material_id,
		tallas: capturado.tallas,
		...(capturado.descripcion.trim() === "" ? {} : { descripcion: capturado.descripcion }),
	};
}

/**
 * La ventana para registrar una solicitud de diseño.
 * @param props Si está abierta, las escuelas y las telas que se pueden escoger, y qué hacer al cerrarla.
 */
export function VentanaNuevaSolicitud({
	abierta,
	opciones,
	alCerrar,
}: {
	abierta: boolean;
	opciones: z.infer<typeof tableroDeDesarrollos.resultado>["opciones"];
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const { ir } = useDireccion();
	const registrar = useAccion(registrarSolicitud, loQueCambiaEnPatronaje);
	const formulario = useForm<Capturado>({ defaultValues: vacia });
	// Lo que dice el esquema del contrato de lo capturado: la pantalla revisa igual que la API.
	const [errores, setErrores] = useState<Record<string, string>>({});
	useEffect(() => {
		if (abierta) formulario.reset(vacia);
		setErrores({});
		registrar.reset();
	}, [abierta, formulario, registrar.reset]);
	const falla = registrar.error === null ? null : leerFalla(registrar.error);
	const errorDe = (campo: keyof z.input<typeof registrarSolicitud.entrada>) =>
		errores[campo] ?? (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	/**
	 * Revisa lo capturado con el contrato y, si está bien, lo manda.
	 * @param capturado Lo capturado.
	 */
	const mandar = (capturado: Capturado) => {
		const datos = datosDeLaSolicitud(capturado);
		const revisado = registrarSolicitud.entrada.safeParse(datos);
		if (!revisado.success) {
			setErrores(
				Object.fromEntries(revisado.error.issues.map((problema) => [String(problema.path[0]), problema.message])),
			);
			return;
		}
		setErrores({});
		registrar.mutate(
			{ datos },
			{
				onSuccess: (resultado) => {
					alCerrar();
					ir({ marcado: resultado.desarrollo_id });
				},
			},
		);
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo="Nueva solicitud de diseño"
			ancha
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || registrar.isPending}
					onClick={formulario.handleSubmit(mandar)}
				>
					Registrar solicitud
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Selector
					etiqueta="Para quién"
					enVentana
					opciones={[
						{ valor: "", texto: "Ninguna escuela: básico o general" },
						...opciones.escuelas.map((escuela) => ({ valor: escuela.escuela_id, texto: escuela.nombre })),
					]}
					error={errorDe("escuela_id")}
					{...formulario.register("escuela")}
				/>
				<Campo
					etiqueta="Prenda"
					enVentana
					maxLength={60}
					error={errorDe("prenda")}
					{...formulario.register("prenda")}
				/>
				<div className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
					<Selector
						etiqueta="Tela"
						enVentana
						vacio="Escoge una tela"
						opciones={opciones.telas.map((tela) => ({ valor: tela.material_id, texto: tela.nombre }))}
						error={errorDe("tela_material_id")}
						{...formulario.register("tela_material_id")}
					/>
					<Campo
						etiqueta="Tallas"
						enVentana
						placeholder="6 a 14"
						maxLength={30}
						error={errorDe("tallas")}
						{...formulario.register("tallas")}
					/>
				</div>
				<Campo
					etiqueta="Qué pidieron (opcional)"
					enVentana
					maxLength={200}
					error={errorDe("descripcion")}
					{...formulario.register("descripcion")}
				/>
			</div>
		</Ventana>
	);
}
