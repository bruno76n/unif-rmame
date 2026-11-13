/**
 * Pendientes de Calidad: las tres cifras de arriba (Por revisar, Defectos y Reclamos), cada una lleva a su pestaña, y el
 * panel con la cola de trabajo, cada renglón con su botón: «Revisar» un lote (negro si es para hoy), «Aprobar» un
 * reproceso (solo si Aduana ya recibió su lote), «Revisar» una devolución y «Ver reclamo».
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Pendientes»)
 *
 * Todo llega escrito de `calidad.pendientes`: la pantalla no calcula estados ni porcentajes.
 */

import {
	gruposDePendientesDeCalidad,
	pendientesDeCalidad,
	type renglonDePendientesDeCalidad,
} from "@uniformame/compartido/contratos/calidad/pendientes";
import { aprobarReproceso } from "@uniformame/compartido/contratos/calidad/revision";
import type { Filtro } from "@uniformame/interfaz/captura/filtros";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { CircleAlert, ClipboardCheck, type LucideIcon, RotateCcw, Undo2, Users, Workflow } from "lucide-react";
import type { z } from "zod";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { rutasDeCalidad, useDireccion } from "../direccion.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";
import { PaginaDeCalidad } from "../pagina.tsx";

/** Un renglón de Pendientes, como llega. */
type Renglon = z.infer<typeof renglonDePendientesDeCalidad>;

/** El nombre, el ícono y el color de cada tipo de pendiente. */
const tipos: Readonly<Record<Renglon["tipo"], { texto: string; icono: LucideIcon; color: ColorDeTipo }>> = {
	lote: { texto: "Lote", icono: Workflow, color: "azul" },
	reproceso: { texto: "Reproceso", icono: RotateCcw, color: "violeta" },
	devolucion: { texto: "Devolución de cliente", icono: Undo2, color: "verde-azulado" },
	reclamo: { texto: "Reclamo", icono: Users, color: "rojo" },
};

/** El texto de cada filtro. */
const nombresDeFiltro: Readonly<Record<(typeof gruposDePendientesDeCalidad)[number], string>> = {
	todos: "Todos",
	lotes: "Lotes",
	devoluciones: "Devoluciones",
	reclamos: "Reclamos",
};

/** El grupo de cada tipo: los reprocesos van con los lotes. */
const grupoDe: Readonly<Record<Renglon["tipo"], string>> = {
	lote: "lotes",
	reproceso: "lotes",
	devolucion: "devoluciones",
	reclamo: "reclamos",
};

/** Los colores de la barra de los tres defectos más comunes. */
const coloresDeDefectos = ["rojo", "naranja", "ambar"] as const;

/** La pestaña Pendientes de Calidad. */
export function PestanaPendientes() {
	const { leer, ir } = useDireccion();
	const grupo = gruposDePendientesDeCalidad.find((uno) => uno === leer("grupo")) ?? "todos";
	const consulta = useConsulta(pendientesDeCalidad, {});
	const datos = consulta.data;
	return (
		<PaginaDeCalidad
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
		</PaginaDeCalidad>
	);
}

/**
 * Las tres cifras de Pendientes; cada una lleva a su pestaña.
 * @param props Lo que regresa `calidad.pendientes` en `indicadores`.
 */
function Indicadores({ indicadores }: { indicadores: z.infer<typeof pendientesDeCalidad.resultado>["indicadores"] }) {
	const { ir } = useDireccion();
	const { por_revisar: porRevisar, defectos, reclamos } = indicadores;
	const comunes = defectos.comunes.slice(0, 2).map((defecto) => ({ texto: `${defecto.piezas} ${defecto.nombre}` }));
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "por-revisar",
					nombre: "Por revisar",
					icono: ClipboardCheck,
					color: "azul",
					numero: porRevisar.lotes,
					unidad: porRevisar.lotes === 1 ? "lote esperando" : "lotes esperando",
					...(porRevisar.lotes > 0 ? { tono: "ambar" as const } : {}),
					contexto: [
						{ texto: `${porRevisar.piezas} piezas` },
						...(porRevisar.en_reproceso > 0 ? [{ texto: `${porRevisar.en_reproceso} piezas en reproceso` }] : []),
					],
					alTocar: () => ir({}, rutasDeCalidad.porRevisar),
				},
				{
					clave: "defectos",
					nombre: "Defectos",
					icono: CircleAlert,
					color: "ambar",
					numero: `${defectos.porcentaje.toFixed(1)}%`,
					unidad: `rechazado en ${defectos.dias} días`,
					contexto: comunes,
					reparto: defectos.comunes.map((defecto, i) => ({
						etiqueta: defecto.nombre,
						valor: defecto.piezas,
						color: coloresDeDefectos[i] ?? "ambar",
					})),
					alTocar: () => ir({}, rutasDeCalidad.defectos),
				},
				{
					clave: "reclamos",
					nombre: "Reclamos",
					icono: Users,
					color: "rojo",
					numero: reclamos.por_resolver,
					unidad: "por resolver",
					...(reclamos.por_resolver > 0 ? { tono: "rojo" as const } : {}),
					contexto: [{ texto: `${reclamos.en_el_anio} en el año` }],
					alTocar: () => ir({}, rutasDeCalidad.reclamos),
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
	const { ir } = useDireccion();
	const conConexion = useConConexion();
	const aprobar = useAccion(aprobarReproceso, loQueCambiaEnCalidad);
	/** El botón de cada renglón, según su tipo. */
	const accionDe = (renglon: Renglon): Pendiente["accion"] => {
		switch (renglon.tipo) {
			case "lote":
				return {
					texto: "Revisar",
					alTocar: () => ir({ lote: renglon.lote_id }, rutasDeCalidad.porRevisar),
					principal: renglon.urgente,
				};
			case "reproceso":
				return renglon.puede_aprobar
					? {
							texto: "Aprobar",
							alTocar: () =>
								aprobar.mutate({ datos: { reproceso_id: renglon.reproceso_id }, version: renglon.version }),
							deshabilitada: !conConexion,
						}
					: undefined;
			case "devolucion":
				return { texto: "Revisar", alTocar: () => ir({ cajon: "devolucion", id: renglon.traspaso_id }) };
			case "reclamo":
				return {
					texto: "Ver reclamo",
					alTocar: () => ir({ reclamo: renglon.reclamo_id }, rutasDeCalidad.reclamos),
				};
		}
	};
	const pendientes: Pendiente[] = renglones.map((renglon) => {
		const accion = accionDe(renglon);
		return {
			clave: renglon.clave,
			grupo: grupoDe[renglon.tipo],
			tipo: tipos[renglon.tipo],
			referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
			...(renglon.fecha === null
				? {}
				: { fecha: { texto: renglon.fecha, orden: renglon.fecha_orden ?? "", roja: renglon.fecha_roja } }),
			cifra: renglon.cifra,
			estado: { texto: renglon.estado, color: renglon.color },
			...(accion === undefined ? {} : { accion }),
		};
	});
	const filtros: Filtro[] = gruposDePendientesDeCalidad
		.filter((clave) => clave === "todos" || (conteos[clave] ?? 0) > 0)
		.map((clave) => ({ clave, texto: nombresDeFiltro[clave], conteo: conteos[clave] ?? 0 }));
	return (
		<PanelPendientes
			pendientes={pendientes}
			filtros={filtros}
			filtro={grupo}
			alEscogerFiltro={alEscogerGrupo}
			columnaCifra="Piezas"
		/>
	);
}
