/**
 * Lo que comparten las consultas de las pantallas de Bodega: el nombre de una variante, la cuenta del reabasto con sus
 * datos leídos (los mínimos, los libres, lo que viene en camino y lo ya sugerido) y las entregas al corte por hacer.
 * Fase 19 · docs/interfaz/fabrica/bodega.md, docs/modulos/inventario/minimos-y-reabasto.md (reglas 1 a 8 y 12) y
 * docs/modulos/inventario/entregas-a-corte.md (reglas 1, 3 y 10)
 *
 * La cuenta del reabasto es `cuentaDelReabasto` (`dominio/`): aquí solo se leen sus datos. Lo que pide un corte sale de
 * `patronaje.calcular_material` con las piezas planeadas que da `produccion.lotes_por_cortar`, y los rollos sugeridos
 * son los apartados `sugerido` que deja `inventario.recalcular_rollos_sugeridos`.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { cuentaDelReabasto, type RenglonDeReabasto } from "../dominio/cuenta-reabasto.ts";

/** Las columnas del nombre de una variante `v` (con su producto `p`, su talla `t` y su escuela `es`). */
export const columnasDeVariante = sql`v.id AS variante_id, p.nombre AS prenda, t.nombre AS talla,
	coalesce(es.nombre, 'Básico') AS escuela, v.codigo`;

/** Las uniones de una variante `v` con su producto, su talla y su escuela. */
export const unionesDeVariante = sql`JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
	LEFT JOIN escuelas es ON es.id = p.escuela_id`;

/** Una variante con su nombre, como sale de `columnasDeVariante`. */
export const deLaVariante = z.object({
	variante_id: z.uuid(),
	prenda: z.string(),
	talla: z.string(),
	escuela: z.string(),
	codigo: z.string().nullable(),
});

/** Una variante con su nombre. */
export type VarianteNombrada = z.infer<typeof deLaVariante>;

/** Una ubicación como la leen las pantallas de Bodega. */
const deLaUbicacion = z.object({
	id: z.uuid(),
	codigo: z.string(),
	nombre: z.string(),
	tipo: z.string(),
	sin_caja: z.boolean(),
	orden: z.coerce.number(),
});

/** Una ubicación leída. */
export type UbicacionLeida = z.infer<typeof deLaUbicacion>;

/**
 * Las siete ubicaciones, en su orden.
 * @param contexto El contexto de la lectura.
 */
