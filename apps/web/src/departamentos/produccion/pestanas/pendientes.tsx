/**
 * Pendientes de Producción: las cuatro cifras de arriba (Lotes, Corte, Órdenes de producción y Producción), cada una
 * lleva a su pestaña, y el panel con la cola de trabajo, cada renglón con su botón: «Aplicar a lotes», «Ver lote»,
 * «Capturar corte» o «Capturar receta», «Levantar orden» y «Resolver».
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Pendientes»)
 *
 * Todo llega escrito de `produccion.pendientes`: la pantalla no calcula estados ni lo que hará un cambio de pedido.
 */

import { useRouter } from "@tanstack/react-router";
import { aplicarCambioPedido } from "@uniformame/compartido/contratos/produccion/cambios";
import { levantarOrdenSugerencia } from "@uniformame/compartido/contratos/produccion/ordenes";
import {
	gruposDePendientesDeProduccion,
	pendientesDeProduccion,
	type renglonDePendientesDeProduccion,
} from "@uniformame/compartido/contratos/produccion/pendientes";
import type { Filtro } from "@uniformame/interfaz/captura/filtros";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import {
	BarChart3,
	ClipboardList,
	FileDiff,
	type LucideIcon,
	Scissors,
	TriangleAlert,
	Warehouse,
	Workflow,
} from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import { enOtroDepartamento } from "../cuenta.ts";
import { rutasDeProduccion, useDireccion } from "../direccion.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";
import { PaginaDeProduccion } from "../pagina.tsx";
import { VentanaResolverExcepcion } from "../ventanas/resolver-excepcion.tsx";

/** Un renglón de Pendientes, como llega. */
type Renglon = z.infer<typeof renglonDePendientesDeProduccion>;

/** El nombre, el ícono y el color de cada tipo de pendiente, y el nombre de su filtro. */
const tipos: Readonly<Record<Renglon["tipo"], { texto: string; icono: LucideIcon; color: ColorDeTipo }>> = {
	cambio: { texto: "Cambio de pedido", icono: FileDiff, color: "violeta" },
	lote: { texto: "Lote", icono: Workflow, color: "azul" },
	corte: { texto: "Corte", icono: Scissors, color: "rosa" },
	sugerencia: { texto: "Sugerencia de bodega", icono: Warehouse, color: "verde-azulado" },
	excepcion: { texto: "Excepción", icono: TriangleAlert, color: "rojo" },
};

/** El texto de cada filtro. */
const nombresDeFiltro: Readonly<Record<(typeof gruposDePendientesDeProduccion)[number], string>> = {
	todos: "Todos",
	cambios: "Cambios de pedido",
	lotes: "Lotes",
	corte: "Corte",
	sugerencias: "Sugerencias",
	excepciones: "Excepciones",
};

/** El grupo de cada tipo. */
const grupoDe: Readonly<Record<Renglon["tipo"], string>> = {
	cambio: "cambios",
	lote: "lotes",
	corte: "corte",
	sugerencia: "sugerencias",
	excepcion: "excepciones",
};

/** La pestaña Pendientes de Producción. */
export function PestanaPendientes() {
	const { leer, ir } = useDireccion();
	const grupo = gruposDePendientesDeProduccion.find((uno) => uno === leer("grupo")) ?? "todos";
	const consulta = useConsulta(pendientesDeProduccion, {});
	const datos = consulta.data;
	return (
		<PaginaDeProduccion
			activa="pendientes"
			{...(datos === undefined ? {} : { pendientes: { conteo: datos.conteos.todos, rojo: datos.hay_rojo } })}
		>
			<SegunConsulta consulta={consulta}>
				{(leidos) => (
					<>
						<Indicadores indicadores={leidos.indicadores} />
						<ColaDeTrabajo
							renglones={leidos.renglones}
							conteos={leidos.conteos}
							grupo={grupo}
							alEscogerGrupo={(clave) => ir({ grupo: clave === "todos" ? undefined : clave })}
						/>
					</>
				)}
			</SegunConsulta>
		</PaginaDeProduccion>
	);
}

/**
 * Las cuatro cifras de Pendientes; cada una lleva a su pestaña.
 * @param props Lo que regresa `produccion.pendientes` en `indicadores`.
 */
