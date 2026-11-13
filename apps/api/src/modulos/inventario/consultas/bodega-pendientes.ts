/**
 * `inventario.bodega_pendientes`: Pendientes de Bodega. Las cifras (la existencia, lo por surtir, las variantes en
 * cero, las diferencias abiertas y los ajustes en Dirección), un renglón por cada cosa por hacer (excepciones, pedidos
 * y devoluciones por surtir, recepciones por confirmar, entregas al corte, lo que regresa del corte y diferencias) y el
 * panel «Variantes en cero».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Pendientes») y docs/interfaz/comunes.md («La página de un departamento»)
 *
 * Lo por surtir es lo mismo que cuenta la pastilla del menú (`pastillaBodega`): las piezas apartadas en Bodega que no
 * van en un traspaso. Las entregas al corte salen a `inventario.dias_entrega_corte` días o menos del corte, rojas a
 * `produccion.tela_por_entregar_rojo_dias`. Las variantes en cero salen de la cuenta del reabasto.
 */

import { diasHasta, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { pendientesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { datosDeDevolucion, lineasDeDevolucion } from "../dominio/devoluciones.ts";
import { traspasos } from "../tablas.ts";
import {
	cortesPorEntregar,
	de,
	leerReabasto,
	leerRegresosDelCorte,
	metrosEscritos,
	type ReabastoLeido,
} from "./bodega-comun.ts";

/** Un renglón de Pendientes. */
type Pendiente = z.infer<typeof pendientesDeBodega.resultado>["renglones"][number];

/** Lo que tiene un renglón por omisión. */
const sinExtras: Pick<Pendiente, "version" | "apartadas" | "rollos" | "devolucion"> = {
	version: null,
	apartadas: [],
	rollos: [],
	devolucion: null,
};

/** El rango de cada color al ordenar: rojo, ámbar, gris, lo demás. */
const rangoDeColor: Readonly<Record<string, number>> = { rojo: 0, ambar: 1, gris: 2 };

/** Cuántas variantes en cero muestra el panel. */
const enElPanel = 8;

/**
 * Un día de negocio de un momento guardado.
 * @param momento El momento en ISO.
 */
function diaDe(momento: string): string {
	return Temporal.Instant.from(momento).toZonedDateTimeISO("America/Mexico_City").toPlainDate().toString();
}

/** Los pedidos externos y en línea con piezas apartadas en Bodega sin surtir. */
async function pedidosPorSurtir(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.id AS reserva_id, r.piezas, p.nombre AS prenda, t.nombre AS talla,
			pe.id AS pedido_id, pe.folio AS pe_folio, ter.nombre AS cliente, pe.fecha_entrega::text AS entrega,
			w.id AS linea_id, w.folio AS w_folio, coalesce(w.envio_destinatario, w.cliente_nombre) AS destinatario,
			w.pagado_en::text AS pagado_en
		FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id AND u.tipo = 'bodega'
		JOIN variantes v ON v.id = r.variante_id JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
		LEFT JOIN pedidos pe ON pe.id = r.pedido_id AND r.motivo = 'pedido_externo'
		LEFT JOIN clientes c ON c.id = pe.cliente_id LEFT JOIN terceros ter ON ter.id = c.tercero_id
		LEFT JOIN pedidos_linea w ON w.id = r.pedido_linea_id AND w.estado = 'por_surtir'
		WHERE r.estado = 'activa' AND r.traspaso_id IS NULL AND (pe.id IS NOT NULL OR w.id IS NOT NULL)
		ORDER BY p.nombre, t.orden`);
	const filas = z
		.array(
			z.object({
				reserva_id: z.uuid(),
				piezas: z.coerce.number(),
				prenda: z.string(),
				talla: z.string(),
				pedido_id: z.uuid().nullable(),
				pe_folio: z.string().nullable(),
				cliente: z.string().nullable(),
				entrega: z.string().nullable(),
				linea_id: z.uuid().nullable(),
				w_folio: z.string().nullable(),
				destinatario: z.string().nullable(),
				pagado_en: z.string().nullable(),
			}),
		)
		.parse(rows);
	const porDocumento = Map.groupBy(filas, (fila) => fila.pedido_id ?? fila.linea_id ?? "");
	return [...porDocumento.entries()].map(([documentoId, suyas]) => {
		const [primera] = suyas;
		const piezas = suyas.reduce((suma, fila) => suma + fila.piezas, 0);
		const apartadas = suyas.map(({ reserva_id, prenda, talla, piezas }) => ({ reserva_id, prenda, talla, piezas }));
		if (primera?.pe_folio != null) {
			return {
				clave: `pe:${documentoId}`,
				grupo: "surtido",
				tipo: "pedido_externo",
				titulo: `${primera.pe_folio} · ${primera.cliente ?? ""}`,
				detalle: suyas.map((fila) => `${fila.prenda} ${fila.talla}: ${fila.piezas}`).join(" · "),
				fecha: primera.entrega === null ? null : `Entrega ${textoDeDiaCorto(primera.entrega)}`,
				orden: primera.entrega ?? "",
				cantidad: `${piezas} pz`,
				estado: { texto: "Por surtir", color: "ambar" },
				boton: "surtir",
				documento_id: documentoId,
				...sinExtras,
				apartadas,
			} satisfies Pendiente;
		}
		const pagado = primera?.pagado_en ?? null;
		const hora =
			pagado === null
				? null
				: Temporal.Instant.from(pagado).toZonedDateTimeISO("America/Mexico_City").toPlainTime().toString().slice(0, 5);
		return {
			clave: `w:${documentoId}`,
			grupo: "surtido",
			tipo: "pedido_linea",
			titulo: `${primera?.w_folio ?? ""} · ${primera?.destinatario ?? ""}`,
			detalle: suyas.map((fila) => `${fila.prenda} ${fila.talla}`).join(" · "),
			fecha: pagado === null ? null : `Pagado ${textoDeDiaCorto(diaDe(pagado))} ${hora}`,
			orden: pagado ?? "",
			cantidad: `${piezas} pz`,
			estado: { texto: "Por surtir · sale hoy", color: "rojo" },
			boton: "surtir",
			documento_id: documentoId,
			...sinExtras,
			apartadas,
		} satisfies Pendiente;
	});
}

/** Las devoluciones a proveedor que Bodega tiene que surtir a aduana. */
async function devolucionesPorSurtir(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT t.id FROM traspasos t JOIN ubicaciones u ON u.id = t.origen_ubicacion_id AND u.tipo = 'bodega'
		WHERE t.tipo = 'devolucion_proveedor' AND t.estado = 'esperado' ORDER BY t.creado_en`);
	const renglones: Pendiente[] = [];
	for (const { id } of z.array(z.object({ id: z.uuid() })).parse(rows)) {
		const [devolucion] = await contexto.transaccion.select().from(traspasos).where(sql`${traspasos.id} = ${id}`);
		if (devolucion === undefined) continue;
		const datos = await datosDeDevolucion(contexto, devolucion);
		const lineas = await lineasDeDevolucion(contexto, id);
		const cantidad = metrosEscritos(lineas.reduce((suma, linea) => suma + Number(linea.cantidadEnviada ?? 0), 0));
		const { rows: filasDeRollos } = await contexto.transaccion.execute(sql`
			SELECT r.id AS rollo_id, r.folio, pt.folio AS partida, em.cantidad::text AS metros
			FROM rollos r JOIN existencias_material em ON em.rollo_id = r.id
			JOIN ubicaciones u ON u.id = em.ubicacion_id AND u.tipo = 'bodega'
			LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
			WHERE r.orden_compra_id = ${devolucion.ordenCompraId}::uuid AND r.material_id = ${datos.materialId}::uuid
				AND r.estado = 'disponible' AND em.cantidad > 0 ORDER BY r.folio`);
		const rollos = z
			.array(z.object({ rollo_id: z.uuid(), folio: z.string(), partida: z.string().nullable(), metros: z.string() }))
			.parse(filasDeRollos)
			.map((rollo) => ({ ...rollo, metros: metrosEscritos(rollo.metros) }));
		renglones.push({
			clave: `dp:${id}`,
			grupo: "surtido",
			tipo: "devolucion_proveedor",
			titulo: `${devolucion.folio} · ${datos.proveedor}`,
			detalle: `${cantidad} ${datos.unidad} de ${datos.material} · ${datos.folioOrden}`,
			fecha: textoDeDiaCorto(diaDe(devolucion.creadoEn)),
			orden: devolucion.creadoEn,
			cantidad: `${cantidad} ${datos.unidad}`,
			estado: { texto: "Por surtir", color: "ambar" },
			boton: datos.esTela ? "surtir_rollos" : "surtir",
			documento_id: id,
			...sinExtras,
			rollos: datos.esTela ? rollos : [],
			devolucion: {
				proveedor: datos.proveedor,
				cantidad,
				unidad: datos.unidad,
				material: datos.material,
				oc: datos.folioOrden,
			},
		});
	}
	return renglones;
}

/** Los despachos de Aduana en tránsito a Bodega. */
async function recepcionesPorConfirmar(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT d.id, d.folio, d.version, d.despachado_en::text AS salio,
			string_agg(coalesce(p.nombre || ' ' || t.nombre || ': ' || l.piezas_enviadas, m.nombre), ' · ' ORDER BY l.renglon) AS trae,
			sum(l.piezas_enviadas) AS piezas, sum(l.cantidad_enviada) AS metros
		FROM despachos d JOIN ubicaciones u ON u.id = d.destino_ubicacion_id AND u.tipo = 'bodega'
		JOIN traspasos tr ON tr.despacho_id = d.id JOIN traspaso_lineas l ON l.traspaso_id = tr.id
		LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = l.material_id
		WHERE d.estado = 'en_transito' GROUP BY d.id ORDER BY d.despachado_en`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				folio: z.string(),
				version: z.coerce.number(),
				salio: z.string(),
				trae: z.string().nullable(),
				piezas: z.coerce.number().nullable(),
				metros: z.string().nullable(),
			}),
		)
		.parse(rows)
		.map((despacho) => ({
			clave: `d:${despacho.id}`,
			grupo: "recepciones",
			tipo: "recepcion",
			titulo: `${despacho.folio} · Aduana`,
			detalle: despacho.trae ?? "",
			fecha: textoDeDiaCorto(diaDe(despacho.salio)),
			orden: despacho.salio,
			cantidad: despacho.piezas === null ? `${metrosEscritos(despacho.metros ?? 0)} m` : `${despacho.piezas} pz`,
			estado: { texto: "En tránsito", color: "ambar" },
			boton: "confirmar_llegada",
			documento_id: despacho.id,
			...sinExtras,
			version: despacho.version,
		}));
}

/**
 * Los nombres de unas telas como los dice Pendientes: «{tela}», «{tela} y {tela}» o «{n} telas».
 * @param telas Los nombres.
 */
function nombresDeTelas(telas: readonly string[]): string {
	if (telas.length <= 2) return telas.join(" y ");
	return `${telas.length} telas`;
}

/** Las entregas al corte a `inventario.dias_entrega_corte` días o menos, con alguna tela por entregar. */
async function entregasAlCorte(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	const diasEntrega = await parametroNumero(contexto, "inventario.dias_entrega_corte");
	const diasRojo = await parametroNumero(contexto, "produccion.tela_por_entregar_rojo_dias");
	const cortes = await cortesPorEntregar(contexto);
	return cortes.flatMap((corte): Pendiente[] => {
		const dias = diasHasta(contexto.diaDeNegocio, corte.fechaCorte);
		const sinReceta = corte.recetaVersionId === null;
		if (dias > diasEntrega || (!sinReceta && corte.telasPorEntregar.length === 0)) return [];
		const comun = {
			clave: `l:${corte.loteId}`,
			grupo: "materiales",
			tipo: "entrega_corte",
			titulo: `${corte.folio} · ${corte.prenda}`,
			fecha: `Corte ${textoDeDiaCorto(corte.fechaCorte)}`,
			orden: corte.fechaCorte,
			documento_id: corte.loteId,
			...sinExtras,
		} as const;
		if (sinReceta) {
			return [
				{
					...comun,
					detalle: "Falta la receta para saber cuánta",
					cantidad: "—",
					estado: { texto: "Esperando receta", color: "gris" },
					boton: null,
				},
			];
		}
		const [primera] = corte.telasPorEntregar;
		const avios = corte.aviosPorEntregar.length;
		const telas = nombresDeTelas(corte.telasPorEntregar.map((tela) => tela.nombre));
		const estado =
			dias <= diasRojo
				? { texto: `Por entregar · corte ${dias === 1 ? "mañana" : "hoy"}`, color: "rojo" as const }
				: { texto: `Por entregar · corte en ${dias} días`, color: "ambar" as const };
		return [
			{
				...comun,
				detalle: avios > 0 ? `${telas} · ${plural(avios, "avío", "avíos")}` : telas,
				cantidad: primera?.cantidad == null ? "—" : `${metrosEscritos(primera.cantidad)} m`,
				estado,
				boton: "entregar_tela",
			},
		];
	});
}

/** Los rollos y retazos que regresaron del corte y siguen en el Taller. */
async function regresosDelCorte(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	return (await leerRegresosDelCorte(contexto)).map((rollo) => ({
		clave: `r:${rollo.id}`,
		grupo: "materiales",
		tipo: rollo.es_retazo ? "retazo" : "rollo_corte",
		titulo: `${rollo.folio} · ${rollo.tela}`,
		detalle: [
			rollo.lote === null ? null : `Lote ${rollo.lote}`,
			rollo.partida === null ? null : `partida ${rollo.partida}`,
		]
			.filter((parte) => parte !== null)
			.join(" · "),
		fecha: null,
		orden: rollo.cuando,
		cantidad: `${metrosEscritos(rollo.metros)} m`,
		estado: { texto: "Por recibir", color: "ambar" },
		boton: "recibir_corte",
		documento_id: rollo.id,
		...sinExtras,
		version: rollo.version,
	}));
}

/** Las diferencias por contar de Bodega y las de recepción y de material por aclarar. */
async function diferenciasAbiertas(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT f.id, f.folio, f.version, f.origen, f.estado, f.descripcion, f.piezas, f.cantidad::text AS cantidad,
			f.creado_en::text AS cuando, p.nombre AS prenda, t.nombre AS talla, m.nombre AS material, m.unidad
		FROM diferencias f JOIN ubicaciones u ON u.id = f.ubicacion_id
		LEFT JOIN variantes v ON v.id = f.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = f.material_id
		WHERE (f.estado = 'por_contar' AND u.tipo = 'bodega') OR f.estado = 'por_aclarar'
		ORDER BY f.creado_en`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				folio: z.string(),
				version: z.coerce.number(),
				origen: z.string(),
				estado: z.string(),
				descripcion: z.string(),
				piezas: z.coerce.number().nullable(),
				cantidad: z.string().nullable(),
				cuando: z.string(),
				prenda: z.string().nullable(),
				talla: z.string().nullable(),
				material: z.string().nullable(),
				unidad: z.string().nullable(),
			}),
		)
		.parse(rows)
		.map((diferencia) => {
			const cantidad =
				diferencia.piezas === null
					? `${metrosEscritos(Math.abs(Number(diferencia.cantidad ?? 0)))} ${diferencia.unidad ?? ""}`
					: `${Math.abs(diferencia.piezas)} pz`;
			const comun = {
				clave: `df:${diferencia.id}`,
				grupo: "diferencias",
				detalle: diferencia.descripcion,
				fecha: textoDeDiaCorto(diaDe(diferencia.cuando)),
				orden: diferencia.cuando,
				cantidad,
				documento_id: diferencia.id,
				...sinExtras,
				version: diferencia.version,
			} as const;
			if (diferencia.estado === "por_contar") {
				return {
					...comun,
					tipo: "diferencia",
					titulo: `${diferencia.folio} · ${diferencia.prenda ?? ""} · talla ${diferencia.talla ?? ""}`,
					estado: { texto: "Por contar", color: "ambar" },
					boton: "contar",
				} satisfies Pendiente;
			}
			return {
				...comun,
				tipo: diferencia.piezas === null ? "diferencia_material" : "diferencia_recepcion",
				titulo: `${diferencia.folio} · ${diferencia.prenda ?? diferencia.material ?? ""}`,
				estado: { texto: "Por aclarar", color: "ambar" },
				boton: "aclarar",
			} satisfies Pendiente;
		});
}