export async function leerUbicaciones(contexto: ContextoDeAccion): Promise<UbicacionLeida[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT id, codigo, nombre, tipo, (tipo = 'tienda' AND existencia_desde IS NULL) AS sin_caja, orden
		FROM ubicaciones ORDER BY orden`);
	return z.array(deLaUbicacion).parse(rows);
}

/** Un número por ubicación y variante: `mapa[ubicacion][variante]`. */
type PorUbicacion = Record<string, Record<string, number>>;

/**
 * Lee filas de ubicación, variante y número en un mapa de mapas.
 * @param filas Las filas, con `ubicacion_id`, `variante_id` y `n`.
 */
function porUbicacion(filas: unknown[]): PorUbicacion {
	const mapa: PorUbicacion = {};
	const fila = z.object({ ubicacion_id: z.uuid(), variante_id: z.uuid(), n: z.coerce.number() });
	for (const { ubicacion_id, variante_id, n } of z.array(fila).parse(filas)) {
		mapa[ubicacion_id] = { ...mapa[ubicacion_id], [variante_id]: n };
	}
	return mapa;
}

/** Lo que leen las pantallas de Bodega para la cuenta del reabasto, y la cuenta hecha. */
export interface ReabastoLeido {
	ubicaciones: UbicacionLeida[];
	variantes: Map<string, VarianteNombrada & { mostrador: boolean; orden: number }>;
	/** La existencia de cada ubicación y variante. */
	existencia: PorUbicacion;
	/** Lo reservado de cada ubicación y variante. */
	reservado: PorUbicacion;
	/** Lo que viene en camino hacia cada ubicación (regla 4). */
	enCamino: PorUbicacion;
	/** Lo ya sugerido a Producción para cada ubicación (regla 7). */
	yaSugerido: PorUbicacion;
	/** La cuenta: un renglón por ubicación con mínimo (sin las tiendas sin caja) y variante. */
	cuenta: RenglonDeReabasto[];
}

/**
 * Lee los datos del reabasto y hace su cuenta: Bodega con las prendas activas y las tiendas con las que se venden en
 * mostrador (regla 2), repartiendo lo disponible de Bodega entre las tiendas.
 * @param contexto El contexto de la lectura.
 * @param soloVariante Si se pide, solo esa variante.
 */
export async function leerReabasto(contexto: ContextoDeAccion, soloVariante?: string): Promise<ReabastoLeido> {
	const { transaccion } = contexto;
	const deVariante = soloVariante === undefined ? sql`` : sql`AND v.id = ${soloVariante}::uuid`;
	const ubicaciones = await leerUbicaciones(contexto);
	const { rows: filasDeVariantes } = await transaccion.execute(sql`
		SELECT ${columnasDeVariante}, p.canal_mostrador AS mostrador,
			row_number() OVER (ORDER BY p.nombre, t.orden) AS orden
		FROM variantes v ${unionesDeVariante}
		WHERE p.baja_en IS NULL AND NOT p.es_servicio AND v.baja_en IS NULL AND v.descontinuada_en IS NULL
			AND NOT v.es_pedido_especial ${deVariante}`);
	const variantes = new Map(
		z
			.array(deLaVariante.extend({ mostrador: z.boolean(), orden: z.coerce.number() }))
			.parse(filasDeVariantes)
			.map((variante) => [variante.variante_id, variante]),
	);
	const filtro = soloVariante === undefined ? sql`` : sql`AND variante_id = ${soloVariante}::uuid`;
	const existencia = porUbicacion(
		(
			await transaccion.execute(
				sql`SELECT ubicacion_id, variante_id, piezas AS n FROM existencias WHERE piezas <> 0 ${filtro}`,
			)
		).rows,
	);
	const reservado = porUbicacion(
		(
			await transaccion.execute(sql`SELECT ubicacion_id, variante_id, sum(piezas) AS n FROM reservas
				WHERE estado = 'activa' ${filtro} GROUP BY 1, 2`)
		).rows,
	);
	// Lo que queda de los traspasos con ese destino en camino a aduana, en aduana o en tránsito (regla 4).
	const enCamino = porUbicacion(
		(
			await transaccion.execute(sql`SELECT t.destino_ubicacion_id AS ubicacion_id, l.variante_id,
					sum(coalesce(l.piezas_recibidas_aduana, l.piezas_enviadas, 0) - coalesce(l.piezas_recibidas_destino, 0)) AS n
				FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
				WHERE t.estado IN ('en_camino_aduana', 'en_aduana', 'en_transito') AND t.destino_ubicacion_id IS NOT NULL
					AND l.variante_id IS NOT NULL ${soloVariante === undefined ? sql`` : sql`AND l.variante_id = ${soloVariante}::uuid`}
				GROUP BY 1, 2`)
		).rows,
	);
	// Las sugerencias por decidir y las levantadas cuyo lote todavía no llega a aduana (regla 7).
	const yaSugerido = porUbicacion(
		(
			await transaccion.execute(sql`SELECT s.ubicacion_id, s.variante_id, sum(s.piezas) AS n
				FROM sugerencias_reabasto s LEFT JOIN lotes l ON l.id = s.lote_id
				WHERE (s.estado = 'por_decidir' OR (l.en_aduana_en IS NULL AND l.estado <> 'cancelado'))
					${soloVariante === undefined ? sql`` : sql`AND s.variante_id = ${soloVariante}::uuid`}
				GROUP BY 1, 2`)
		).rows,
	);
	const cuenta = await hacerLaCuenta(contexto, ubicaciones, [...variantes.values()], {
		existencia,
		reservado,
		enCamino,
		yaSugerido,
	});
	return { ubicaciones, variantes, existencia, reservado, enCamino, yaSugerido, cuenta };
}

/**
 * Hace la cuenta del reabasto con lo leído: los libres son la existencia menos lo reservado (regla 3).
 * @param contexto El contexto, para los mínimos y los parámetros.
 * @param ubicaciones Las ubicaciones.
 * @param variantes Las variantes activas, con si se venden en mostrador.
 * @param leido La existencia, lo reservado, lo que viene en camino y lo ya sugerido.
 */
async function hacerLaCuenta(
	contexto: ContextoDeAccion,
	ubicaciones: readonly UbicacionLeida[],
	variantes: readonly (VarianteNombrada & { mostrador: boolean })[],
	leido: Pick<ReabastoLeido, "existencia" | "reservado" | "enCamino" | "yaSugerido">,
): Promise<RenglonDeReabasto[]> {
	const { rows } = await contexto.transaccion.execute(
		sql`SELECT ubicacion_id, nivel, piezas FROM minimos WHERE baja_en IS NULL`,
	);
	const minimos = z
		.array(z.object({ ubicacion_id: z.uuid(), nivel: z.string(), piezas: z.coerce.number() }))
		.parse(rows);
	const tallas = String(await contexto.lectura("admin.parametro", { clave: "inventario.tallas_mayor_venta" }));
	const factorMeta = await parametroNumero(contexto, "inventario.factor_meta_reabasto");
	const libres: PorUbicacion = {};
	for (const ubicacion of ubicaciones) {
		const reservas = leido.reservado[ubicacion.id] ?? {};
		const suyas = { ...leido.existencia[ubicacion.id] };
		for (const [variante, piezas] of Object.entries(reservas)) suyas[variante] = (suyas[variante] ?? 0) - piezas;
		libres[ubicacion.id] = suyas;
	}
	const conMinimo = ubicaciones.flatMap((ubicacion) => {
		const suyos = minimos.filter((minimo) => minimo.ubicacion_id === ubicacion.id);
		if (suyos.length === 0 || (ubicacion.tipo !== "bodega" && ubicacion.tipo !== "tienda")) return [];
		const tipo: "bodega" | "tienda" = ubicacion.tipo;
		return [
			{
				id: ubicacion.id,
				tipo,
				sinCaja: ubicacion.sin_caja,
				minimos: {
					mayorVenta: suyos.find((minimo) => minimo.nivel === "mayor_venta")?.piezas ?? 0,
					demas: suyos.find((minimo) => minimo.nivel === "demas")?.piezas ?? 0,
				},
			},
		];
	});
	const comunes = {
		tallasMayorVenta: new Set(tallas.split(",").map((talla) => talla.trim())),
		factorMeta,
		libres,
		enCamino: leido.enCamino,
		yaSugerido: leido.yaSugerido,
	};
	const aVariante = (variante: VarianteNombrada) => ({ id: variante.variante_id, talla: variante.talla });
	// Bodega con todas las prendas activas; las tiendas, con las de mostrador (regla 2).
	const deBodega = cuentaDelReabasto({
		...comunes,
		ubicaciones: conMinimo.filter((ubicacion) => ubicacion.tipo === "bodega"),
		variantes: variantes.map(aVariante),
	});
	const deTiendas = cuentaDelReabasto({
		...comunes,
		ubicaciones: conMinimo,
		variantes: variantes.filter((variante) => variante.mostrador).map(aVariante),
	}).filter((renglon) => conMinimo.find((ubicacion) => ubicacion.id === renglon.ubicacionId)?.tipo === "tienda");
	return [...deBodega, ...deTiendas];
}

/**
 * Un número de un mapa de mapas, o 0.
 * @param mapa El mapa.
 * @param ubicacion La ubicación.
 * @param variante La variante.
 */
export function de(mapa: PorUbicacion, ubicacion: string, variante: string): number {
	return mapa[ubicacion]?.[variante] ?? 0;
}

/** Lo que regresa `produccion.lotes_por_cortar`, en lo que se usa aquí. */
const deLosLotesPorCortar = z.object({
	lotes: z.array(
		z.object({
			lote_id: z.uuid(),
			folio: z.string(),
			producto_id: z.uuid(),
			fecha_corte: z.string(),
			tiene_receta: z.boolean(),
			tallas: z.array(z.object({ talla_id: z.uuid(), piezas_planeadas: z.number() })),
		}),
	),
});

/** Lo que regresa `patronaje.calcular_material`, en lo que se usa aquí. */
const deLaCuenta = z.object({
	receta_version_id: z.uuid().nullable(),
	materiales: z.array(z.object({ material_id: z.uuid(), papel: z.string(), cantidad: z.number().nullable() })),
});

/** Lo que regresa `compras.datos_materiales`, en lo que se usa aquí. */
const deLosMateriales = z.record(z.string(), z.object({ nombre: z.string(), tipo: z.string(), unidad: z.string() }));

/** Un material de la receta de un lote, con lo que pide. */
export interface MaterialDelCorte {
	materialId: string;
	nombre: string;
	tipo: string;
	unidad: string;
	papel: string;
	cantidad: number | null;
}

/** Un lote por cortar con lo que pide su receta y lo que ya recibió. */
export interface CortePorEntregar {
	loteId: string;
	folio: string;
	productoId: string;
	prenda: string;
	fechaCorte: string;
	piezas: number;
	recetaVersionId: string | null;
	/** Todos los materiales de la receta, la principal primero. */
	materiales: MaterialDelCorte[];
	/** Las telas de la receta que todavía no recibe, la principal primero. */
	telasPorEntregar: MaterialDelCorte[];
	/** Los avíos de la receta, si todavía no se entregan; vacío si ya. */
	aviosPorEntregar: MaterialDelCorte[];
	/** Cuántos rollos ya recibió. */
	rollosEntregados: number;
}

/** El orden de los papeles de la receta: la principal primero. */
const ordenDePapel: Readonly<Record<string, number>> = { tela_principal: 0, combinacion: 1, forro: 2, avio: 3 };

/**
 * Los lotes por cortar con lo que pide su receta para sus piezas planeadas, lo que ya recibieron y lo que les falta.
 * Un lote sin receta va con `recetaVersionId` vacío y sin materiales.
 * @param contexto El contexto de la lectura.
 * @param soloLote Si se pide, solo ese lote.
 */
export async function cortesPorEntregar(contexto: ContextoDeAccion, soloLote?: string): Promise<CortePorEntregar[]> {
	const { lotes } = deLosLotesPorCortar.parse(await contexto.lectura("produccion.lotes_por_cortar", {}));
	const suyos = lotes.filter((lote) => soloLote === undefined || lote.lote_id === soloLote);
	if (suyos.length === 0) return [];
	const ids = sql.join(
		suyos.map((lote) => sql`${lote.lote_id}::uuid`),
		sql`, `,
	);
	const { rows: filasDeLotes } = await contexto.transaccion.execute(sql`
		SELECT l.id AS lote_id, p.nombre AS prenda,
			(SELECT count(*) FROM apartados_rollo a WHERE a.lote_id = l.id AND a.estado IN ('entregado', 'usado')) AS rollos,
			EXISTS (SELECT 1 FROM entregas_corte e WHERE e.lote_id = l.id AND e.estado <> 'devuelta') AS con_entrega
		FROM lotes l JOIN productos p ON p.id = l.producto_id WHERE l.id IN (${ids})`);
	const datosDeLotes = new Map(
		z
			.array(z.object({ lote_id: z.uuid(), prenda: z.string(), rollos: z.coerce.number(), con_entrega: z.boolean() }))
			.parse(filasDeLotes)
			.map((fila) => [fila.lote_id, fila]),
	);
	const { rows: filasRecibidas } = await contexto.transaccion.execute(sql`
		SELECT DISTINCT a.lote_id, r.material_id FROM apartados_rollo a JOIN rollos r ON r.id = a.rollo_id
		WHERE a.lote_id IN (${ids}) AND a.estado IN ('entregado', 'usado')`);
	const recibidas = new Set(
		z
			.array(z.object({ lote_id: z.uuid(), material_id: z.uuid() }))
			.parse(filasRecibidas)
			.map((fila) => `${fila.lote_id}:${fila.material_id}`),
	);
	const cortes: CortePorEntregar[] = [];
	for (const lote of suyos) {
		const datos = datosDeLotes.get(lote.lote_id);
		const piezas = lote.tallas.reduce((suma, talla) => suma + talla.piezas_planeadas, 0);
		const cuenta = lote.tiene_receta
			? deLaCuenta.parse(
					await contexto.lectura("patronaje.calcular_material", {
						producto_id: lote.producto_id,
						piezas_por_talla: lote.tallas.map((talla) => ({
							talla_id: talla.talla_id,
							piezas: talla.piezas_planeadas,
						})),
					}),
				)
			: { receta_version_id: null, materiales: [] };
		const nombres = deLosMateriales.parse(
			cuenta.materiales.length === 0
				? {}
				: await contexto.lectura("compras.datos_materiales", {
						material_ids: cuenta.materiales.map((material) => material.material_id),
					}),
		);
		const materiales = cuenta.materiales
			.map((material) => ({
				materialId: material.material_id,
				nombre: nombres[material.material_id]?.nombre ?? "",
				tipo: nombres[material.material_id]?.tipo ?? "",
				unidad: nombres[material.material_id]?.unidad ?? "",
				papel: material.papel,
				cantidad: material.cantidad,
			}))
			.sort((una, otra) => (ordenDePapel[una.papel] ?? 9) - (ordenDePapel[otra.papel] ?? 9));
		cortes.push({
			loteId: lote.lote_id,
			folio: lote.folio,
			productoId: lote.producto_id,
			prenda: datos?.prenda ?? "",
			fechaCorte: lote.fecha_corte,
			piezas,
			recetaVersionId: cuenta.receta_version_id,
			materiales,
			telasPorEntregar: materiales.filter(
				(material) => material.tipo === "tela" && !recibidas.has(`${lote.lote_id}:${material.materialId}`),
			),
			aviosPorEntregar: datos?.con_entrega === true ? [] : materiales.filter((material) => material.tipo !== "tela"),
			rollosEntregados: datos?.rollos ?? 0,
		});
	}
	return cortes;
}

/**
 * El papel de una tela como lo dice la pantalla: «combinación» o «forro»; nada en la principal.
 * @param papel Como lo guarda la receta.
 */
export function papelEscrito(papel: string): string | null {
	if (papel === "combinacion") return "combinación";
	if (papel === "forro") return "forro";
	return null;
}

/**
 * Unos metros como los escribe la pantalla: sin ceros de más («92.5», «214»).
 * @param cantidad Los metros, en número o en texto.
 */
export function metrosEscritos(cantidad: number | string): string {
	return String(Number(Number(cantidad).toFixed(3)));
}

/**
 * Los rollos y retazos que regresaron del corte y siguen en el Taller hasta que Bodega los recibe (regla 8 de entregas
 * a corte): su folio (el RZ- en un retazo), su tela, su partida, el lote de su corte, sus metros y la versión del rollo.
 * @param contexto El contexto de la lectura.
 */
export async function leerRegresosDelCorte(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
	SELECT r.id, r.version, r.es_retazo, coalesce(rz.folio, r.folio) AS folio, m.nombre AS tela, pt.folio AS partida,
		l.folio AS lote, em.cantidad::text AS metros, coalesce(rz.creado_en, r.actualizado_en)::text AS cuando
	FROM rollos r JOIN materiales m ON m.id = r.material_id
	JOIN existencias_material em ON em.rollo_id = r.id
	JOIN ubicaciones u ON u.id = em.ubicacion_id AND u.tipo = 'taller'
	LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
	LEFT JOIN retazos rz ON rz.rollo_id = r.id AND rz.estado = 'por_recibir'
	LEFT JOIN LATERAL (SELECT lo.folio FROM apartados_rollo a JOIN lotes lo ON lo.id = a.lote_id
		WHERE a.rollo_id = r.id ORDER BY a.creado_en DESC LIMIT 1) l ON true
	WHERE r.estado = 'por_recibir' AND em.cantidad > 0 ORDER BY folio`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				version: z.coerce.number(),
				es_retazo: z.boolean(),
				folio: z.string(),
				tela: z.string(),
				partida: z.string().nullable(),
				lote: z.string().nullable(),
				metros: z.string(),
				cuando: z.string(),
			}),
		)
		.parse(rows);
}

