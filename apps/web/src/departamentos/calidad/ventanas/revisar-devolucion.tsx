/**
 * La ventana «Revisar devolución {folio}», con `calidad.devolucion`: el cliente y, por renglón, la prenda y la talla, el
 * lote, «{n} por decidir», y el defecto y la nota con que llegó; en cada renglón, «Sirven» (pasan a bodega) y «Merma»,
 * con «Con qué tiene» (obligatorio en merma) y el defecto (opcional). Se puede decidir solo una parte. «Guardar
 * decisión» llama `calidad.revisar_devolucion` con la versión de la devolución.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Revisar devolución {folio}»)
 */

import { useQueryClient } from "@tanstack/react-query";
import { devolucionDeCalidad } from "@uniformame/compartido/contratos/calidad/devolucion";
import { revisarDevolucion } from "@uniformame/compartido/contratos/calidad/reclamos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta, volverALeer } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";

/** Lo que regresa `calidad.devolucion`. */
type Devolucion = z.infer<typeof devolucionDeCalidad.resultado>;

/** Lo decidido de un renglón, como se escribe. */
interface Decision {
	sirven: string;
	merma: string;
	motivo: string;
	defecto_id: string;
}

/** Un renglón sin decidir. */
const sinDecidir: Decision = { sirven: "", merma: "", motivo: "", defecto_id: "" };

/**
 * Las piezas escritas, como número; vacío o no número, cero.
 * @param texto Lo escrito.
 */
function piezasDe(texto: string): number {
	const numero = Number(texto);
	return Number.isInteger(numero) && numero > 0 ? numero : 0;
}

/**
 * Lo que se manda: por renglón, lo que sirve y lo que es merma (con su motivo y su defecto), solo lo decidido.
 * @param devolucion La devolución.
 * @param decisiones Lo decidido por renglón.
 */
function renglonesDe(devolucion: Devolucion, decisiones: Readonly<Record<string, Decision>>) {
	return devolucion.renglones.flatMap((renglon) => {
		const decision = decisiones[renglon.traspaso_linea_id] ?? sinDecidir;
		const defecto = decision.defecto_id === "" ? {} : { defecto_id: decision.defecto_id };
		return [
			...(piezasDe(decision.sirven) > 0
				? [
						{
							traspaso_linea_id: renglon.traspaso_linea_id,
							piezas: piezasDe(decision.sirven),
							decision: "sirve" as const,
						},
					]
				: []),
			...(piezasDe(decision.merma) > 0
				? [
						{
							traspaso_linea_id: renglon.traspaso_linea_id,
							piezas: piezasDe(decision.merma),
							decision: "merma" as const,
							...(decision.motivo.trim() === "" ? {} : { motivo: decision.motivo.trim() }),
							...defecto,
						},
					]
				: []),
		];
	});
}

/** Lo decidido de cada renglón, por su id. */
type Decisiones = Readonly<Record<string, Decision>>;

/**
 * La ventana de la devolución.
 * @param props La devolución (cerrada si es nula) y qué hacer al cerrarla.
 */
export function VentanaRevisarDevolucion({
	traspasoId,
	alCerrar,
}: {
	traspasoId: string | null;
	alCerrar: () => void;
}) {
	const consulta = useConsulta(devolucionDeCalidad, { traspaso_id: traspasoId ?? "" }, traspasoId !== null);
	const devolucion = consulta.data;
	const [decisiones, setDecisiones] = useState<Decisiones>({});
	// Otra devolución empieza sin decidir.
	useEffect(() => {
		if (traspasoId !== null) setDecisiones({});
	}, [traspasoId]);
	const cambiar = (lineaId: string, cambio: Partial<Decision>) =>
		setDecisiones((antes) => ({ ...antes, [lineaId]: { ...(antes[lineaId] ?? sinDecidir), ...cambio } }));
	return (
		<Ventana
			abierta={traspasoId !== null}
			alCerrar={alCerrar}
			titulo={`Revisar devolución ${devolucion?.folio ?? ""}`}
			{...(devolucion === undefined ? {} : { subtitulo: devolucion.cliente })}
			ancha
			accion={
				devolucion === undefined ? undefined : (
					<Guardar devolucion={devolucion} decisiones={decisiones} alCerrar={alCerrar} />
				)
			}
		>
			{consulta.isPending ? (
				<EstadoDePantalla tipo="cargando" renglones={2} />
			) : devolucion === undefined ? (
				<EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />
			) : (
				<Renglones devolucion={devolucion} decisiones={decisiones} cambiar={cambiar} />
			)}
		</Ventana>
	);
}