/** Las excepciones de Bodega por resolver. */
async function excepcionesPorResolver(contexto: ContextoDeAccion): Promise<Pendiente[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT x.id, x.version, x.descripcion, x.detectada_en::text AS cuando, x.documento_folio, d.nombre AS aparato
		FROM excepciones x LEFT JOIN dispositivos d ON d.id = x.dispositivo_id
		WHERE x.estado = 'por_revisar' AND x.area = 'bodega' ORDER BY x.detectada_en`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				version: z.coerce.number(),
				descripcion: z.string(),
				cuando: z.string(),
				documento_folio: z.string().nullable(),
				aparato: z.string().nullable(),
			}),
		)
		.parse(rows)
		.map((excepcion) => ({
			clave: `x:${excepcion.id}`,
			grupo: "excepciones",
			tipo: "excepcion",
			titulo: excepcion.descripcion,
			detalle: excepcion.aparato ?? excepcion.documento_folio ?? "",
			fecha: textoDeDiaCorto(diaDe(excepcion.cuando)),
			orden: excepcion.cuando,
			cantidad: "—",
			estado: { texto: "Por resolver", color: "rojo" },
			boton: "resolver",
			documento_id: excepcion.id,
			...sinExtras,
			version: excepcion.version,
		}));
}

/**
 * El panel «Variantes en cero»: las ubicaciones con mínimo en cero, primero las que no tienen nada en camino, luego
 * las tallas de mayor venta y luego las que tienen más libres en Bodega.
 * @param leido La cuenta del reabasto con sus datos.
 * @param tallasMayorVenta Las tallas de mayor venta.
 */
function variantesEnCero(leido: ReabastoLeido, tallasMayorVenta: ReadonlySet<string>) {
	const bodega = leido.ubicaciones.find((ubicacion) => ubicacion.tipo === "bodega");
	const libresDeBodega = (variante: string) =>
		bodega === undefined
			? 0
			: Math.max(0, de(leido.existencia, bodega.id, variante) - de(leido.reservado, bodega.id, variante));
	const renglones = leido.cuenta.flatMap((renglon) => {
		const variante = leido.variantes.get(renglon.varianteId);
		const ubicacion = leido.ubicaciones.find((suya) => suya.id === renglon.ubicacionId);
		if (!renglon.enCero || variante === undefined || ubicacion === undefined) return [];
		const enCamino = de(leido.enCamino, renglon.ubicacionId, renglon.varianteId);
		const libres = ubicacion.tipo === "tienda" ? libresDeBodega(renglon.varianteId) : 0;
		const disponible = enCamino > 0 ? "en_camino" : libres > 0 && renglon.mover > 0 ? "bodega" : "sin_existencia";
		return [
			{
				variante_id: variante.variante_id,
				prenda: variante.prenda,
				talla: variante.talla,
				escuela: variante.escuela,
				codigo: variante.codigo,
				ubicacion_id: ubicacion.id,
				ubicacion: ubicacion.nombre,
				disponible,
				piezas: disponible === "en_camino" ? enCamino : disponible === "bodega" ? libres : 0,
				mover: renglon.mover,
				orden: [enCamino > 0 ? 1 : 0, tallasMayorVenta.has(variante.talla) ? 0 : 1, -libres, variante.orden],
			} as const,
		];
	});
	renglones.sort((una, otra) => {
		for (const [indice, valor] of una.orden.entries()) {
			const diferencia = valor - (otra.orden[indice] ?? 0);
			if (diferencia !== 0) return diferencia;
		}
		return 0;
	});
	return {
		total: renglones.length,
		renglones: renglones.slice(0, enElPanel).map(({ orden: _orden, ...renglon }) => renglon),
	};
}

/** Las cifras de arriba. */
async function indicadores(contexto: ContextoDeAccion, porSurtir: readonly Pendiente[], enCero: number) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT
			coalesce(sum(e.piezas), 0) AS total,
			coalesce(sum(e.piezas) FILTER (WHERE u.tipo = 'bodega'), 0) AS bodega,
			coalesce(sum(e.piezas) FILTER (WHERE u.tipo = 'tienda'), 0) AS tiendas,
			(SELECT coalesce(sum(abs(piezas)), 0) FROM diferencias WHERE estado <> 'resuelta' AND piezas IS NOT NULL) AS dif_piezas,
			(SELECT count(*) FROM diferencias WHERE estado <> 'resuelta') AS dif_registros,
			(SELECT count(*) FROM ajustes WHERE estado = 'esperando_autorizacion') AS ajustes
		FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id`);
	const fila = z
		.object({
			total: z.coerce.number(),
			bodega: z.coerce.number(),
			tiendas: z.coerce.number(),
			dif_piezas: z.coerce.number(),
			dif_registros: z.coerce.number(),
			ajustes: z.coerce.number(),
		})
		.parse(rows[0]);
	return {
		existencia: {
			total: fila.total,
			bodega: fila.bodega,
			tiendas: fila.tiendas,
			demas: fila.total - fila.bodega - fila.tiendas,
		},
		por_surtir: {
			total: porSurtir.length,
			en_linea: porSurtir.filter((renglon) => renglon.tipo === "pedido_linea").length,
		},
		en_cero: enCero,
		diferencias: { piezas: fila.dif_piezas, registros: fila.dif_registros },
		ajustes: fila.ajustes,
	};
}

