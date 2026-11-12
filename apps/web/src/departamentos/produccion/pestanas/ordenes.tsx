/**
 * La pestaña Órdenes de producción: «Bodega sugiere fabricar» (si hay sugerencias), los filtros con su conteo y «Nueva
 * orden de producción», las tarjetas de lo que sigue en el taller y, abajo, «Ya salieron del taller» con «Ver más».
 * Cada renglón de prenda abre el cajón de su primer lote que no ha llegado a aduana. Desde el cajón del pedido de
 * Ventas, `?pedido={id}` marca y centra su tarjeta un momento.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Órdenes de producción»)
 */

import { useRouter } from "@tanstack/react-router";
import { levantarOrdenSugerencia } from "@uniformame/compartido/contratos/produccion/ordenes";
import {
	filtrosDeOrdenes,
	ordenesDeProduccion,
} from "@uniformame/compartido/contratos/produccion/ordenes-de-produccion";
import { Hilo } from "@uniformame/interfaz/avance/hilo";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Plus, Store, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { consultar, useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { enOtroDepartamento, useCuenta } from "../cuenta.ts";
import { useDireccion } from "../direccion.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";
import { PaginaDeProduccion, SegunConsulta } from "../pagina.tsx";
import { ColorDeEscuela, Seccion } from "../piezas.tsx";
import { VentanaOrdenNueva } from "../ventanas/orden-nueva.tsx";

/** Lo que regresa `produccion.ordenes`. */
type Ordenes = z.infer<typeof ordenesDeProduccion.resultado>;
/** Una tarjeta. */
type Tarjeta = Ordenes["en_taller"][number];

/** El texto de cada filtro. */
const nombresDeFiltro: Readonly<Record<(typeof filtrosDeOrdenes)[number], string>> = {
	todas: "Todas",
	clientes: "Pedidos de clientes",
	reabasto: "Reabasto",
	temporada: "Temporada",
};

/** Cuánto dura marcada la tarjeta del pedido que trae Ventas. */
const marcadoPorMs = 4000;

/** La pestaña Órdenes de producción. */
export function PestanaOrdenes() {
	const { leer, ir } = useDireccion();
	const filtro = filtrosDeOrdenes.find((uno) => uno === leer("filtro")) ?? "todas";
	const consulta = useConsulta(ordenesDeProduccion, { filtro });
	const [nueva, setNueva] = useState(false);
	return (
		<PaginaDeProduccion activa="ordenes">
			<SegunConsulta consulta={consulta}>
				{(ordenes) => (
					<>
						{ordenes.sugerencias.length === 0 ? null : <SugerenciasDeBodega sugerencias={ordenes.sugerencias} />}
						<div className="flex flex-wrap items-center gap-3">
							<Filtros
								nombre="Filtrar órdenes"
								filtros={filtrosDeOrdenes.map((clave) => ({
									clave,
									texto: nombresDeFiltro[clave],
									conteo: ordenes.conteos[clave],
								}))}
								activo={filtro}
								alEscoger={(clave) => ir({ filtro: clave === "todas" ? undefined : clave })}
							/>
							<span className="ml-auto">
								<Boton variante="principal" icono={Plus} onClick={() => setNueva(true)}>
									Nueva orden de producción
								</Boton>
							</span>
						</div>
						{ordenes.en_taller.length === 0 ? (
							<EstadoDePantalla tipo="vacio" texto="Nada en el taller." />
						) : (
							<Tarjetas tarjetas={ordenes.en_taller} />
						)}
						<YaSalieron ordenes={ordenes} filtro={filtro} />
					</>
				)}
			</SegunConsulta>
			<VentanaOrdenNueva abierta={nueva} alCerrar={() => setNueva(false)} />
		</PaginaDeProduccion>
	);
}

/**
 * «Bodega sugiere fabricar»: una tarjeta por prenda y ubicación con «Levantar orden». No hay «Descartar».
 * @param props Las sugerencias.
 */
function SugerenciasDeBodega({ sugerencias }: { sugerencias: Ordenes["sugerencias"] }) {
	const conConexion = useConConexion();
	const levantar = useAccion(levantarOrdenSugerencia, loQueCambiaEnProduccion);
	return (
		<Seccion titulo="Bodega sugiere fabricar" enPanel>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
				{sugerencias.map((sugerencia) => (
					<div
						key={sugerencia.sugerencia_ids.join()}
						className="flex flex-col gap-2 rounded-mediano border border-linea p-3"
					>
						<b>{sugerencia.prenda}</b>
						<span className="text-etiqueta text-tinta2">{sugerencia.detalle}</span>
						<span className="flex items-center justify-between gap-2">
							<span className="tabular-nums">{sugerencia.piezas} piezas</span>
							<Boton
								chico
								disabled={!conConexion || levantar.isPending}
								onClick={() => levantar.mutate({ datos: { sugerencia_ids: sugerencia.sugerencia_ids } })}
							>
								Levantar orden
							</Boton>
						</span>
					</div>
				))}
			</div>
		</Seccion>
	);
}

/**
 * Las tarjetas, con la del pedido que trae la dirección marcada un momento.
 * @param props Las tarjetas.
 */
function Tarjetas({ tarjetas }: { tarjetas: readonly Tarjeta[] }) {
	const { leer, ir } = useDireccion();
	const marcado = leer("pedido");
	useEffect(() => {
		if (marcado === undefined) return;
		document.querySelector(`[data-pedido="${marcado}"]`)?.scrollIntoView({ block: "center" });
		const quitar = window.setTimeout(() => ir({ pedido: undefined }), marcadoPorMs);
		return () => window.clearTimeout(quitar);
	}, [marcado, ir]);
	return (
		<div className="flex flex-col gap-4">
			{tarjetas.map((tarjeta) => (
				<TarjetaDeOrden
					key={tarjeta.clave}
					tarjeta={tarjeta}
					marcada={tarjeta.pedido_id !== null && tarjeta.pedido_id === marcado}
				/>
			))}
		</div>
	);
}

/**
 * Una tarjeta: su encabezado, su estado y un renglón por prenda con su hilo chico.
 * @param props La tarjeta y si va marcada.
 */
function TarjetaDeOrden({ tarjeta, marcada }: { tarjeta: Tarjeta; marcada: boolean }) {
	const router = useRouter();
	const { ir } = useDireccion();
	const { tiene } = useCuenta();
	const Icono = tarjeta.tipo === "reabasto" ? Store : Warehouse;
	return (
		<article
			data-pedido={tarjeta.pedido_id ?? undefined}
			className={`flex flex-col gap-3 rounded-grande bg-panel p-5 shadow-panel ${marcada ? "ring-2 ring-marca" : ""}`}
		>
			<header className="flex flex-wrap items-start gap-4">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="flex items-center gap-2">
						{tarjeta.tipo === "pedido" ? (
							<ColorDeEscuela color={tarjeta.color} />
						) : (
							<Icono aria-hidden="true" size={18} strokeWidth={1.9} className="text-tinta3" />
						)}
						<b className="text-subtitulo">{tarjeta.nombre}</b>
					</span>
					<span className="text-tinta2">
						{tarjeta.referencia}
						{tarjeta.plazo === null ? null : (
							<span
								className={
									tarjeta.plazo.tono === "rojo"
										? "font-semibold text-texto-error"
										: tarjeta.plazo.tono === "ambar"
											? "font-semibold text-texto-advertencia"
											: undefined
								}
							>
								{" · "}
								{tarjeta.plazo.texto}
							</span>
						)}
					</span>
				</div>
				<div className="flex flex-col items-end gap-1.5 text-right">
					<span className="text-etiqueta text-tinta3">{tarjeta.folios.join(" · ")}</span>
					<span className="text-etiqueta text-tinta3">{tarjeta.levanto}</span>
					<Estado
						texto={tarjeta.estado.texto}
						color={tarjeta.estado.color}
						{...(tarjeta.estado.abajo === null ? {} : { abajo: tarjeta.estado.abajo })}
					/>
					{tarjeta.pedido_id !== null && tiene("ventas") ? (
						<Boton
							chico
							variante="fantasma"
							onClick={() => router.history.push(enOtroDepartamento.pedido(tarjeta.pedido_id ?? ""))}
						>
							Ver pedido
						</Boton>
					) : null}
				</div>
			</header>
			<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
				{tarjeta.renglones.map((renglon) => (
					<li key={`${renglon.prenda}-${renglon.lotes.join()}`}>
						<button
							type="button"
							disabled={renglon.lote_id === null}
							onClick={() => (renglon.lote_id === null ? undefined : ir({ lote: renglon.lote_id }))}
							className="grid w-full grid-cols-[minmax(200px,1fr)_minmax(0,3fr)] items-center gap-4 py-3 text-left enabled:hover:bg-suave max-menu:grid-cols-1"
						>
							<span className="flex flex-col">
								<b>{renglon.prenda}</b>
								<span className="text-etiqueta text-tinta2 tabular-nums">
									{renglon.piezas} piezas · {renglon.lotes.join(", ")}
								</span>
							</span>
							<Hilo paradas={renglon.hilo} />
						</button>
					</li>
				))}
			</ul>
		</article>
	);
}

/**
 * «Ya salieron del taller», por páginas.
 * @param props Lo leído y el filtro.
 */
function YaSalieron({ ordenes, filtro }: { ordenes: Ordenes; filtro: (typeof filtrosDeOrdenes)[number] }) {
	const [mas, setMas] = useState<Ordenes["salieron"] | null>(null);
	const tarjetas = [...ordenes.salieron.renglones, ...(mas?.renglones ?? [])];
	const pagina = mas ?? ordenes.salieron;
	if (tarjetas.length === 0) return null;
	/** Pide la página siguiente y la suma abajo. */
	const verMas = async () => {
		if (pagina.cursor === null) return;
		const siguiente = await consultar(ordenesDeProduccion, { filtro, cursor: pagina.cursor });
		setMas({ ...siguiente.salieron, renglones: [...(mas?.renglones ?? []), ...siguiente.salieron.renglones] });
	};
	return (
		<Seccion
			titulo="Ya salieron del taller"
			derecha={
				pagina.hay_mas ? (
					<Boton chico onClick={() => void verMas()}>
						Ver más
					</Boton>
				) : undefined
			}
		>
			<Tarjetas tarjetas={tarjetas} />
		</Seccion>
	);
}
