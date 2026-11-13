/**
 * `ventas.revision_mandar`: la revisión antes de mandar un pedido a producción.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Mandar a producción (ancho)») y docs/interfaz/TEXTOS.md («La revisión
 * antes de mandar a producción»)
 *
 * Por prenda: lo que falta mandar de cada talla (del avance del pedido), lo libre en Bodega que se puede surtir, el
 * lote al que va (se suma al lote del pedido que todavía no se corta ni tiene tela, como hace Producción, o nace uno
 * con el folio que sigue y su fecha de corte) y el material con la misma cuenta que usa Compras. Arriba, los avisos
 * que no detienen nada. Nada se escribe: es lo que va a pasar al apretar «Mandar a producción».
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { revisionMandar } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import { avanceDe, fechaDeEntrega, leerClientes, leerPedidos } from "./comun.ts";

/** Una línea con su color. */
interface Linea {
	texto: string;
	color: "verde" | "ambar" | "rojo";
}

/** La prenda y la talla de cada variante por mandar. */
const deVariantes = z.array(
	z.object({
		id: z.uuid(),
		producto_id: z.uuid(),
		prenda: z.string(),
		talla: z.string(),
		talla_id: z.uuid(),
		orden: z.coerce.number(),
	}),
);

/** Los lotes por cortar del pedido. */
const deLotes = z.array(z.object({ id: z.uuid(), folio: z.string(), producto_id: z.uuid(), fecha_corte: z.string() }));

/** Lo que regresa `patronaje.calcular_material`. */
const materialDeLaReceta = z.object({
	receta_version_id: z.string().nullable(),
	materiales: z.array(z.object({ material_id: z.uuid(), papel: z.string(), cantidad: z.number().nullable() })),
});

/** Lo que se usa de `compras.cuenta_material`. */
const cuentaLeida = z.record(
	z.string(),
	z
		.object({
			libre_para_corte: z.string(),
			en_camino: z.array(z.object({ folio: z.string(), llegada_esperada: z.string() })),
		})
		.passthrough(),
);

/** Lo que se usa de `compras.datos_materiales`. */
const datosLeidos = z.record(
	z.string(),
	z.object({ nombre: z.string(), tipo: z.string(), unidad: z.string() }).passthrough(),
);

/**
 * Una cantidad de material como se lee: hasta dos decimales.
 * @param cantidad La cantidad.
 */
