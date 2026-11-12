/**
 * `produccion.lotes`: la pestaña Lotes en cuatro grupos. Atorados (los atorados y los atrasados) y En proceso (primero
 * los en riesgo, luego por entrega; ahí van los «Sin datos de la tablet») en tarjetas con su tira de operaciones; Por
 * cortar, por fecha de corte, con su receta; y Terminados, los que esperan a Calidad. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { lotesDeProduccion } from "@uniformame/compartido/contratos/produccion/lotes";
import { sql } from "drizzle-orm";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	datosDelEstado,
	diasHasta,
	escribirParaQuien,
	estadoDelLote,
	leerLotes,
	loHechoPorOperacion,
	operacionAtorada,
	parametroNumero,
	saludDeLosLotes,
	textoEnDias,
	tiraDelLote,
	ultimaSincronizacion,
} from "./comun.ts";

export const consultaLotes = implementarConsulta(lotesDeProduccion, async (contexto) => {
	const hoy = contexto.diaDeNegocio;
	const lotes = await leerLotes(contexto, sql`l.estado IN ('por_cortar', 'en_proceso', 'terminado')`);
	const salud = await saludDeLosLotes(contexto);
	const sincronizacion = await ultimaSincronizacion(contexto);
	const hecho = await loHechoPorOperacion(contexto, sql`l.estado = 'en_proceso'`);
	const diasEntregaCorte = await parametroNumero(contexto, "inventario.dias_entrega_corte");
	// Las tarjetas de los lotes en proceso, con su estado y su tira.
	const tarjetas = lotes
		.filter((lote) => lote.estado === "en_proceso")
		.map((lote) => {
			const suSalud = salud.salud.get(lote.id);
			return {
				orden: suSalud?.tono === "ambar" ? 0 : 1,
				tarjeta: {
					lote_id: lote.id,
					folio: lote.folio,
					prenda: lote.prenda,
					piezas: lote.cortadas,
					para: escribirParaQuien(lote),
					estado: estadoDelLote(datosDelEstado(lote, salud, sincronizacion), hoy),
					tira: tiraDelLote(
						hecho.filter((operacion) => operacion.loteId === lote.id),
						lote.cortadas,
						operacionAtorada(suSalud),
					),
				},
			};
		});
	return {
		resultado: {
			atorados: tarjetas.filter(({ tarjeta }) => tarjeta.estado.color === "rojo").map(({ tarjeta }) => tarjeta),
			// Primero los en riesgo, luego por entrega (ya vienen por entrega).
			en_proceso: tarjetas
				.filter(({ tarjeta }) => tarjeta.estado.color !== "rojo")
				.sort((una, otra) => una.orden - otra.orden)
				.map(({ tarjeta }) => tarjeta),
			por_cortar: lotes
				.filter((lote) => lote.estado === "por_cortar")
				.sort((uno, otro) => uno.fecha_corte.localeCompare(otro.fecha_corte) || uno.folio.localeCompare(otro.folio))
				.map((lote) => {
					const dias = diasHasta(hoy, lote.fecha_corte);
					return {
						lote_id: lote.id,
						folio: lote.folio,
						prenda: lote.prenda,
						modelo: lote.modelo,
						piezas: lote.planeadas,
						fecha_corte: textoDeDiaCorto(lote.fecha_corte),
						en_dias: textoEnDias(dias),
						corte_pronto: dias <= diasEntregaCorte,
						para: escribirParaQuien(lote),
						receta: lote.receta,
					};
				}),
			terminados: lotes
				.filter((lote) => lote.estado === "terminado")
				.map((lote) => ({
					lote_id: lote.id,
					folio: lote.folio,
					prenda: lote.prenda,
					modelo: lote.modelo,
					listas: lote.listas,
					cortadas: lote.cortadas,
					merma: lote.merma,
					para: escribirParaQuien(lote),
				})),
		},
	};
});
