/**
 * La pestaña Por revisar: la lista de lotes que esperan revisión (Lote · Piezas · Para · «Revisar»), «Revisados hoy»
 * con la revisión de quien cosió marcada, y «Reproceso en el taller» con «Aprobar», apagado mientras Aduana no recibe el
 * lote. Con `?lote={id}` en la dirección, en su lugar va la revisión de ese lote.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Por revisar»)
 */

import { porRevisarDeCalidad } from "@uniformame/compartido/contratos/calidad/por-revisar";
import { aprobarReproceso } from "@uniformame/compartido/contratos/calidad/revision";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Check } from "lucide-react";
import type { z } from "zod";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccion } from "../direccion.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";
import { PaginaDeCalidad } from "../pagina.tsx";
import { RevisionDeLote } from "./revision-lote.tsx";

/** Lo que regresa `calidad.por_revisar`. */
type PorRevisar = z.infer<typeof porRevisarDeCalidad.resultado>;

/** La pestaña Por revisar, o la revisión de un lote si la dirección lo dice. */
export function PestanaPorRevisar() {
	const { leer } = useDireccion();
	const lote = leer("lote");
	return (
		<PaginaDeCalidad activa="por-revisar">
			{lote === undefined ? <ListaPorRevisar /> : <RevisionDeLote loteId={lote} />}
		</PaginaDeCalidad>
	);
}

/** Las tres partes de Por revisar. */
function ListaPorRevisar() {
	const consulta = useConsulta(porRevisarDeCalidad, {});
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => (
				<>
					<LotesPorRevisar lotes={datos.lotes} />
					{datos.revisados_hoy.length === 0 ? null : <RevisadosHoy revisados={datos.revisados_hoy} />}
					<ReprocesosEnElTaller reprocesos={datos.reprocesos} />
				</>
			)}
		</SegunConsulta>
	);
}

/**
 * Los lotes que esperan revisión; el renglón o su «Revisar» abren la revisión.
 * @param props Los lotes.
 */
function LotesPorRevisar({ lotes }: { lotes: PorRevisar["lotes"] }) {
	const { ir } = useDireccion();
	if (lotes.length === 0) return <EstadoDePantalla tipo="vacio" texto="Ningún lote espera revisión." />;
	return (
		<Tabla
			nombre="Lotes por revisar"
			filas={lotes}
			claveDeFila={(lote) => lote.lote_id}
			alTocarFila={(lote) => ir({ lote: lote.lote_id })}
			columnas={[
				{
					clave: "lote",
					encabezado: "Lote",
					celda: (lote) => <DosRenglones arriba={lote.prenda} abajo={lote.linea} />,
				},
				{ clave: "piezas", encabezado: "Piezas", alinear: "derecha", celda: (lote) => <b>{lote.listas}</b> },
				{
					clave: "para",
					encabezado: "Para",
					celda: (lote) => <DosRenglones arriba={lote.para.nombre} abajo={lote.para.linea} />,
				},
				{
					clave: "revisar",
					encabezado: "",
					alinear: "derecha",
					celda: (lote) => (
						<Boton
							chico
							variante={lote.urgente ? "principal" : "secundario"}
							icono={Check}
							onClick={() => ir({ lote: lote.lote_id })}
						>
							Revisar
						</Boton>
					),
				},
			]}
		/>
	);
}

/**
 * «Revisados hoy»: lo que ya pasa a aduana, con la revisión de quien cosió marcada.
 * @param props Los revisados hoy.
 */
function RevisadosHoy({ revisados }: { revisados: PorRevisar["revisados_hoy"] }) {
	return (
		<Seccion titulo="Revisados hoy" nota="Ya pasan a aduana">
			<Tabla
				nombre="Revisados hoy"
				filas={revisados}
				claveDeFila={(revisado) => revisado.lote_id}
				columnas={[
					{
						clave: "lote",
						encabezado: "Lote",
						celda: (revisado) => <DosRenglones arriba={revisado.prenda} abajo={revisado.folio} />,
					},
					{ clave: "aprobadas", encabezado: "Aprobadas", alinear: "derecha", celda: (revisado) => revisado.aprobadas },
					{
						clave: "reproceso",
						encabezado: "A reproceso",
						alinear: "derecha",
						celda: (revisado) => revisado.a_reproceso,
					},
					{
						clave: "reviso",
						encabezado: "Revisó",
						celda: (revisado) => (
							<span className="flex flex-wrap items-center gap-2">
								{revisado.reviso}
								{revisado.reviso_quien_coso ? <Estado texto="Revisó quien cosió" color="ambar" /> : null}
							</span>
						),
					},
				]}
			/>
		</Seccion>
	);
}

/**
 * «Reproceso en el taller», con «Aprobar» (la misma acción de Pendientes), apagado mientras Aduana no recibe el lote.
 * @param props Los reprocesos.
 */
function ReprocesosEnElTaller({ reprocesos }: { reprocesos: PorRevisar["reprocesos"] }) {
	const conConexion = useConConexion();
	const aprobar = useAccion(aprobarReproceso, loQueCambiaEnCalidad);
	const nota = reprocesos.length === 1 ? "1 reproceso" : `${reprocesos.length} reprocesos`;
	return (
		<Seccion titulo="Reproceso en el taller" nota={nota}>
			{reprocesos.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Sin reprocesos" />
			) : (
				<Tabla
					nombre="Reproceso en el taller"
					filas={reprocesos}
					claveDeFila={(reproceso) => reproceso.reproceso_id}
					columnas={[
						{
							clave: "reproceso",
							encabezado: "Reproceso",
							celda: (reproceso) => <DosRenglones arriba={reproceso.prenda} abajo={reproceso.linea} />,
						},
						{ clave: "defecto", encabezado: "Defecto", celda: (reproceso) => reproceso.defecto },
						{ clave: "talla", encabezado: "Talla", celda: (reproceso) => reproceso.talla },
						{
							clave: "regreso",
							encabezado: "Regresó a",
							celda: (reproceso) => <DosRenglones arriba={reproceso.persona} abajo={reproceso.operacion} />,
						},
						{ clave: "piezas", encabezado: "Piezas", alinear: "derecha", celda: (reproceso) => reproceso.piezas },
						{
							clave: "estado",
							encabezado: "Estado",
							celda: (reproceso) => <Estado texto={reproceso.estado} color={reproceso.color} />,
						},
						{
							clave: "aprobar",
							encabezado: "",
							alinear: "derecha",
							celda: (reproceso) =>
								reproceso.estado === "Aprobado" ? null : (
									<Boton
										chico
										icono={Check}
										title={reproceso.motivo_apagado ?? undefined}
										aria-description={reproceso.motivo_apagado ?? undefined}
										disabled={!reproceso.puede_aprobar || !conConexion || aprobar.isPending}
										onClick={() =>
											aprobar.mutate({
												datos: { reproceso_id: reproceso.reproceso_id },
												version: reproceso.version,
											})
										}
									>
										Aprobar
									</Boton>
								),
						},
					]}
				/>
			)}
			{reprocesos
				.flatMap((reproceso) => (reproceso.motivo_apagado === null ? [] : [reproceso.motivo_apagado]))
				.filter((motivo, i, todos) => todos.indexOf(motivo) === i)
				.map((motivo) => (
					<p key={motivo} className="m-0 text-etiqueta text-tinta2">
						{motivo}
					</p>
				))}
		</Seccion>
	);
}
