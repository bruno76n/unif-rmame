/**
 * Las dos ventanas con motivo del cajón del desarrollo: «Cambios a la muestra de {prenda}» («Regresar a muestra» →
 * `patronaje.pedir_cambios_muestra`, aviso «{DS} regresa a muestra») y «Descartar {prenda}» («Descartar» →
 * `patronaje.descartar_desarrollo`, aviso «{DS} descartada. Queda en el historial con su motivo»). Abajo del título,
 * «{escuela} · {DS}». Si el desarrollo cambió mientras se veía, lo dice y conserva el motivo.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Ventanas»)
 */

import { useQueryClient } from "@tanstack/react-query";
import { descartarDesarrollo, pedirCambiosMuestra } from "@uniformame/compartido/contratos/patronaje/desarrollos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect, useState } from "react";
import { leerFalla, useAccion, volverALeer } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnPatronaje } from "../invalidar.ts";

/** El desarrollo de la ventana, como lo trae el cajón. */
export interface DesarrolloConMotivo {
	desarrollo_id: string;
	folio: string;
	version: number;
	prenda: string;
	para: string;
}

/** Los textos y la acción de cada ventana. */
const ventanas = {
	cambios: { titulo: "Cambios a la muestra de", boton: "Regresar a muestra", contrato: pedirCambiosMuestra },
	descartar: { titulo: "Descartar", boton: "Descartar", contrato: descartarDesarrollo },
} as const;

/**
 * La ventana con motivo para pedir cambios a la muestra o descartar el desarrollo.
 * @param props Cuál ventana, el desarrollo (cerrada si es nulo) y qué hacer al cerrar.
 */
export function VentanaMotivoDelDesarrollo({
	cual,
	desarrollo,
	alCerrar,
}: {
	cual: keyof typeof ventanas;
	desarrollo: DesarrolloConMotivo | null;
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const consultas = useQueryClient();
	const { titulo, boton, contrato } = ventanas[cual];
	const accion = useAccion(contrato, loQueCambiaEnPatronaje);
	const [motivo, setMotivo] = useState("");
	useEffect(() => {
		if (desarrollo !== null) setMotivo("");
		accion.reset();
	}, [desarrollo, accion.reset]);
	const falla = accion.error === null ? null : leerFalla(accion.error);
	return (
		<Ventana
			abierta={desarrollo !== null}
			alCerrar={alCerrar}
			titulo={`${titulo} ${desarrollo?.prenda ?? ""}`}
			{...(desarrollo === null ? {} : { subtitulo: `${desarrollo.para} · ${desarrollo.folio}` })}
			accion={
				<Boton
					variante={cual === "descartar" ? "peligro" : "principal"}
					disabled={!conConexion || accion.isPending || motivo.trim() === ""}
					onClick={() =>
						accion.mutate(
							{ datos: { desarrollo_id: desarrollo?.desarrollo_id ?? "", motivo }, version: desarrollo?.version ?? 0 },
							{
								onSuccess: () => alCerrar(),
								// Con un choque, se vuelve a leer lo nuevo y se conserva el motivo.
								onError: () => void volverALeer(consultas, loQueCambiaEnPatronaje),
							},
						)
					}
				>
					{boton}
				</Boton>
			}
		>
			{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={desarrollo?.folio ?? ""} /> : null}
			<Campo
				etiqueta="Motivo"
				enVentana
				maxLength={200}
				value={motivo}
				onChange={(evento) => setMotivo(evento.target.value)}
				error={falla?.tipo === "regla" ? (falla.campos.motivo ?? undefined) : undefined}
			/>
		</Ventana>
	);
}
