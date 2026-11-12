/**
 * `produccion.corte`: la pestaña Corte. A la izquierda, los lotes por cortar por fecha de corte, con la etiqueta de su
 * tela y la de su receta; a la derecha, la captura del lote escogido con todo lo que la pantalla necesita para correr,
 * mientras se escribe, las cuentas del paquete compartido (`pideLaReceta`, `rollosAutomaticos`, `usoDeLaTela`) con los
 * mismos insumos que usa `produccion.cerrar_corte` al cerrar: la receta vigente de cada tela, el desperdicio de la
 * prenda (`patronaje.calcular_material`), los rollos que se pueden usar en el orden en que conviene y lo que tiene cada
 * uno. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Corte») y docs/modulos/produccion/corte-y-bultos.md (reglas 3 a 6 y 12)
 *
 * Los rollos que se pueden usar son los entregados a este lote (en el Taller) y los libres en Bodega (disponibles y sin
 * entregar a otro lote); van primero los entregados, luego los sugeridos para este lote y luego los demás por partida
 * y del más chico al más grande, como los sugiere Bodega (docs/modulos/inventario/entregas-a-corte.md, regla 1).
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { capturaDeCorte } from "@uniformame/compartido/contratos/produccion/captura-corte";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	deCalcularMaterial,
	diasHasta,
	escribirParaQuien,
	type LoteLeido,
	leerLotes,
	parametroNumero,
	piezasPorTallaDelLote,
} from "./comun.ts";

/** El orden de las telas de una receta: la principal, la combinación y el forro. */
const ordenDePapel: Readonly<Record<string, number>> = { tela_principal: 0, combinacion: 1, forro: 2 };

/** Un decimal de la base sin ceros de más a la izquierda, como lo espera la cuenta («92.000»). */
const deDecimal = z.string();

/**
 * Las telas que ya recibió cada lote: las de sus rollos entregados o usados.
 * @param contexto El contexto de la consulta.
 */
async function telasRecibidas(contexto: ContextoDeConsulta): Promise<Map<string, Set<string>>> {
	const { rows } = await contexto.base.execute(sql`
		SELECT DISTINCT a.lote_id, r.material_id FROM apartados_rollo a JOIN rollos r ON r.id = a.rollo_id
		WHERE a.estado IN ('entregado', 'usado')`);
	const recibidas = new Map<string, Set<string>>();
	for (const fila of z.array(z.object({ lote_id: z.uuid(), material_id: z.uuid() })).parse(rows)) {
		recibidas.set(fila.lote_id, (recibidas.get(fila.lote_id) ?? new Set()).add(fila.material_id));
	}
	return recibidas;
}

/**
 * Las telas de la receta vigente de cada prenda: su material, su papel, su nombre y lo que lleva por prenda.
 * @param contexto El contexto de la consulta.
 * @param versionIds Las versiones de receta.
 */
async function telasDeLasRecetas(contexto: ContextoDeConsulta, versionIds: readonly string[]) {
	if (versionIds.length === 0) return [];
	const { rows } = await contexto.base.execute(sql`
		SELECT rl.id, rl.receta_version_id, rl.material_id, rl.papel, m.nombre, rl.cantidad::text AS cantidad,
			rl.receta_por_unidad_inventario::text AS receta_por_unidad_inventario,
			coalesce((SELECT json_agg(json_build_object('talla_id', t.talla_id, 'cantidad', t.cantidad::text))
				FROM receta_linea_tallas t WHERE t.receta_linea_id = rl.id), '[]') AS por_talla
		FROM receta_lineas rl JOIN materiales m ON m.id = rl.material_id
		WHERE rl.receta_version_id IN (${sql.join(
			versionIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)}) AND rl.papel IN ('tela_principal', 'combinacion', 'forro')
		ORDER BY rl.orden`);
	return z
		.array(
			z.object({
				receta_version_id: z.uuid(),
				material_id: z.uuid(),
				papel: z.enum(["tela_principal", "combinacion", "forro"]),
				nombre: z.string(),
				cantidad: deDecimal.nullable(),
				receta_por_unidad_inventario: deDecimal,
				por_talla: z.array(z.object({ talla_id: z.uuid(), cantidad: deDecimal })),
			}),
		)
		.parse(rows)
		.sort((una, otra) => (ordenDePapel[una.papel] ?? 0) - (ordenDePapel[otra.papel] ?? 0));
}

/**
 * La etiqueta de la tela de un lote: «Tela entregada» cuando ya están todas las telas de su receta; si no, «Tela por
 * entregar», roja a `produccion.tela_por_entregar_rojo_dias` o menos del corte, ámbar desde
 * `inventario.dias_entrega_corte`, y más lejos gris (en la lista no sale).
 */
function etiquetaDeTela(
	completa: boolean,
	dias: number,
	plazos: { rojo: number; ambar: number },
): { texto: string; color: "verde" | "rojo" | "ambar" | "gris" } {
	if (completa) return { texto: "Tela entregada", color: "verde" };
	const color = dias <= plazos.rojo ? "rojo" : dias <= plazos.ambar ? "ambar" : "gris";
	return { texto: "Tela por entregar", color };
}