function cantidadEnTexto(cantidad: number): string {
	return cantidad.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

/**
 * El folio que sigue a otro: L-2026-021 → L-2026-022.
 * @param folio El folio.
 * @param salto Cuántos después.
 */
function folioDespues(folio: string, salto: number): string {
	return folio.replace(/(\d+)$/, (numero) => String(Number(numero) + salto).padStart(numero.length, "0"));
}

/**
 * Las líneas del material de una prenda: cada tela con lo que usa y lo que hay, lo que llega o lo que falta; los avíos
 * juntos si están completos.
 * @param contexto El contexto de la consulta.
 * @param productoId La prenda.
 * @param tallas Las piezas por talla que se mandan.
 * @param fechaCorte Cuándo se corta.
 */
async function lineasDeMaterial(
	contexto: ContextoDeConsulta,
	productoId: string,
	tallas: readonly { talla_id: string; piezas: number }[],
	fechaCorte: string,
): Promise<Linea[]> {
	const receta = materialDeLaReceta.parse(
		await contexto.lectura("patronaje.calcular_material", { producto_id: productoId, piezas_por_talla: tallas }),
	);
	if (receta.receta_version_id === null) {
		return [{ texto: "Sin receta: no se corta hasta que Patronaje la capture", color: "rojo" }];
	}
	const ids = receta.materiales.map((material) => material.material_id);
	const cuentas = cuentaLeida.parse(await contexto.lectura("compras.cuenta_material", { material_ids: ids }));
	const datos = datosLeidos.parse(await contexto.lectura("compras.datos_materiales", { material_ids: ids }));
	const lineas = receta.materiales.map((material) => {
		const dato = datos[material.material_id];
		const cuenta = cuentas[material.material_id];
		const usa = material.cantidad ?? 0;
		const libre = Number(cuenta?.libre_para_corte ?? 0);
		const unidad = dato?.unidad ?? "";
		const nombre = dato?.nombre ?? "Material";
		const esTela = dato?.tipo === "tela";
		if (libre >= usa) {
			return {
				esTela,
				completo: true,
				linea: {
					texto: `${nombre}: usa ${cantidadEnTexto(usa)} ${unidad} · hay ${cantidadEnTexto(libre)} ${unidad} libres`,
					color: "verde" as const,
				},
			};
		}
		const llega = [...(cuenta?.en_camino ?? [])].sort((una, otra) =>
			una.llegada_esperada.localeCompare(otra.llegada_esperada),
		)[0];
		if (llega !== undefined) {
			const espera = llega.llegada_esperada > fechaCorte ? " · el corte espera a que llegue" : "";
			return {
				esTela,
				completo: false,
				linea: {
					texto: `${nombre}: usa ${cantidadEnTexto(usa)} ${unidad} · llega el ${textoDeDiaCorto(llega.llegada_esperada)} con ${llega.folio}${espera}`,
					color: "ambar" as const,
				},
			};
		}
		return {
			esTela,
			completo: false,
			linea: {
				texto: `${nombre}: faltan ${cantidadEnTexto(usa - Math.max(0, libre))} ${unidad} · Compras tiene que pedirla`,
				color: "rojo" as const,
			},
		};
	});
	const avios = lineas.filter((linea) => !linea.esTela);
	return [
		...lineas.filter((linea) => linea.esTela).map((linea) => linea.linea),
		...(avios.length > 0 && avios.every((linea) => linea.completo)
			? [{ texto: "Avíos completos", color: "verde" as const }]
			: avios.filter((linea) => !linea.completo).map((linea) => linea.linea)),
	];
}

export const consultaRevisionMandar = implementarConsulta(revisionMandar, async (contexto, parametros) => {
	const { base, diaDeNegocio: hoy } = contexto;
	const [pedido] = await leerPedidos(base, { pedidoId: parametros.pedido_id });
	if (pedido === undefined || pedido.estado === "cancelado") throw noExiste();
	const avance = pedido.estado === "confirmado" ? (await avanceDe(contexto, pedido.id)).tallas : [];
	const porMandar = avance.filter((talla) => talla.por_mandar > 0);
	if (porMandar.length === 0) throw errorDeRegla("nada_por_mandar", "Todo el pedido ya está en producción");
	const cliente = (await leerClientes(base)).find((suyo) => suyo.id === pedido.cliente_id);
	const variantes = deVariantes.parse(
		(
			await base.execute(sql`SELECT v.id, v.producto_id, p.nombre AS prenda, t.nombre AS talla, t.id AS talla_id, t.orden
			FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			WHERE v.id IN (${sql.join(
				porMandar.map((talla) => sql`${talla.variante_id}::uuid`),
				sql`, `,
			)}) ORDER BY ${ordenDeTallas("t")}`)
		).rows,
	);
	const { rows: deBodega } = await base.execute(sql`SELECT id FROM ubicaciones WHERE tipo = 'bodega' LIMIT 1`);
	const bodega = z.object({ id: z.uuid() }).parse(deBodega[0]).id;
	const libresDe = async (varianteId: string) =>
		Math.max(
			0,
			z
				.object({ libres: z.number() })
				.parse(await contexto.lectura("inventario.libres", { ubicacion_id: bodega, variante_id: varianteId })).libres,
		);
	// Los lotes del pedido que todavía no se cortan ni tienen tela entregada: ahí se suman las piezas.
	const lotes = deLotes.parse(
		(
			await base.execute(sql`SELECT id, folio, producto_id, fecha_corte::text AS fecha_corte FROM lotes
			WHERE pedido_id = ${pedido.id} AND estado = 'por_cortar' ORDER BY folio`)
		).rows,
	);
	const conTela = z
		.object({ lotes: z.array(z.object({ lote_id: z.uuid() })) })
		.parse(await contexto.lectura("inventario.lotes_con_tela_entregada", { lote_ids: lotes.map((lote) => lote.id) }))
		.lotes.map((lote) => lote.lote_id);
	const sumables = lotes.filter((lote) => !conTela.includes(lote.id));
	const diasCorte = await parametroEntero(base, "produccion.dias_corte_lote_nuevo");
	const corteNuevo = hoy.add({ days: diasCorte }).toString();
	const siguienteLote = z
		.object({ folio: z.string() })
		.parse(await contexto.lectura("admin.siguiente_folio", { tipo: "lote" })).folio;
	const productos = [...new Set(variantes.map((variante) => variante.producto_id))].sort();
	let nuevos = 0;
	const prendas = await Promise.all(
		productos.map(async (productoId) => {
			const suyas = variantes.filter((variante) => variante.producto_id === productoId);
			const deTalla = (variante: (typeof suyas)[number]) =>
				porMandar.find((talla) => talla.variante_id === variante.id);
			const piezasDe = (variante: (typeof suyas)[number]) => deTalla(variante)?.por_mandar ?? 0;
			const lote = sumables.find((suyo) => suyo.producto_id === productoId);
			const folioNuevo = lote === undefined ? folioDespues(siguienteLote, nuevos++) : undefined;
			const fechaCorte = lote?.fecha_corte ?? corteNuevo;
			const libres = await Promise.all(
				suyas.map(async (variante) => ({
					variante,
					libres: Math.min(await libresDe(variante.id), piezasDe(variante)),
				})),
			);
			const conLibres = libres.filter((libre) => libre.libres > 0);
			return {
				producto_id: productoId,
				nombre: suyas[0]?.prenda ?? "",
				tallas: suyas.map((variante) => `${variante.talla}: ${piezasDe(variante)}`).join(" · "),
				piezas: suyas.reduce((total, variante) => total + piezasDe(variante), 0),
				bodega:
					conLibres.length === 0
						? null
						: {
								texto: `Bodega tiene libres: ${conLibres.map((libre) => `${libre.variante.talla}: ${libre.libres}`).join(" · ")}`,
								piezas: conLibres.reduce((total, libre) => total + libre.libres, 0),
							},
				lote:
					lote === undefined
						? `Lote nuevo ${folioNuevo ?? ""} · se corta el ${textoDeDiaCorto(fechaCorte)}`
						: `Se suman al lote ${lote.folio}, que se corta el ${textoDeDiaCorto(fechaCorte)}`,
				fechaCorte,
				material: await lineasDeMaterial(
					contexto,
					productoId,
					suyas.map((variante) => ({ talla_id: variante.talla_id, piezas: piezasDe(variante) })),
					fechaCorte,
				),
			};
		}),
	);
	const sinReceta = prendas.filter((prenda) => prenda.material.some((linea) => linea.texto.startsWith("Sin receta")));
	const lineas = prendas.flatMap((prenda) => prenda.material);
	const avisos: Linea[] = [
		...(sinReceta.length === 1
			? [
					{
						texto: `${sinReceta[0]?.nombre ?? ""} no tiene receta: no se corta hasta que Patronaje la capture`,
						color: "rojo" as const,
					},
				]
			: sinReceta.length > 1
				? [
						{
							texto: `${plural(sinReceta.length, "prenda no tiene", "prendas no tienen")} receta: no se corta hasta que Patronaje la capture`,
							color: "rojo" as const,
						},
					]
				: []),
		...(lineas.some((linea) => linea.color === "rojo" && !linea.texto.startsWith("Sin receta"))
			? [{ texto: "Falta material: el corte no puede empezar hasta que Compras lo consiga", color: "rojo" as const }]
			: []),
		...(lineas.some((linea) => linea.texto.endsWith("el corte espera a que llegue"))
			? [{ texto: "Parte del material llega después de la fecha de corte", color: "ambar" as const }]
			: []),
	];
	const piezas = prendas.reduce((total, prenda) => total + prenda.piezas, 0);
	const primerCorte = prendas.map((prenda) => prenda.fechaCorte).sort()[0] ?? corteNuevo;
	const diasEnRiesgo = await parametroEntero(base, "ventas.dias_en_riesgo");
	return {
		resultado: {
			pedido_id: pedido.id,
			folio: pedido.folio,
			version: pedido.version,
			cliente: { cliente_id: pedido.cliente_id, nombre: pedido.cliente, color: cliente?.color ?? null },
			piezas,
			prendas_cuantas: prendas.length,
			entrega: fechaDeEntrega(pedido.fecha_entrega, hoy, diasEnRiesgo),
			hilo: [
				{ parada: "pedido" as const, piezas, linea: "hoy", tono: "normal" as const },
				sinReceta.length > 0
					? { parada: "corte" as const, piezas, linea: "falta la receta", tono: "rojo" as const }
					: {
							parada: "corte" as const,
							piezas,
							linea: `se corta el ${textoDeDiaCorto(primerCorte)}`,
							tono: "normal" as const,
						},
				{ parada: "costura" as const, piezas: 0, linea: "", tono: "normal" as const },
				{ parada: "calidad" as const, piezas: 0, linea: "", tono: "normal" as const },
				{ parada: "aduana" as const, piezas: 0, linea: "", tono: "normal" as const },
				{
					parada: "entrega" as const,
					piezas: 0,
					linea: `para el ${textoDeDiaCorto(pedido.fecha_entrega)}`,
					tono: "normal" as const,
				},
			],
			avisos,
			prendas: prendas.map(({ fechaCorte: _fechaCorte, ...prenda }) => prenda),
		},
	};
});
