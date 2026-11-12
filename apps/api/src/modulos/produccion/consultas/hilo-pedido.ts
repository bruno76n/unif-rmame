/**
 * `produccion.hilo_pedido`: el hilo de un pedido en el cajón del pedido de Ventas y en «{n} lotes en producción».
 * Fase 19 · docs/interfaz/comunes.md («El hilo del pedido») y docs/interfaz/TEXTOS.md («El hilo»)
 *
 * Por prenda, las seis paradas con sus piezas y su línea corta: Pedido (cuándo se mandó o cuánto falta por mandar),
 * Corte (cuándo se corta o se cortó, o que falta la receta), Costura (cuántas van listas, o dónde está atorado),
 * Calidad (lo que espera su revisión), Aduana (lo listo) y Entrega (lo entregado o en nota). Lo de cada talla sale
 * del avance que calcula Ventas (`ventas.avance_pedido`) y la salud de cada lote, de `produccion.salud_de_lotes`.
 * Nada de dinero.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { hiloPedido } from "@uniformame/compartido/contratos/produccion/hilo";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Lo que regresa `ventas.avance_pedido`, lo que se usa. */
const deAvance = z.object({
	tallas: z.array(
		z.object({
			variante_id: z.uuid(),
			pedido: z.number(),
			entregado: z.number(),
			en_nota: z.number(),
			listo: z.number(),
			por_mandar: z.number(),
			de_mas: z.number(),
		}),
	),
});
/** Lo que regresa `produccion.salud_de_lotes`. */
const deSalud = z.object({
	lotes: z.array(
		z.object({ lote_id: z.uuid(), salud: z.string(), tono: z.enum(["normal", "ambar", "rojo"]), atorado: z.boolean() }),
	),
});
/** La prenda y la talla de cada variante del pedido. */
const deVariantes = z.array(z.object({ id: z.uuid(), producto_id: z.uuid(), prenda: z.string(), talla: z.string() }));
/** Los lotes del pedido con sus piezas. */
const deLotes = z.array(
	z.object({
		id: z.uuid(),
		folio: z.string(),
		producto_id: z.uuid(),
		estado: z.string(),
		con_receta: z.boolean(),
		fecha_corte: z.string(),
		cortado: z.string().nullable(),
		mandado: z.string(),
		cortadas: z.coerce.number(),
		terminadas: z.coerce.number(),
	}),
);

/** Cómo dice cada etapa de un lote que no está en proceso. */
const etapa: Readonly<Record<string, string>> = {
	por_cortar: "Por cortar",
	terminado: "Terminado",
	revisado: "Revisado",
	en_aduana: "En aduana",
	cancelado: "Cancelado",
};

