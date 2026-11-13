/**
 * `catalogo.ficha_producto`: el cajón «Ficha de producto» de Catálogo.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Ficha de producto»)
 *
 * El producto con sus canales, su categoría, su recargo y su flujo; lo que lo detiene; las columnas de listas (las tres
 * generales y las de cliente donde tiene precio) y las de cliente que se le pueden agregar; sus precios vigentes; cada
 * talla con su código, su estado y su existencia en toda la fábrica (vacía si nunca se ha recibido), y la baja con
 * cuándo, quién y por qué; las tallas de sus grupos que se le pueden agregar; su receta (de Patronaje, solo lectura) y
 * sus medidas; sus últimos cambios; y si la cuenta tiene Patronaje, para «Abrir receta».
 */

import { fichaDeProducto } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { detieneDe, filas, formaDeLoQueDetiene, loQueDetieneA, parametroNumero, siguienteCodigo } from "./comunes.ts";

/** El producto como lo lee la base. */
const productoLeido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	nombre: z.string(),
	seccion_id: z.uuid(),
	seccion: z.string(),
	lleva_receta: z.boolean(),
	escuela_id: z.uuid().nullable(),
	escuela: z.string().nullable(),
	es_servicio: z.boolean(),
	descontinuado: z.boolean(),
	foto_archivo_id: z.uuid().nullable(),
	mostrador: z.boolean(),
	en_linea: z.boolean(),
	externos: z.boolean(),
	categoria_mayoreo_id: z.uuid(),
	recargo_centavos: z.coerce.number(),
	tipo_prenda_id: z.uuid().nullable(),
	flujo_id: z.uuid().nullable(),
});

/** Una talla del producto como la lee la base. */
const varianteLeida = z.object({
	id: z.uuid(),
	talla: z.string(),
	codigo: z.string(),
	es_pedido_especial: z.boolean(),
	descontinuada: z.boolean(),
	baja_en: z.string().nullable(),
	baja_por: z.string().nullable(),
	motivo_baja: z.string().nullable(),
	existencia: z.coerce.number().nullable(),
});

/** Los tipos de lista. */
const tipoDeLista = z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]);

/**
 * La receta de un producto y su resumen: la tela principal con sus metros por prenda en la talla de en medio de sus
 * tallas normales, cuántos avíos y la versión vigente.
 * @param contexto El de la consulta.
 * @param productoId El producto.
 */
async function recetaDe({ base }: ContextoDeConsulta, productoId: string) {
	const [receta] = await filas(
		base,
		sql`SELECT r.estado, rv.id AS version_id, rv.numero AS version FROM recetas r
			LEFT JOIN receta_versiones rv ON rv.id = r.version_vigente_id WHERE r.producto_id = ${productoId}`,
		z.object({
			estado: z.enum(["sin_receta", "sin_verificar", "verificada"]),
			version_id: z.uuid().nullable(),
			version: z.number().nullable(),
		}),
	);
	if (receta?.version_id == null) {
		return {
			estado: receta?.estado ?? ("sin_receta" as const),
			version: null,
			tela: null,
			metros: null,
			talla: null,
			avios: 0,
		};
	}
	const [tela] = await filas(
		base,
		sql`WITH medio AS (
				SELECT t.id, t.nombre FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
				WHERE v.producto_id = ${productoId} AND v.baja_en IS NULL AND NOT v.es_pedido_especial
				ORDER BY g.orden, t.orden
				OFFSET (SELECT (count(*) - 1) / 2 FROM variantes v WHERE v.producto_id = ${productoId} AND v.baja_en IS NULL
				  AND NOT v.es_pedido_especial) LIMIT 1)
			SELECT m.nombre AS tela, medio.nombre AS talla,
			  coalesce(l.cantidad, (SELECT lt.cantidad FROM receta_linea_tallas lt WHERE lt.receta_linea_id = l.id
			    AND lt.talla_id = medio.id))::text AS metros,
			  (SELECT count(*) FROM receta_lineas a WHERE a.receta_version_id = l.receta_version_id AND a.papel = 'avio')::int AS avios
			FROM receta_lineas l JOIN materiales m ON m.id = l.material_id LEFT JOIN medio ON true
			WHERE l.receta_version_id = ${receta.version_id} AND l.papel = 'tela_principal'`,
		z.object({ tela: z.string(), talla: z.string().nullable(), metros: z.string().nullable(), avios: z.number() }),
	);
	return {
		estado: receta.estado,
		version: receta.version,
		tela: tela?.tela ?? null,
		metros: tela?.metros === null || tela?.metros === undefined ? null : String(Number(tela.metros)),
		talla: tela?.talla ?? null,
		avios: tela?.avios ?? 0,
	};
}