/**
 * Los rollos que se pueden usar para cada tela del lote, en el orden en que conviene usarlos.
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 * @param materialIds Sus telas.
 */
async function rollosParaLaCaptura(contexto: ContextoDeConsulta, loteId: string, materialIds: readonly string[]) {
	if (materialIds.length === 0) return [];
	const { rows } = await contexto.base.execute(sql`
		WITH taller AS (SELECT id FROM ubicaciones WHERE tipo = 'taller'),
			bodega AS (SELECT id FROM ubicaciones WHERE tipo = 'bodega'),
			entregados AS (SELECT rollo_id, lote_id FROM apartados_rollo WHERE estado = 'entregado')
		SELECT r.id AS rollo_id, r.folio, r.material_id, pt.folio AS partida,
			CASE WHEN e.lote_id IS NOT NULL THEN et.cantidad ELSE eb.cantidad END::text AS metros,
			e.lote_id IS NOT NULL AS entregado,
			EXISTS (SELECT 1 FROM apartados_rollo s WHERE s.rollo_id = r.id AND s.lote_id = ${loteId}
				AND s.estado = 'sugerido') AS sugerido
		FROM rollos r LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
		LEFT JOIN entregados e ON e.rollo_id = r.id
		LEFT JOIN existencias_material et ON et.rollo_id = r.id AND et.ubicacion_id = (SELECT id FROM taller)
		LEFT JOIN existencias_material eb ON eb.rollo_id = r.id AND eb.ubicacion_id = (SELECT id FROM bodega)
		WHERE r.material_id IN (${sql.join(
			materialIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})
			AND ((e.lote_id = ${loteId} AND r.estado = 'entregado' AND et.cantidad > 0)
				OR (e.lote_id IS NULL AND r.estado = 'disponible' AND eb.cantidad > 0))
		ORDER BY (e.lote_id IS NOT NULL) DESC, sugerido DESC, pt.folio NULLS LAST,
			CASE WHEN e.lote_id IS NOT NULL THEN et.cantidad ELSE eb.cantidad END, r.folio`);
	return z
		.array(
			z.object({
				rollo_id: z.uuid(),
				folio: z.string(),
				material_id: z.uuid(),
				partida: z.string().nullable(),
				metros: deDecimal,
				entregado: z.boolean(),
				sugerido: z.boolean(),
			}),
		)
		.parse(rows);
}

/**
 * Las personas activas del Taller; primero quien hace de base el corte en el flujo de la prenda.
 * @param contexto El contexto de la consulta.
 * @param productoId La prenda.
 */