export const consultaHiloPedido = implementarConsulta(
	hiloPedido,
	async ({ base, diaDeNegocio, lectura }, parametros) => {
		const { rows: pedidos } = await base.execute(
			sql`SELECT fecha_entrega::text AS fecha_entrega FROM pedidos WHERE id = ${parametros.pedido_id}`,
		);
		const pedido = z.object({ fecha_entrega: z.string().nullable() }).optional().parse(pedidos[0]);
		if (pedido === undefined) throw noExiste();
		const avance = deAvance.parse(await lectura("ventas.avance_pedido", { pedido_id: parametros.pedido_id }));
		const salud = deSalud.parse(await lectura("produccion.salud_de_lotes", { pedido_id: parametros.pedido_id })).lotes;
		const variantes =
			avance.tallas.length === 0
				? []
				: deVariantes.parse(
						(
							await base.execute(sql`SELECT v.id, v.producto_id, p.nombre AS prenda, t.nombre AS talla FROM variantes v
							JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
							WHERE v.id IN (${sql.join(
								avance.tallas.map((talla) => sql`${talla.variante_id}::uuid`),
								sql`, `,
							)}) ORDER BY t.orden`)
						).rows,
					);
		const lotes = deLotes.parse(
			(
				await base.execute(sql`SELECT l.id, l.folio, l.producto_id, l.estado, l.receta_version_id IS NOT NULL AS con_receta,
					l.fecha_corte::text AS fecha_corte, (l.cortado_en AT TIME ZONE 'America/Mexico_City')::date::text AS cortado,
					(o.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS mandado,
					coalesce(sum(t.piezas_cortadas), 0) AS cortadas, coalesce(sum(t.piezas_terminadas), 0) AS terminadas
				FROM lotes l JOIN ordenes_produccion o ON o.id = l.orden_produccion_id
				LEFT JOIN lote_tallas t ON t.lote_id = l.id
				WHERE l.pedido_id = ${parametros.pedido_id} AND l.estado <> 'cancelado'
				GROUP BY l.id, o.creado_en ORDER BY l.folio`)
			).rows,
		);
		const productos = [
			...new Map(variantes.map((variante) => [variante.producto_id, variante.prenda])).entries(),
		].filter(([productoId]) => parametros.producto_id === undefined || productoId === parametros.producto_id);
		const hoy = diaDeNegocio.toString();
		return {
			resultado: {
				prendas: productos.map(([productoId, prenda]) => {
					const tallas = avance.tallas.filter(
						(talla) => variantes.find((variante) => variante.id === talla.variante_id)?.producto_id === productoId,
					);
					const suma = (campo: "pedido" | "entregado" | "en_nota" | "listo" | "por_mandar") =>
						tallas.reduce((total, talla) => total + talla[campo], 0);
					const suyos = lotes.filter((lote) => lote.producto_id === productoId);
					const cortadas = suyos.reduce((total, lote) => total + lote.cortadas, 0);
					const terminadas = suyos.reduce((total, lote) => total + lote.terminadas, 0);
					const sinCortar = suyos.filter((lote) => lote.cortado === null);
					const saludes = salud.filter((una) => suyos.some((lote) => lote.id === una.lote_id));
					const atorado = saludes.find((una) => una.atorado);
					const porMandar = suma("por_mandar");
					const primeroMandado = suyos.map((lote) => lote.mandado).sort()[0];
					const corte = (() => {
						if (sinCortar.some((lote) => !lote.con_receta)) return { linea: "falta la receta", tono: "rojo" as const };
						const siguiente = sinCortar.map((lote) => lote.fecha_corte).sort()[0];
						if (siguiente !== undefined) {
							return siguiente < hoy
								? { linea: "corte atrasado", tono: "rojo" as const }
								: { linea: `se corta el ${textoDeDiaCorto(siguiente)}`, tono: "normal" as const };
						}
						const ultimoCorte = suyos
							.map((lote) => lote.cortado ?? "")
							.sort()
							.at(-1);
						return {
							linea: ultimoCorte === undefined || ultimoCorte === "" ? "" : textoDeDiaCorto(ultimoCorte),
							tono: "normal" as const,
						};
					})();
					const peorTono = saludes.some((una) => una.tono === "rojo")
						? ("rojo" as const)
						: saludes.some((una) => una.tono === "ambar")
							? ("ambar" as const)
							: ("normal" as const);
					const porRevisar = suyos
						.filter((lote) => lote.estado === "terminado")
						.reduce((total, lote) => total + lote.terminadas, 0);
					const listas = suma("listo");
					const entregadas = suma("entregado");
					const enNota = suma("en_nota");
					return {
						producto_id: productoId,
						prenda,
						paradas: [
							{
								parada: "pedido" as const,
								piezas: suma("pedido"),
								linea:
									porMandar > 0
										? `${porMandar} por mandar`
										: primeroMandado === undefined
											? ""
											: textoDeDiaCorto(primeroMandado),
								tono: porMandar > 0 ? ("ambar" as const) : ("normal" as const),
							},
							{ parada: "corte" as const, piezas: cortadas, ...corte },
							{
								parada: "costura" as const,
								piezas: terminadas,
								linea:
									atorado !== undefined
										? atorado.salud.toLocaleLowerCase("es-MX")
										: cortadas > 0
											? `${terminadas} de ${cortadas} listas`
											: "",
								tono: atorado !== undefined ? ("rojo" as const) : peorTono,
							},
							{
								parada: "calidad" as const,
								piezas: porRevisar,
								linea: porRevisar > 0 ? "por revisar" : "",
								tono: "normal" as const,
							},
							{
								parada: "aduana" as const,
								piezas: listas,
								linea: listas > 0 ? "listas" : suyos.some((lote) => lote.estado === "revisado") ? "por recibir" : "",
								tono: "normal" as const,
							},
							{
								parada: "entrega" as const,
								piezas: entregadas,
								linea:
									entregadas > 0
										? `${entregadas} entregadas`
										: enNota > 0
											? "en nota"
											: pedido.fecha_entrega === null
												? ""
												: `para el ${textoDeDiaCorto(pedido.fecha_entrega)}`,
								tono: "normal" as const,
							},
						],
						lotes: suyos.map((lote) => ({
							lote_id: lote.id,
							folio: lote.folio,
							estado: lote.estado,
							salud: saludes.find((una) => una.lote_id === lote.id)?.salud ?? etapa[lote.estado] ?? null,
						})),
						de_mas: tallas
							.filter((talla) => talla.de_mas > 0)
							.map((talla) => ({
								talla: variantes.find((variante) => variante.id === talla.variante_id)?.talla ?? "",
								piezas: talla.de_mas,
							})),
					};
				}),
			},
		};
	},
);
