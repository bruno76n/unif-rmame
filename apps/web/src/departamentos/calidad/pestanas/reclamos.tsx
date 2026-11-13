/**
 * La pestaña Reclamos: el buscador «Código de la prenda, lote o reclamo» y «Nuevo reclamo»; a la izquierda la lista
 * (primero los por resolver, luego los más nuevos, con «Ver más») y a la derecha el rastreo del escogido en sus cinco
 * pasos, con «Marcar resuelto» o su resolución. El reclamo escogido (`?reclamo=`) y lo que se busca (`?buscar=`) van en
 * la dirección.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Reclamos»)
 */

import {
	buscarDeCalidad,
	type reclamoEscogido,
	reclamosDeCalidad,
} from "@uniformame/compartido/contratos/calidad/consultas-reclamos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccion } from "../direccion.ts";
import { PaginaDeCalidad } from "../pagina.tsx";
import { VentanaReclamoNuevo } from "../ventanas/reclamo-nuevo.tsx";
import { VentanaResolverReclamo } from "../ventanas/resolver-reclamo.tsx";

/** El reclamo escogido, con su rastreo. */
type Escogido = z.infer<typeof reclamoEscogido>;

/** Cuántos reclamos lleva cada «Ver más». */
const porPagina = 30;

/** La pestaña Reclamos. */
export function PestanaReclamos() {
	const { leer, ir } = useDireccion();
	const reclamo = leer("reclamo");
	const buscar = leer("buscar") ?? "";
	const [limite, setLimite] = useState(porPagina);
	const [nuevo, setNuevo] = useState(false);
	const consulta = useConsulta(reclamosDeCalidad, {
		limite,
		...(reclamo === undefined ? {} : { reclamo_id: reclamo }),
	});
	return (
		<PaginaDeCalidad activa="reclamos">
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-60 flex-1">
					<Campo
						etiqueta="Código de la prenda, lote o reclamo"
						type="search"
						value={buscar}
						maxLength={40}
						onChange={(evento) => ir({ buscar: evento.target.value }, undefined, true)}
					/>
				</div>
				<Boton icono={Plus} onClick={() => setNuevo(true)}>
					Nuevo reclamo
				</Boton>
			</div>
			<Hallazgo texto={buscar.trim()} />
			<SegunConsulta consulta={consulta}>
				{(datos) =>
					datos.renglones.length === 0 ? (
						<EstadoDePantalla tipo="vacio" texto="Sin reclamos" />
					) : (
						<div className="grid grid-cols-[minmax(260px,340px)_minmax(0,1fr)] items-start gap-5 max-menu:grid-cols-1">
							<nav aria-label="Reclamos" className="flex flex-col gap-2">
								{datos.renglones.map((renglon) => {
									const escogido = renglon.reclamo_id === datos.escogido?.reclamo_id;
									return (
										<button
											key={renglon.reclamo_id}
											type="button"
											aria-current={escogido ? "true" : undefined}
											onClick={() => ir({ reclamo: renglon.reclamo_id })}
											className={`flex flex-col gap-1 rounded-mediano border p-3 text-left ${escogido ? "border-marca bg-marca-fondo" : "border-linea bg-panel hover:bg-suave"}`}
										>
											<span className="flex items-center justify-between gap-2">
												<b className="tabular-nums">{renglon.folio}</b>
												<Estado texto={renglon.estado} color={renglon.color} />
											</span>
											<b>{renglon.cliente}</b>
											<span className="text-etiqueta text-tinta2">{renglon.linea}</span>
										</button>
									);
								})}
								{datos.hay_mas ? (
									<Boton chico variante="fantasma" onClick={() => setLimite(limite + porPagina)}>
										Ver más
									</Boton>
								) : null}
							</nav>
							{datos.escogido === null ? null : <Rastreo escogido={datos.escogido} />}
						</div>
					)
				}
			</SegunConsulta>
			<VentanaReclamoNuevo
				abierta={nuevo}
				alCerrar={() => setNuevo(false)}
				alRegistrar={(reclamoId) => {
					setNuevo(false);
					ir({ reclamo: reclamoId, buscar: undefined });
				}}
			/>
		</PaginaDeCalidad>
	);
}

/**
 * Lo que da el buscador mientras se escribe: un reclamo (lo escoge), una prenda sin reclamo o nada.
 * @param props Lo que se escribió.
 */
function Hallazgo({ texto }: { texto: string }) {
	const { leer, ir } = useDireccion();
	const consulta = useConsulta(buscarDeCalidad, { texto }, texto !== "");
	const encontrado = consulta.data?.encontrado;
	// Si da con un reclamo, lo escoge y muestra su rastreo.
	useEffect(() => {
		if (encontrado?.tipo === "reclamo" && leer("reclamo") !== encontrado.reclamo_id) {
			ir({ reclamo: encontrado.reclamo_id }, undefined, true);
		}
	}, [encontrado, leer, ir]);
	if (texto === "" || encontrado === undefined || encontrado.tipo === "reclamo") return null;
	return (
		<div className="rounded-grande bg-panel p-4 shadow-panel">
			{encontrado.tipo === "prenda" ? (
				<DosRenglones arriba={encontrado.titulo} abajo={encontrado.linea} />
			) : (
				<p className="m-0 text-tinta2">{encontrado.texto}</p>
			)}
		</div>
	);
}

/**
 * El rastreo del reclamo escogido: su cliente y lo que reclamó, «Marcar resuelto» o su resolución, y los cinco pasos.
 * @param props El reclamo escogido.
 */
function Rastreo({ escogido }: { escogido: Escogido }) {
	const conConexion = useConConexion();
	const [resolver, setResolver] = useState(false);
	const pasos = [
		{ etiqueta: "Prenda", ...escogido.prenda },
		{ etiqueta: "Lote", ...escogido.lote },
		{ etiqueta: "Operación", ...escogido.operacion },
		{ etiqueta: "Persona", ...escogido.persona },
		...escogido.partidas.map((partida) => ({ etiqueta: "Partida de tela", ...partida })),
	];
	return (
		<article className="flex flex-col gap-4 rounded-grande bg-panel p-5 shadow-panel">
			<header className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<DosRenglones arriba={`${escogido.folio} · ${escogido.cliente}`} abajo={escogido.que_dice} />
				</div>
				{escogido.por_resolver ? (
					<Boton chico variante="principal" icono={Check} disabled={!conConexion} onClick={() => setResolver(true)}>
						Marcar resuelto
					</Boton>
				) : (
					<LineaDeAviso tono="bien">{escogido.resolucion}</LineaDeAviso>
				)}
			</header>
			<ol aria-label="Rastreo" className="m-0 flex list-none flex-col gap-3 p-0">
				{pasos.map((paso, i) => (
					<li key={`${paso.etiqueta}-${paso.titulo}`} className="flex items-start gap-3">
						<span className="grid size-8 flex-none place-items-center rounded-full bg-riel font-bold text-etiqueta">
							{Math.min(i + 1, 5)}
						</span>
						<div className="flex min-w-0 flex-col">
							<span className="font-semibold text-etiqueta text-tinta3">{paso.etiqueta}</span>
							<b>{paso.titulo}</b>
							<span className="text-etiqueta text-tinta2">{paso.linea}</span>
						</div>
					</li>
				))}
			</ol>
			<VentanaResolverReclamo reclamo={resolver ? escogido : null} alCerrar={() => setResolver(false)} />
		</article>
	);
}