function Indicadores({
	indicadores,
}: {
	indicadores: z.infer<typeof pendientesDeProduccion.resultado>["indicadores"];
}) {
	const { ir } = useDireccion();
	const { lotes, corte, ordenes, produccion } = indicadores;
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "lotes",
					nombre: "Lotes",
					icono: Workflow,
					color: "azul",
					numero: lotes.en_proceso,
					unidad: "en proceso",
					...(lotes.atorados > 0 ? { tono: "rojo" } : lotes.en_riesgo > 0 ? { tono: "ambar" } : {}),
					contexto: [{ texto: `${lotes.por_cortar} por cortar` }],
					reparto: [
						{ etiqueta: "Atorados", valor: lotes.atorados, color: "rojo" },
						{ etiqueta: "En riesgo", valor: lotes.en_riesgo, color: "ambar" },
						{ etiqueta: "En tiempo", valor: lotes.en_tiempo, color: "azul" },
					],
					alTocar: () => ir({}, rutasDeProduccion.lotes),
				},
				{
					clave: "corte",
					nombre: "Corte",
					icono: Scissors,
					color: "rosa",
					numero: corte.proximos,
					unidad: `en los próximos ${corte.dias} días`,
					contexto:
						corte.sin_receta > 0
							? [{ texto: `${corte.sin_receta} sin receta`, tono: "rojo" }]
							: [{ texto: "Todo con receta" }],
					alTocar: () => ir({}, rutasDeProduccion.corte),
				},
				{
					clave: "ordenes",
					nombre: "Órdenes de producción",
					icono: ClipboardList,
					color: "violeta",
					numero: ordenes.en_taller,
					unidad: "en el taller",
					contexto: [{ texto: `${ordenes.de_clientes} de clientes` }, { texto: `${ordenes.de_reabasto} de reabasto` }],
					alTocar: () => ir({}, rutasDeProduccion.ordenes),
				},
				{
					clave: "produccion",
					nombre: "Producción",
					icono: BarChart3,
					color: "verde",
					numero: produccion.terminadas_hoy,
					unidad: produccion.terminadas_hoy === 1 ? "prenda terminada hoy" : "prendas terminadas hoy",
					contexto: [{ texto: "Prendas terminadas por día" }],
					serie: produccion.por_dia,
					alTocar: () => ir({}, rutasDeProduccion.porPersona),
				},
			]}
		/>
	);
}

/**
 * El panel de Pendientes con sus filtros (solo los que tienen renglones) y el botón de cada renglón.
 * @param props Los renglones, los conteos, el filtro activo y qué hacer al escoger otro.
 */
function ColaDeTrabajo({
	renglones,
	conteos,
	grupo,
	alEscogerGrupo,
}: {
	renglones: readonly Renglon[];
	conteos: Readonly<Record<string, number>>;
	grupo: string;
	alEscogerGrupo: (clave: string) => void;
}) {
	const router = useRouter();
	const { ir } = useDireccion();
	const tiene = useTieneDepartamento();
	const [excepcion, setExcepcion] = useState<Extract<Renglon, { tipo: "excepcion" }> | null>(null);
	const aplicar = useAccion(aplicarCambioPedido, loQueCambiaEnProduccion);
	const levantar = useAccion(levantarOrdenSugerencia, loQueCambiaEnProduccion);
	/** El botón de cada renglón, según su tipo. */
	const accionDe = (renglon: Renglon): Pendiente["accion"] => {
		switch (renglon.tipo) {
			case "cambio":
				return {
					texto: "Aplicar a lotes",
					alTocar: () =>
						aplicar.mutate({ datos: { cambio_pedido_id: renglon.cambio_pedido_id }, version: renglon.version }),
				};
			case "lote":
				return {
					texto: "Ver lote",
					alTocar: () => ir({ cajon: "lote", id: renglon.lote_id }),
					principal: renglon.atorado,
				};
			case "corte":
				if (renglon.con_receta) {
					return { texto: "Capturar corte", alTocar: () => ir({ cortar: renglon.lote_id }, rutasDeProduccion.corte) };
				}
				return tiene("patronaje")
					? {
							texto: "Capturar receta",
							alTocar: () => router.history.push(enOtroDepartamento.receta(renglon.producto_id)),
						}
					: undefined;
			case "sugerencia":
				return {
					texto: "Levantar orden",
					alTocar: () => levantar.mutate({ datos: { sugerencia_ids: renglon.sugerencia_ids } }),
				};
			case "excepcion":
				return { texto: "Resolver", alTocar: () => setExcepcion(renglon) };
		}
	};
	const pendientes: Pendiente[] = renglones.map((renglon) => {
		const efectos = renglon.tipo === "cambio" ? renglon.efectos : [];
		const accion = accionDe(renglon);
		return {
			clave: renglon.clave,
			grupo: grupoDe[renglon.tipo],
			tipo: tipos[renglon.tipo],
			referencia: { titulo: renglon.titulo, detalle: [renglon.detalle, ...efectos].filter(Boolean).join(" · ") },
			...(renglon.fecha === null
				? {}
				: { fecha: { texto: renglon.fecha, orden: renglon.fecha_orden ?? "", roja: renglon.fecha_roja } }),
			...(renglon.cifra === null ? {} : { cifra: renglon.cifra }),
			estado: { texto: renglon.estado, color: renglon.color },
			...(accion === undefined ? {} : { accion }),
		};
	});
	const filtros: Filtro[] = gruposDePendientesDeProduccion
		.filter((clave) => clave === "todos" || (conteos[clave] ?? 0) > 0)
		.map((clave) => ({ clave, texto: nombresDeFiltro[clave], conteo: conteos[clave] ?? 0 }));
	return (
		<>
			<PanelPendientes
				pendientes={pendientes}
				filtros={filtros}
				filtro={grupo}
				alEscogerFiltro={alEscogerGrupo}
				columnaCifra="Avance"
			/>
			<VentanaResolverExcepcion excepcion={excepcion} alCerrar={() => setExcepcion(null)} />
		</>
	);
}
