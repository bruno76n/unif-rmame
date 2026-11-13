/**
 * La revisión de un lote, una página dentro de Por revisar: «‹ Por revisar», la prenda y para quién, las tres cifras
 * (Por revisar, Aprobadas y Rechazadas), las tallas con sus listas, un botón por defecto («Rechazar por defecto»: cada
 * toque rechaza una pieza más de la talla escogida), «Regresan a reproceso» con la operación y la persona de cada
 * renglón (las que propone la consulta, que se pueden cambiar) y la barra de abajo con «Aprobar {n}» o «Aprobar {n} y
 * regresar {m}» → `calidad.revisar_lote`. Con rechazos capturados, salir pregunta antes.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Revisión de un lote»)
 *
 * La operación y la persona que se proponen vienen de `calidad.revision_lote` (regla 3 de
 * docs/modulos/calidad/revision-de-lotes.md); la pantalla solo junta los toques y no deja rechazar más de lo que queda
 * en la talla, como tampoco lo deja la acción.
 */

import { revisionDeLote } from "@uniformame/compartido/contratos/calidad/por-revisar";
import { revisarLote } from "@uniformame/compartido/contratos/calidad/revision";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Check, ChevronLeft, Minus, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta } from "../../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccion } from "../direccion.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";

/** Lo que regresa `calidad.revision_lote`. */
type Revision = z.infer<typeof revisionDeLote.resultado>;

/** Un rechazo capturado: un renglón por defecto, operación y talla. */
interface Rechazo {
	defecto_id: string;
	flujo_operacion_id: string;
	persona_id: string;
	variante_id: string;
	piezas: number;
}

/** Si dos rechazos son el mismo renglón. */
const mismoRenglon = (uno: Rechazo, otro: Pick<Rechazo, "defecto_id" | "flujo_operacion_id" | "variante_id">) =>
	uno.defecto_id === otro.defecto_id &&
	uno.flujo_operacion_id === otro.flujo_operacion_id &&
	uno.variante_id === otro.variante_id;

/**
 * Junta los renglones que quedaron iguales (al cambiar la operación de uno): una sola fila con sus piezas sumadas.
 * @param rechazos Los rechazos.
 */
function juntar(rechazos: readonly Rechazo[]): Rechazo[] {
	const juntos: Rechazo[] = [];
	for (const rechazo of rechazos) {
		const igual = juntos.find((otro) => mismoRenglon(otro, rechazo));
		if (igual === undefined) juntos.push({ ...rechazo });
		else igual.piezas += rechazo.piezas;
	}
	return juntos;
}

/**
 * La revisión de un lote.
 * @param props El lote.
 */
export function RevisionDeLote({ loteId }: { loteId: string }) {
	const consulta = useConsulta(revisionDeLote, { lote_id: loteId });
	return (
		<SegunConsulta consulta={consulta} renglones={6}>
			{(revision) => <Revisar key={revision.lote_id} revision={revision} />}
		</SegunConsulta>
	);
}

/**
 * La captura de la revisión.
 * @param props Lo que regresa `calidad.revision_lote`.
 */