async function quienesCortan(contexto: ContextoDeConsulta, productoId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT p.id AS persona_id, p.nombre,
			EXISTS (SELECT 1 FROM productos pr JOIN flujo_operaciones f ON f.flujo_id = pr.flujo_id AND f.baja_en IS NULL
				JOIN operaciones o ON o.id = f.operacion_id AND o.es_corte
				WHERE pr.id = ${productoId} AND f.persona_base_id = p.id) AS de_base
		FROM personas p WHERE p.area = 'taller' AND p.baja_en IS NULL
		ORDER BY 3 DESC, p.nombre`);
	return z
		.array(z.object({ persona_id: z.uuid(), nombre: z.string(), de_base: z.boolean() }))
		.parse(rows)
		.map(({ persona_id, nombre }) => ({ persona_id, nombre }));
}

/**
 * El aviso de una entrega con otra versión de la receta: «Bodega entregó tela para la versión {v} de la receta y se
 * corta con la {w}».
 * @param contexto El contexto de la consulta.
 * @param lote El lote.
 */
async function avisoDeVersion(contexto: ContextoDeConsulta, lote: LoteLeido): Promise<string | null> {
	if (lote.receta_version_id === null) return null;
	const { rows } = await contexto.base.execute(sql`
		SELECT ve.numero AS entregada, vv.numero AS vigente FROM entregas_corte ec
		JOIN receta_versiones ve ON ve.id = ec.receta_version_id
		JOIN receta_versiones vv ON vv.id = ${lote.receta_version_id}
		WHERE ec.lote_id = ${lote.id} AND ec.estado = 'entregada' AND ec.receta_version_id <> ${lote.receta_version_id}
		LIMIT 1`);
	const otra = z.object({ entregada: z.number(), vigente: z.number() }).optional().parse(rows[0]);
	return otra === undefined
		? null
		: `Bodega entregó tela para la versión ${otra.entregada} de la receta y se corta con la ${otra.vigente}`;
}

export const consultaCorte = implementarConsulta(capturaDeCorte, async (contexto, parametros) => {
	const hoy = contexto.diaDeNegocio;
	const lotes = (await leerLotes(contexto, sql`l.estado = 'por_cortar'`)).sort(
		(uno, otro) => uno.fecha_corte.localeCompare(otro.fecha_corte) || uno.folio.localeCompare(otro.folio),
	);
	const plazos = {
		rojo: await parametroNumero(contexto, "produccion.tela_por_entregar_rojo_dias"),
		ambar: await parametroNumero(contexto, "inventario.dias_entrega_corte"),
	};
	const recibidas = await telasRecibidas(contexto);
	const telas = await telasDeLasRecetas(contexto, [
		...new Set(lotes.flatMap((lote) => (lote.receta_version_id === null ? [] : [lote.receta_version_id]))),
	]);
	// La tela de cada lote está completa cuando recibió todas las telas de su receta.
	const etiqueta = (lote: LoteLeido) => {
		const suyas = telas.filter((tela) => tela.receta_version_id === lote.receta_version_id);
		const completa = suyas.length > 0 && suyas.every((tela) => recibidas.get(lote.id)?.has(tela.material_id) === true);
		return etiquetaDeTela(completa, diasHasta(hoy, lote.fecha_corte), plazos);
	};
	const escogido = parametros.lote_id === undefined ? lotes[0] : lotes.find((lote) => lote.id === parametros.lote_id);
	if (parametros.lote_id !== undefined && escogido === undefined) throw noExiste();
	return {
		resultado: {
			lotes: lotes.map((lote) => {
				const suya = etiqueta(lote);
				return {
					lote_id: lote.id,
					folio: lote.folio,
					fecha_corte: textoDeDiaCorto(lote.fecha_corte),
					corte_pronto: diasHasta(hoy, lote.fecha_corte) <= plazos.ambar,
					prenda: lote.prenda,
					detalle: `${lote.planeadas} piezas · ${escribirParaQuien(lote).nombre}`,
					tela: suya.color === "gris" ? null : suya,
					receta: lote.receta,
				};
			}),
			captura:
				escogido === undefined
					? null
					: await laCaptura(contexto, escogido, {
							telas: telas.filter((tela) => tela.receta_version_id === escogido.receta_version_id),
							etiqueta: etiqueta(escogido),
						}),
		},
	};
});

/**
 * La captura de un lote: su encabezado, su receta por tela, sus rollos, sus tallas y quién corta.
 * @param contexto El contexto de la consulta.
 * @param lote El lote escogido.
 * @param deLaLista Sus telas de la receta y la etiqueta de su tela.
 */
async function laCaptura(
	contexto: ContextoDeConsulta,
	lote: LoteLeido,
	deLaLista: {
		telas: Awaited<ReturnType<typeof telasDeLasRecetas>>;
		etiqueta: { texto: string; color: "verde" | "rojo" | "ambar" | "gris" };
	},
) {
	const { rows: version } = await contexto.base.execute(sql`SELECT version FROM lotes WHERE id = ${lote.id}`);
	const { rows: tallas } = await contexto.base.execute(sql`
		SELECT t.variante_id, v.talla_id, ta.nombre AS talla, t.piezas_planeadas AS planeadas
		FROM lote_tallas t JOIN variantes v ON v.id = t.variante_id JOIN tallas ta ON ta.id = v.talla_id
		WHERE t.lote_id = ${lote.id} AND t.piezas_planeadas > 0 ORDER BY ta.orden`);
	const material = deCalcularMaterial.parse(
		await contexto.lectura("patronaje.calcular_material", {
			producto_id: lote.producto_id,
			piezas_por_talla: await piezasPorTallaDelLote(contexto, lote.id, "planeadas"),
		}),
	);
	const rollos = await rollosParaLaCaptura(
		contexto,
		lote.id,
		deLaLista.telas.map((tela) => tela.material_id),
	);
	return {
		lote_id: lote.id,
		version: z.object({ version: z.coerce.number() }).parse(version[0]).version,
		folio: lote.folio,
		orden: lote.orden,
		prenda: lote.prenda,
		producto_id: lote.producto_id,
		para: escribirParaQuien(lote),
		fecha_corte: textoDeDiaCorto(lote.fecha_corte),
		tela: deLaLista.etiqueta,
		receta: lote.receta,
		receta_version_id: material.receta_version_id,
		aviso_version: await avisoDeVersion(contexto, lote),
		desperdicio_pct: material.desperdicio_pct,
		frontera: String(await contexto.lectura("admin.parametro", { clave: "inventario.metros_frontera_rollo" })),
		rendimiento_rojo: await parametroNumero(contexto, "produccion.rendimiento_rojo_porcentaje"),
		tallas: z
			.array(z.object({ variante_id: z.uuid(), talla_id: z.uuid(), talla: z.string(), planeadas: z.number() }))
			.parse(tallas),
		telas: deLaLista.telas.map((tela) => ({
			material_id: tela.material_id,
			nombre: tela.nombre,
			papel: tela.papel,
			receta: {
				cantidad: tela.cantidad,
				por_talla: tela.por_talla,
				receta_por_unidad_inventario: tela.receta_por_unidad_inventario,
			},
			rollos: rollos
				.filter((rollo) => rollo.material_id === tela.material_id)
				.map(({ material_id: _material, ...rollo }) => rollo),
		})),
		personas: await quienesCortan(contexto, lote.producto_id),
	};
}