/**
 * Los renglones de la devolución, cada uno con lo que se decide.
 * @param props La devolución, lo decidido y cómo cambiarlo.
 */
function Renglones({
	devolucion,
	decisiones,
	cambiar,
}: {
	devolucion: Devolucion;
	decisiones: Decisiones;
	cambiar: (lineaId: string, cambio: Partial<Decision>) => void;
}) {
	return (
		<ul className="m-0 flex list-none flex-col gap-4 p-0">
			{devolucion.renglones.map((renglon) => {
				const decision = decisiones[renglon.traspaso_linea_id] ?? sinDecidir;
				const llego = [renglon.defecto, renglon.nota].filter((parte) => parte !== null).join(" · ");
				return (
					<li key={renglon.traspaso_linea_id} className="flex flex-col gap-3 rounded-mediano bg-suave p-3">
						<DosRenglones
							arriba={renglon.prenda}
							abajo={[renglon.lote, `${renglon.por_decidir} por decidir`, llego === "" ? null : llego]
								.filter((parte) => parte !== null)
								.join(" · ")}
						/>
						<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
							<Campo
								etiqueta="Sirven"
								enVentana
								type="number"
								min={0}
								max={renglon.por_decidir}
								value={decision.sirven}
								onChange={(evento) => cambiar(renglon.traspaso_linea_id, { sirven: evento.target.value })}
							/>
							<Campo
								etiqueta="Merma"
								enVentana
								type="number"
								min={0}
								max={renglon.por_decidir}
								value={decision.merma}
								onChange={(evento) => cambiar(renglon.traspaso_linea_id, { merma: evento.target.value })}
							/>
							{piezasDe(decision.merma) > 0 ? (
								<>
									<Campo
										etiqueta="Con qué tiene"
										enVentana
										maxLength={200}
										value={decision.motivo}
										onChange={(evento) => cambiar(renglon.traspaso_linea_id, { motivo: evento.target.value })}
									/>
									<Selector
										etiqueta="Defecto"
										enVentana
										vacio="Sin defecto"
										opciones={devolucion.defectos.map((defecto) => ({ valor: defecto.id, texto: defecto.nombre }))}
										value={decision.defecto_id === "" ? (renglon.defecto_id ?? "") : decision.defecto_id}
										onChange={(evento) => cambiar(renglon.traspaso_linea_id, { defecto_id: evento.target.value })}
									/>
								</>
							) : null}
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * «Guardar decisión»: manda lo decidido con la versión de la devolución.
 * @param props La devolución, lo decidido y qué hacer al cerrarla.
 */
function Guardar({
	devolucion,
	decisiones,
	alCerrar,
}: {
	devolucion: Devolucion;
	decisiones: Decisiones;
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const consultas = useQueryClient();
	const revisar = useAccion(revisarDevolucion, loQueCambiaEnCalidad);
	const renglones = renglonesDe(devolucion, decisiones);
	const falla = revisar.error === null ? null : leerFalla(revisar.error);
	return (
		<div className="flex flex-col items-end gap-2">
			{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={devolucion.folio} /> : null}
			{falla?.tipo === "regla" && Object.keys(falla.campos).length > 0 ? (
				<LineaDeAviso tono="error">{Object.values(falla.campos).join(" ")}</LineaDeAviso>
			) : null}
			<Boton
				variante="principal"
				disabled={!conConexion || revisar.isPending || renglones.length === 0}
				onClick={() =>
					revisar.mutate(
						{ datos: { traspaso_id: devolucion.traspaso_id, renglones }, version: devolucion.version },
						{ onSuccess: alCerrar, onError: () => void volverALeer(consultas, loQueCambiaEnCalidad) },
					)
				}
			>
				Guardar decisión
			</Boton>
		</div>
	);
}