function Revisar({ revision }: { revision: Revision }) {
	const { ir } = useDireccion();
	const conConexion = useConConexion();
	const [talla, setTalla] = useState(revision.tallas[0]?.variante_id ?? "");
	const [rechazos, setRechazos] = useState<Rechazo[]>([]);
	const [cerrada, setCerrada] = useState(false);
	const revisar = useAccion(revisarLote, loQueCambiaEnCalidad);
	const pregunta = usePreguntarAntesDeSalir(rechazos.length > 0);
	// Al cerrar la revisión, ya sin rechazos capturados, regresa a la lista.
	useEffect(() => {
		if (cerrada && rechazos.length === 0) ir({ lote: undefined });
	}, [cerrada, rechazos.length, ir]);
	const listas = (varianteId: string) => revision.tallas.find((una) => una.variante_id === varianteId)?.listas ?? 0;
	const rechazadasEn = (varianteId: string) =>
		rechazos.filter((rechazo) => rechazo.variante_id === varianteId).reduce((suma, uno) => suma + uno.piezas, 0);
	const quedan = (varianteId: string) => listas(varianteId) - rechazadasEn(varianteId);
	const propuesta = (flujoOperacionId: string, varianteId: string) =>
		revision.propuestas.find((una) => una.flujo_operacion_id === flujoOperacionId && una.variante_id === varianteId)
			?.persona_id ?? "";
	const porRevisar = revision.tallas.reduce((suma, una) => suma + una.listas, 0);
	const rechazadas = rechazos.reduce((suma, uno) => suma + uno.piezas, 0);
	const aprobadas = porRevisar - rechazadas;
	/** Un toque en un defecto: una pieza más de la talla escogida, si quedan. */
	const rechazar = (defecto: Revision["defectos"][number]) => {
		if (quedan(talla) <= 0) return;
		const clave = { defecto_id: defecto.id, flujo_operacion_id: defecto.flujo_operacion_id, variante_id: talla };
		setRechazos((antes) =>
			antes.some((uno) => mismoRenglon(uno, clave))
				? antes.map((uno) => (mismoRenglon(uno, clave) ? { ...uno, piezas: uno.piezas + 1 } : uno))
				: [...antes, { ...clave, persona_id: propuesta(defecto.flujo_operacion_id, talla), piezas: 1 }],
		);
	};
	/** Cambia un renglón y junta los que quedaron iguales. */
	const cambiar = (i: number, cambio: Partial<Rechazo>) =>
		setRechazos((antes) => juntar(antes.map((uno, j) => (j === i ? { ...uno, ...cambio } : uno))));
	const falla = revisar.error === null ? null : leerFalla(revisar.error);
	const textoDelBoton = rechazadas > 0 ? `Aprobar ${aprobadas} y regresar ${rechazadas}` : `Aprobar ${aprobadas}`;
	return (
		<>
			<div className="flex flex-col gap-4">
				<div>
					<Boton chico variante="fantasma" icono={ChevronLeft} onClick={() => ir({ lote: undefined })}>
						Por revisar
					</Boton>
				</div>
				<header className="flex flex-wrap items-end gap-6">
					<div className="flex min-w-0 flex-1 flex-col">
						<h2 className="m-0 font-bold text-titulo-seccion">{revision.prenda}</h2>
						<span className="text-tinta2">
							{revision.folio} · {revision.para.nombre} · {revision.para.linea.replace(/^.* · /, "")}
						</span>
					</div>
					<dl className="m-0 grid grid-cols-3 gap-6">
						<Cifra etiqueta="Por revisar" numero={porRevisar} />
						<Cifra etiqueta="Aprobadas" numero={aprobadas} tono="bien" />
						<Cifra etiqueta="Rechazadas" numero={rechazadas} tono="error" />
					</dl>
				</header>
				{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={revision.folio} /> : null}
				{falla?.tipo === "regla" ? <LineaDeAviso tono="error">{falla.mensaje}</LineaDeAviso> : null}
				{revision.por_revisar ? null : (
					<LineaDeAviso tono="advertencia">{revision.folio} no está terminado: todavía no se revisa.</LineaDeAviso>
				)}
				<Seccion titulo="Talla">
					<Filtros
						nombre="Talla"
						filtros={revision.tallas.map((una) => ({
							clave: una.variante_id,
							texto: `${una.talla} · ${una.listas} listas`,
						}))}
						activo={talla}
						alEscoger={setTalla}
					/>
				</Seccion>
				<Seccion titulo="Rechazar por defecto">
					<fieldset aria-label="Rechazar por defecto" className="m-0 flex flex-wrap gap-2 border-0 p-0">
						{revision.defectos.map((defecto) => (
							<Boton
								key={defecto.id}
								chico
								disabled={!revision.por_revisar || quedan(talla) <= 0}
								onClick={() => rechazar(defecto)}
							>
								{defecto.nombre}
							</Boton>
						))}
					</fieldset>
				</Seccion>
				{rechazos.length === 0 ? null : (
					<Seccion titulo="Regresan a reproceso" nota="A la operación que lo causó">
						<ul className="m-0 flex list-none flex-col gap-3 p-0">
							{rechazos.map((rechazo, i) => (
								<RenglonDeRechazo
									key={`${rechazo.defecto_id}-${rechazo.flujo_operacion_id}-${rechazo.variante_id}`}
									rechazo={rechazo}
									revision={revision}
									quedan={quedan(rechazo.variante_id)}
									alCambiarOperacion={(flujoOperacionId) =>
										cambiar(i, {
											flujo_operacion_id: flujoOperacionId,
											persona_id: propuesta(flujoOperacionId, rechazo.variante_id) || rechazo.persona_id,
										})
									}
									alCambiarPersona={(personaId) => cambiar(i, { persona_id: personaId })}
									alCambiarPiezas={(piezas) => cambiar(i, { piezas })}
									alQuitar={() => setRechazos((antes) => antes.filter((_, j) => j !== i))}
								/>
							))}
						</ul>
					</Seccion>
				)}
			</div>
			<div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-grande bg-panel px-5 py-3 shadow-flotante">
				<b>Revisa: {revision.revisa}</b>
				{revision.coso_en_el_lote ? (
					<LineaDeAviso tono="advertencia">Cosiste en este lote: la revisión queda marcada</LineaDeAviso>
				) : null}
				<span className="ml-auto text-etiqueta text-tinta2">Al cerrar, las aprobadas pasan a aduana</span>
				<Boton
					variante="principal"
					icono={Check}
					disabled={!revision.por_revisar || !conConexion || revisar.isPending}
					onClick={() =>
						revisar.mutate(
							{
								datos: {
									lote_id: revision.lote_id,
									rechazos: rechazos.filter((rechazo) => rechazo.persona_id !== ""),
								},
								version: revision.version,
							},
							{
								onSuccess: () => {
									setRechazos([]);
									setCerrada(true);
								},
							},
						)
					}
				>
					{textoDelBoton}
				</Boton>
			</div>
			{pregunta}
		</>
	);
}