/**
 * Las medidas de la prenda: las de la versión vigente de su receta o, mientras no tenga, las de su tipo de prenda.
 * @param contexto El de la consulta.
 * @param producto El producto.
 */
async function medidasDe({ base }: ContextoDeConsulta, producto: z.infer<typeof productoLeido>) {
	const deLaReceta = await filas(
		base,
		sql`SELECT m.medida, t.nombre AS talla, m.valor_cm FROM recetas r JOIN receta_medidas m ON m.receta_version_id = r.version_vigente_id
			JOIN tallas t ON t.id = m.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
			WHERE r.producto_id = ${producto.id} ORDER BY m.orden, g.orden, t.orden`,
		z.object({ medida: z.string(), talla: z.string(), valor_cm: z.coerce.number() }),
	);
	const leidas =
		deLaReceta.length > 0
			? deLaReceta
			: await filas(
					base,
					sql`SELECT m.medida, t.nombre AS talla, m.valor_cm FROM tipo_prenda_medidas m JOIN tallas t ON t.id = m.talla_id
						JOIN grupos_talla g ON g.id = t.grupo_talla_id
						WHERE m.tipo_prenda_id = ${producto.tipo_prenda_id}::uuid AND m.baja_en IS NULL AND m.valor_cm IS NOT NULL
						ORDER BY m.orden, g.orden, t.orden`,
					z.object({ medida: z.string(), talla: z.string(), valor_cm: z.coerce.number() }),
				);
	const nombres = [...new Set(leidas.map((medida) => medida.medida))];
	return nombres.map((medida) => ({
		medida,
		valores: leidas.filter((una) => una.medida === medida).map(({ talla, valor_cm }) => ({ talla, valor_cm })),
	}));
}

