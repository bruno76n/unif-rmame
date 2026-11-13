/**
 * Pendientes de Mantenimiento: la barra de indicadores (Máquinas, Fallas, Servicios y Costo por máquina, cada cifra
 * lleva a su pestaña) y el panel con una falla abierta por renglón, sin filtros: «Atender» abre el cajón de la falla.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Pendientes»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";

import type { pendientesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import type { Contexto } from "@uniformame/interfaz/pagina/barra-indicadores";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import { PanelPendientes } from "@uniformame/interfaz/tablas/panel-pendientes";
import { TriangleAlert, Wallet, Wrench } from "lucide-react";
import type { z } from "zod";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { type PestanaDeMantenimiento, useDireccionDeMantenimiento } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Pendientes = z.infer<typeof pendientesDeMantenimiento.resultado>;

/**
 * La barra de indicadores de Mantenimiento.
 * @param props Los indicadores y a dónde lleva cada cifra.
 */
function Indicadores({
	indicadores,
	alTocar,
}: {
	indicadores: Pendientes["indicadores"];
	alTocar: (pestana: PestanaDeMantenimiento) => void;
}) {
	const { maquinas, fallas, servicios, costo } = indicadores;
	const lineaDeMaquinas: Contexto[] =
		maquinas.paradas > 0
			? [{ texto: plural(maquinas.paradas, "parada", "paradas"), tono: "rojo" }]
			: [{ texto: "Todas trabajan" }];
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "maquinas",
					nombre: "Máquinas",
					icono: Wrench,
					color: "azul",
					numero: maquinas.activas,
					unidad: "máquinas",
					...(maquinas.paradas > 0 ? { tono: "rojo" as const } : {}),
					contexto: lineaDeMaquinas,
					reparto: [
						{ color: "verde", valor: maquinas.trabajando, etiqueta: "Trabajando" },
						{ color: "ambar", valor: maquinas.con_falla, etiqueta: "Trabaja con falla" },
						{ color: "rojo", valor: maquinas.paradas, etiqueta: "Parada" },
					],
					alTocar: () => alTocar("maquinas"),
				},
				{
					clave: "fallas",
					nombre: "Fallas",
					icono: TriangleAlert,
					color: "rojo",
					numero: fallas.abiertas,
					unidad: fallas.abiertas === 1 ? "abierta" : "abiertas",
					...(fallas.abiertas > 0 ? { tono: "ambar" as const } : {}),
					contexto: [{ texto: `${plural(fallas.resueltas_en_el_anio, "resuelta", "resueltas")} en el año` }],
					alTocar: () => alTocar("fallas"),
				},
				{
					clave: "servicios",
					nombre: "Servicios",
					icono: Wrench,
					color: "verde-azulado",
					numero: servicios.en_el_anio,
					unidad: "en el año",
					contexto: [{ texto: `${montoEnPantalla(servicios.este_mes_centavos)} este mes` }],
					alTocar: () => alTocar("servicios"),
				},
				{
					clave: "costo",
					nombre: "Costo por máquina",
					icono: Wallet,
					color: "violeta",
					numero: costo.horas_paro,
					unidad: "horas de paro en el año",
					contexto: [
						{ texto: `${montoEnPantalla(costo.por_paro_centavos)} por paro`, tono: "rojo" },
						{ texto: `${montoEnPantalla(costo.reparaciones_centavos)} en reparaciones` },
					],
					serie: costo.horas_por_mes,
					alTocar: () => alTocar("costo"),
				},
			]}
		/>
	);
}

/**
 * Pendientes de Mantenimiento.
 * @param props Lo que regresa `mantenimiento.pendientes`.
 */
export function PendientesDeMantenimiento({ datos }: { datos: Pendientes }) {
	const { navegar, abrir } = useDireccionDeMantenimiento();
	return (
		<div className="flex flex-col gap-5">
			<Indicadores indicadores={datos.indicadores} alTocar={(pestana) => navegar({}, pestana)} />
			<PanelPendientes
				columnaCifra="Paro"
				filtro="todos"
				alEscogerFiltro={() => undefined}
				filtros={[]}
				pendientes={datos.renglones.map((renglon) => ({
					clave: renglon.falla_id,
					grupo: "fallas",
					tipo: { texto: "Falla", icono: Wrench, color: "rojo" },
					referencia: { titulo: renglon.referencia, detalle: renglon.detalle },
					fecha: { texto: textoDeDiaCorto(renglon.fecha), orden: renglon.fecha },
					cifra: renglon.horas_paro === null ? "—" : `${renglon.horas_paro} h de paro`,
					estado: { texto: renglon.estado.texto, color: renglon.estado.color },
					accion: { texto: "Atender", principal: renglon.parada, alTocar: () => abrir("falla", renglon.falla_id) },
				}))}
			/>
		</div>
	);
}