/** Un rollo libre de Bodega, con el lote al que está sugerido. */
const delRolloLibre = z.object({
	rollo_id: z.uuid(),
	folio: z.string(),
	material_id: z.uuid(),
	es_retazo: z.boolean(),
	partida: z.string().nullable(),
	metros: z.string(),
	sugerido_a: z.uuid().nullable(),
});

/** Un rollo libre de Bodega. */
export type RolloLibreDeBodega = z.infer<typeof delRolloLibre>;

/**
 * Los rollos libres de Bodega de unas telas: disponibles, con metros en Bodega y sin entregar a un lote (regla 1 de
 * entregas a corte), con el lote al que el sistema los sugirió. Por partida y folio.
 * @param contexto El contexto de la lectura.
 * @param materialIds Las telas.
 */
export async function rollosLibresDeBodega(
	contexto: ContextoDeAccion,
	materialIds: readonly string[],
): Promise<RolloLibreDeBodega[]> {
	if (materialIds.length === 0) return [];
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.id AS rollo_id, coalesce(rz.folio, r.folio) AS folio, r.material_id, r.es_retazo, pt.folio AS partida,
			em.cantidad::text AS metros,
			(SELECT a.lote_id FROM apartados_rollo a WHERE a.rollo_id = r.id AND a.estado = 'sugerido' LIMIT 1) AS sugerido_a
		FROM rollos r JOIN existencias_material em ON em.rollo_id = r.id
		JOIN ubicaciones u ON u.id = em.ubicacion_id AND u.tipo = 'bodega'
		LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
		LEFT JOIN retazos rz ON rz.rollo_id = r.id AND rz.estado = 'recibido'
		WHERE r.estado = 'disponible' AND em.cantidad > 0
			AND r.material_id IN (${sql.join(
				materialIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			)})
			AND NOT EXISTS (SELECT 1 FROM apartados_rollo a WHERE a.rollo_id = r.id AND a.estado = 'entregado')
		ORDER BY pt.folio NULLS LAST, r.folio`);
	return z.array(delRolloLibre).parse(rows);
}

/**
 * Lo que hay de unos materiales en Bodega, en su unidad.
 * @param contexto El contexto de la lectura.
 * @param materialIds Los materiales.
 * @returns Por material, la cantidad.
 */
export async function enBodegaDe(
	contexto: ContextoDeAccion,
	materialIds: readonly string[],
): Promise<Map<string, number>> {
	if (materialIds.length === 0) return new Map();
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT em.material_id, sum(em.cantidad) AS cantidad FROM existencias_material em
		JOIN ubicaciones u ON u.id = em.ubicacion_id AND u.tipo = 'bodega'
		WHERE em.material_id IN (${sql.join(
			materialIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)}) GROUP BY em.material_id`);
	const filas = z.array(z.object({ material_id: z.uuid(), cantidad: z.coerce.number() })).parse(rows);
	return new Map(filas.map((fila) => [fila.material_id, fila.cantidad]));
}