/**
 * Una de las tres cifras de arriba de la revisión.
 * @param props Su etiqueta, su número y su tono.
 */
function Cifra({ etiqueta, numero, tono }: { etiqueta: string; numero: number; tono?: "bien" | "error" }) {
	const color = tono === "bien" ? "text-texto-bien" : tono === "error" ? "text-texto-error" : "text-tinta";
	return (
		<div className="flex flex-col">
			<dt className="font-semibold text-etiqueta text-tinta3">{etiqueta}</dt>
			<dd className={`m-0 font-bold text-titulo-seccion tabular-nums ${color}`}>{numero}</dd>
		</div>
	);
}

/**
 * Un renglón de «Regresan a reproceso»: el defecto, la talla, la operación, quién la hizo, el contador y la ×.
 * @param props El rechazo, la revisión, lo que queda en su talla y qué hacer con cada cambio.
 */
function RenglonDeRechazo({
	rechazo,
	revision,
	quedan,
	alCambiarOperacion,
	alCambiarPersona,
	alCambiarPiezas,
	alQuitar,
}: {
	rechazo: Rechazo;
	revision: Revision;
	quedan: number;
	alCambiarOperacion: (flujoOperacionId: string) => void;
	alCambiarPersona: (personaId: string) => void;
	alCambiarPiezas: (piezas: number) => void;
	alQuitar: () => void;
}) {
	const defecto = revision.defectos.find((uno) => uno.id === rechazo.defecto_id)?.nombre ?? "";
	const talla = revision.tallas.find((una) => una.variante_id === rechazo.variante_id)?.talla ?? "";
	return (
		<li className="grid grid-cols-[minmax(160px,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-end gap-3 rounded-mediano bg-suave p-3 max-telefono:grid-cols-1">
			<DosRenglones arriba={defecto} abajo={`Talla ${talla}`} />
			<Selector
				etiqueta="Operación que lo causó"
				opciones={revision.operaciones.map((operacion) => ({ valor: operacion.id, texto: operacion.nombre }))}
				value={rechazo.flujo_operacion_id}
				onChange={(evento) => alCambiarOperacion(evento.target.value)}
			/>
			<Selector
				etiqueta="Quién la hizo"
				vacio="Escoge a la persona"
				opciones={revision.personas.map((persona) => ({ valor: persona.id, texto: persona.nombre }))}
				value={rechazo.persona_id}
				onChange={(evento) => alCambiarPersona(evento.target.value)}
			/>
			<div className="flex items-center gap-2">
				<Boton
					chico
					variante="secundario"
					icono={Minus}
					aria-label="Menos"
					disabled={rechazo.piezas <= 1}
					onClick={() => alCambiarPiezas(rechazo.piezas - 1)}
				/>
				<b className="min-w-6 text-center tabular-nums">{rechazo.piezas}</b>
				<Boton
					chico
					variante="secundario"
					icono={Plus}
					aria-label="Más"
					disabled={quedan <= 0}
					onClick={() => alCambiarPiezas(rechazo.piezas + 1)}
				/>
			</div>
			<Boton chico variante="fantasma" icono={X} aria-label="Quitar" onClick={alQuitar} />
		</li>
	);
}