export const consultaPendientesDeBodega = implementarConsulta(pendientesDeBodega, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const porSurtir = [...(await pedidosPorSurtir(accion)), ...(await devolucionesPorSurtir(accion))];
		const todos = [
			...(await excepcionesPorResolver(accion)),
			...porSurtir,
			...(await recepcionesPorConfirmar(accion)),
			...(await entregasAlCorte(accion)),
			...(await regresosDelCorte(accion)),
			...(await diferenciasAbiertas(accion)),
		];
		// Rojo, ámbar, gris; dentro de cada color, por fecha.
		todos.sort(
			(uno, otro) =>
				(rangoDeColor[uno.estado.color] ?? 3) - (rangoDeColor[otro.estado.color] ?? 3) ||
				uno.orden.localeCompare(otro.orden),
		);
		const conteos: Record<string, number> = { todos: todos.length };
		for (const renglon of todos) conteos[renglon.grupo] = (conteos[renglon.grupo] ?? 0) + 1;
		const grupo = parametros.grupo ?? "todos";
		const leido = await leerReabasto(accion);
		const tallas = String(await accion.lectura("admin.parametro", { clave: "inventario.tallas_mayor_venta" }));
		const enCero = variantesEnCero(leido, new Set(tallas.split(",").map((talla) => talla.trim())));
		const contables = todos.filter((renglon) => renglon.estado.texto !== "Esperando receta");
		return {
			indicadores: await indicadores(accion, porSurtir, enCero.total),
			conteos,
			renglones: grupo === "todos" ? todos : todos.filter((renglon) => renglon.grupo === grupo),
			pastilla: {
				conteo: contables.length,
				rojo: contables.some((renglon) => renglon.estado.color === "rojo"),
			},
			en_cero: enCero,
		};
	}),
}));