export const consultaFichaProducto = implementarConsulta(fichaDeProducto, async (contexto, parametros) => {
	const { base, quien } = contexto;
	const id = parametros.producto_id;
	const [producto] = await filas(
		base,
		sql`SELECT p.id, p.version, p.nombre, s.id AS seccion_id, s.nombre AS seccion, s.lleva_receta, e.id AS escuela_id,
			e.nombre AS escuela, p.es_servicio, p.baja_en IS NOT NULL AS descontinuado, p.foto_archivo_id,
			p.canal_mostrador AS mostrador, p.canal_en_linea AS en_linea, p.canal_externos AS externos, p.categoria_mayoreo_id,
			p.recargo_pedido_especial_centavos AS recargo_centavos, p.tipo_prenda_id, p.flujo_id
			FROM productos p JOIN secciones s ON s.id = p.seccion_id LEFT JOIN escuelas e ON e.id = p.escuela_id
			WHERE p.id = ${id}`,
		productoLeido,
	);
	if (producto === undefined) throw noExiste();
	const [detiene] = await filas(base, loQueDetieneA(sql`p.id = ${id}`), formaDeLoQueDetiene);
	const listas = await filas(
		base,
		sql`SELECT l.id, l.tipo, l.nombre,
			EXISTS (SELECT 1 FROM precios pr WHERE pr.lista_id = l.id AND pr.producto_id = ${id} AND pr.vigente_hasta IS NULL) AS con_precio
			FROM listas_precios l WHERE l.baja_en IS NULL ORDER BY l.tipo = 'cliente', l.orden, l.nombre`,
		z.object({ id: z.uuid(), tipo: tipoDeLista, nombre: z.string(), con_precio: z.boolean() }),
	);
	const precios = await filas(
		base,
		sql`SELECT lista_id, variante_id, precio_centavos::int FROM precios WHERE producto_id = ${id} AND vigente_hasta IS NULL`,
		z.object({ lista_id: z.uuid(), variante_id: z.uuid().nullable(), precio_centavos: z.number() }),
	);
	const variantes = await filas(
		base,
		sql`SELECT v.id, t.nombre AS talla, v.codigo, v.es_pedido_especial, v.descontinuada_en IS NOT NULL AS descontinuada,
			v.baja_en::text, coalesce(pe.nombre, u.nombre, u.correo) AS baja_por, v.motivo_baja,
			(SELECT sum(e.piezas) FROM existencias e WHERE e.variante_id = v.id) AS existencia
			FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
			LEFT JOIN usuarios u ON u.id = v.baja_por LEFT JOIN personas pe ON pe.id = u.persona_id
			WHERE v.producto_id = ${id} ORDER BY g.orden, t.orden, v.baja_en NULLS LAST`,
		varianteLeida,
	);
	const paraAgregar = await filas(
		base,
		sql`SELECT t.id AS talla_id, t.nombre AS talla, g.nombre AS grupo,
			EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = ${id} AND v.talla_id = t.id AND v.baja_en IS NOT NULL) AS tuvo_baja
			FROM tallas t JOIN grupos_talla g ON g.id = t.grupo_talla_id
			WHERE t.baja_en IS NULL AND g.id IN (SELECT t2.grupo_talla_id FROM variantes v JOIN tallas t2 ON t2.id = v.talla_id
			  WHERE v.producto_id = ${id})
			  AND NOT EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = ${id} AND v.talla_id = t.id AND v.baja_en IS NULL)
			ORDER BY g.orden, t.orden`,
		z.object({ talla_id: z.uuid(), talla: z.string(), grupo: z.string(), tuvo_baja: z.boolean() }),
	);
	const cambios = await filas(
		base,
		sql`SELECT b.ocurrido_en::text AS ocurrido_en, coalesce(pe.nombre, u.nombre, u.correo, 'El sistema') AS quien,
			b.descripcion FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
			LEFT JOIN personas pe ON pe.id = coalesce(b.persona_id, u.persona_id)
			WHERE b.entidad = 'productos' AND b.entidad_id = ${id} AND b.tipo = 'cambio'
			ORDER BY b.ocurrido_en DESC, b.id DESC LIMIT 5`,
		z.object({ ocurrido_en: z.string(), quien: z.string(), descripcion: z.string() }),
	);
	const conReceta = producto.lleva_receta && !producto.es_servicio;
	const veTodo = quien.tipo === "cuenta" && quien.esDuena;
	return {
		resultado: {
			producto: {
				id: producto.id,
				version: producto.version,
				nombre: producto.nombre,
				seccion: { id: producto.seccion_id, nombre: producto.seccion, lleva_receta: producto.lleva_receta },
				escuela: producto.escuela_id === null ? null : { id: producto.escuela_id, nombre: producto.escuela ?? "" },
				es_servicio: producto.es_servicio,
				descontinuado: producto.descontinuado,
				foto_archivo_id: producto.foto_archivo_id,
				canales: { mostrador: producto.mostrador, en_linea: producto.en_linea, externos: producto.externos },
				categoria_mayoreo_id: producto.categoria_mayoreo_id,
				recargo_centavos: producto.recargo_centavos,
				tipo_prenda_id: producto.tipo_prenda_id,
				flujo_id: producto.flujo_id,
			},
			detiene: detiene === undefined ? [] : detieneDe(detiene),
			categorias: await filas(
				base,
				sql`SELECT id, nombre, descripcion FROM categorias_mayoreo WHERE baja_en IS NULL ORDER BY orden`,
				z.object({ id: z.uuid(), nombre: z.string(), descripcion: z.string() }),
			),
			flujos: await filas(
				base,
				sql`SELECT id, nombre FROM flujos WHERE baja_en IS NULL ORDER BY nombre`,
				z.object({ id: z.uuid(), nombre: z.string() }),
			),
			listas: listas
				.filter((lista) => lista.tipo !== "cliente" || lista.con_precio)
				.map(({ id: listaId, tipo, nombre }) => ({ id: listaId, tipo, nombre })),
			otras_listas: listas
				.filter((lista) => lista.tipo === "cliente" && !lista.con_precio)
				.map(({ id: listaId, nombre }) => ({ id: listaId, nombre })),
			precios,
			variantes: variantes.map((variante) => ({
				id: variante.id,
				talla: variante.talla,
				codigo: variante.codigo,
				es_pedido_especial: variante.es_pedido_especial,
				estado:
					variante.baja_en !== null
						? ("baja" as const)
						: variante.descontinuada
							? ("descontinuada" as const)
							: ("activa" as const),
				existencia: variante.existencia,
				baja:
					variante.baja_en === null
						? null
						: {
								en: new Date(variante.baja_en).toISOString(),
								por: variante.baja_por ?? "",
								motivo: variante.motivo_baja ?? "",
							},
			})),
			pocas_piezas: await parametroNumero(base, "catalogo.pocas_piezas"),
			aviso_cambio_precio_pct: await parametroNumero(base, "catalogo.aviso_cambio_precio_pct"),
			agregar: { tallas: paraAgregar, siguiente_codigo: await siguienteCodigo(contexto) },
			receta: conReceta ? await recetaDe(contexto, id) : null,
			medidas: conReceta ? await medidasDe(contexto, producto) : [],
			cambios: cambios.map((cambio) => ({ ...cambio, ocurrido_en: new Date(cambio.ocurrido_en).toISOString() })),
			puede_patronaje: veTodo || (quien.tipo === "cuenta" && quien.departamentos.includes("patronaje")),
		},
	};
});
