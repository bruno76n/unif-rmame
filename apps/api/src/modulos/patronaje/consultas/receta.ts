/**
 * `patronaje.receta`: la página de la receta de una prenda. Lo que se captura (la versión vigente, o la que se pida, o
 * en una receta nueva su tela y su avío), los materiales que puede llevar con la unidad en que se capturan y su
 * conversión, el próximo corte con sus piezas por talla y el desperdicio de la prenda (los insumos de la cuenta de
 * material que la pantalla corre mientras se escribe), el patrón contra el corte y sus versiones con sus lotes. Sin
 * dinero.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («La página de la receta») y docs/modulos/patronaje/recetas.md
 * (reglas 3, 5 y 6)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural, rangoDeTallas } from "@uniformame/compartido/calculos/textos";
import { recetaDeLaPrenda } from "@uniformame/compartido/contratos/patronaje/receta";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { listaDeUnidades } from "../../compras/siembra.ts";
import { type ContenidoDeVersion, contenidoDeVersion } from "../dominio/recetas.ts";
import { unidadParaCapturar } from "../dominio/unidades.ts";
import {
	cuandoSeCorta,
	estadosDeReceta,
	leerDesarrollos,
	leerParametros,
	leerPrendas,
	nombresDeEtapa,
	type PrendaLeida,
	piezasDelLote,
	sinEscuela,
	tallaDeEnMedio,
	textoDePorciento,
} from "./comun.ts";
import { patronContraCorte } from "./rendimiento.ts";

/** Un material como sale de la base. */
const deMaterial = z.object({
	material_id: z.uuid(),
	nombre: z.string(),
	tipo: z.enum(["tela", "avio", "consumible"]),
	presentacion: z.string().nullable(),
	unidad: z.string(),
	unidad_receta: z.string().nullable(),
	factor_receta: z.string().nullable(),
	se_cuenta_entera: z.boolean(),
});

/**
 * La unidad en que se captura un material y su conversión, con la regla de `dominio/unidades.ts`.
 * @param material El material.
 * @returns La unidad y la conversión, o nada si no se captura en `m`, `cm` ni `pza`.
 */
function unidadDeCaptura(
	material: z.infer<typeof deMaterial>,
): { unidad_captura: "m" | "cm" | "pza"; receta_por_unidad_inventario: string } | undefined {
	const captura = unidadParaCapturar({
		unidad: material.unidad,
		unidadReceta: material.unidad_receta,
		factorReceta: material.factor_receta,
	});
	return captura === undefined
		? undefined
		: { unidad_captura: captura.unidad, receta_por_unidad_inventario: captura.conversion };
}

/**
 * Los materiales que puede llevar la receta (los vivos que se capturan en `m`, `cm` o `pza`) y los de la versión que
 * se ve, aunque estén dados de baja.
 * @param contexto El contexto de la consulta.
 * @param versionId La versión que se ve.
 */
async function materialesDisponibles(contexto: ContextoDeConsulta, versionId: string | null) {
	const { rows } = await contexto.base.execute(sql`
		SELECT m.id AS material_id, m.nombre, m.tipo, m.presentacion, m.unidad, m.unidad_receta,
			m.factor_receta::text AS factor_receta, coalesce(v.se_cuenta_entera, false) AS se_cuenta_entera
		FROM materiales m JOIN listas li ON li.clave = ${listaDeUnidades}
		LEFT JOIN lista_valores v ON v.lista_id = li.id AND v.clave = m.unidad
		WHERE m.baja_en IS NULL
			OR EXISTS (SELECT 1 FROM receta_lineas l WHERE l.material_id = m.id AND l.receta_version_id = ${versionId})
		ORDER BY m.nombre`);
	return z
		.array(deMaterial)
		.parse(rows)
		.flatMap((material) => {
			const captura = unidadDeCaptura(material);
			if (captura === undefined) return [];
			return [
				{
					material_id: material.material_id,
					nombre: material.nombre,
					tipo: material.tipo,
					detalle: material.presentacion?.split(" · ")[0] ?? "",
					unidad: material.unidad,
					...captura,
					se_cuenta_entera: material.se_cuenta_entera,
				},
			];
		});
}

/**
 * Lee la versión que se ve: la que se pide por su número, o la vigente.
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 * @param numero El número que se pide.
 * @throws `404` si la prenda no tiene esa versión.
 */
async function versionQueSeVe(contexto: ContextoDeConsulta, prenda: PrendaLeida, numero: number | undefined) {
	if (numero === undefined) return prenda.version_vigente_id;
	const { rows } = await contexto.base.execute(sql`
		SELECT id FROM receta_versiones WHERE receta_id = ${prenda.receta_id} AND numero = ${numero}`);
	const [version] = z.array(z.object({ id: z.uuid() })).parse(rows);
	if (version === undefined) throw noExiste();
	return version.id;
}

/**
 * Lo que guarda una versión, con la lectura del dominio, en una transacción que solo lee.
 * @param contexto El contexto de la consulta.
 * @param versionId La versión.
 */
function leerContenido(contexto: ContextoDeConsulta, versionId: string): Promise<ContenidoDeVersion> {
	return contexto.base.transaction((transaccion) => contenidoDeVersion(transaccion, versionId), {
		accessMode: "read only",
	});
}

/**
 * Las medidas del tipo de prenda de una prenda, para cuando la prenda no tiene medidas propias (regla 3).
 * @param contexto El contexto de la consulta.
 * @param productoId La prenda.
 */
async function medidasDelTipo(contexto: ContextoDeConsulta, productoId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT m.medida, m.talla_id, m.valor_cm::text AS valor_cm
		FROM productos p JOIN tipo_prenda_medidas m ON m.tipo_prenda_id = p.tipo_prenda_id
		WHERE p.id = ${productoId} AND m.baja_en IS NULL AND m.valor_cm IS NOT NULL ORDER BY m.orden`);
	const medidas = new Map<string, { talla_id: string; valor_cm: string }[]>();
	for (const fila of z.array(z.object({ medida: z.string(), talla_id: z.uuid(), valor_cm: z.string() })).parse(rows)) {
		medidas.set(fila.medida, [
			...(medidas.get(fila.medida) ?? []),
			{ talla_id: fila.talla_id, valor_cm: fila.valor_cm },
		]);
	}
	return [...medidas].map(([medida, valores]) => ({ medida, valores }));
}

/**
 * Con qué empieza una receta nueva: la tela de su desarrollo o, si no viene de uno, la tela principal que más llevan
 * las recetas de su sección (o de todas); y el avío que más llevan las recetas vigentes.
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 * @param telaDelDesarrollo La tela de la solicitud, si la prenda salió de un desarrollo.
 */
async function lineasDeUnaRecetaNueva(contexto: ContextoDeConsulta, prenda: PrendaLeida, telaDelDesarrollo?: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.papel, l.material_id, (p.seccion_id = ${prenda.seccion_id}) AS de_su_seccion, count(*)::int AS veces
		FROM recetas r JOIN receta_lineas l ON l.receta_version_id = r.version_vigente_id
		JOIN productos p ON p.id = r.producto_id JOIN materiales m ON m.id = l.material_id
		WHERE m.baja_en IS NULL AND l.papel IN ('tela_principal', 'avio')
		GROUP BY l.papel, l.material_id, 3
		ORDER BY de_su_seccion DESC, veces DESC, l.material_id`);
	const usados = z
		.array(z.object({ papel: z.string(), material_id: z.uuid(), de_su_seccion: z.boolean(), veces: z.number() }))
		.parse(rows);
	const tela = telaDelDesarrollo ?? usados.find((uso) => uso.papel === "tela_principal")?.material_id;
	const veces = new Map<string, number>();
	for (const uso of usados.filter((uno) => uno.papel === "avio")) {
		veces.set(uso.material_id, (veces.get(uso.material_id) ?? 0) + uso.veces);
	}
	const [avio] = [...veces].sort(([, una], [, otra]) => otra - una).map(([materialId]) => materialId);
	return [
		...(tela === undefined
			? []
			: [
					{
						papel: "tela_principal" as const,
						material_id: tela,
						modo: "por_talla" as const,
						unidad_receta: "m" as const,
						cantidad: null,
						tallas: [],
						receta_por_unidad_inventario: "1.000",
					},
				]),
		...(avio === undefined
			? []
			: [
					{
						papel: "avio" as const,
						material_id: avio,
						modo: "igual" as const,
						unidad_receta: "pza" as const,
						cantidad: null,
						tallas: [],
						receta_por_unidad_inventario: "1.000",
					},
				]),
	];
}

/**
 * Las versiones de la receta, de la más nueva a la más vieja, con quién y cuándo, y los lotes cortados con cada una.
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 */
async function versiones(contexto: ContextoDeConsulta, prenda: PrendaLeida) {
	const { rows } = await contexto.base.execute(sql`
		SELECT v.id, v.numero, v.motivo, (v.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS fecha,
			coalesce(u.nombre, pe.nombre, '') AS persona,
			coalesce((SELECT array_agg(l.folio ORDER BY l.folio) FROM lotes l
				WHERE l.receta_version_id = v.id AND l.cortado_en IS NOT NULL), '{}') AS lotes
		FROM receta_versiones v LEFT JOIN usuarios u ON u.id = v.creado_por LEFT JOIN personas pe ON pe.id = u.persona_id
		WHERE v.receta_id = ${prenda.receta_id} ORDER BY v.numero DESC`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				numero: z.number(),
				motivo: z.string(),
				fecha: z.string(),
				persona: z.string(),
				lotes: z.array(z.string()),
			}),
		)
		.parse(rows)
		.map((version) => ({
			numero: version.numero,
			vigente: version.id === prenda.version_vigente_id,
			fecha: textoDeDiaCorto(version.fecha),
			persona: version.persona,
			motivo: version.motivo,
			lotes: version.lotes,
		}));
}

export const consultaReceta = implementarConsulta(recetaDeLaPrenda, async (contexto, parametros) => {
	const [prenda] = await leerPrendas(contexto, parametros.producto_id);
	if (prenda === undefined) throw noExiste();
	const ajustes = await leerParametros(contexto);
	const versionId = await versionQueSeVe(contexto, prenda, parametros.version_numero);
	const contenido = versionId === null ? undefined : await leerContenido(contexto, versionId);
	const desarrollo = (await leerDesarrollos(contexto)).find((uno) => uno.producto_id === prenda.producto_id);
	const materiales = await materialesDisponibles(contexto, versionId);
	const desperdicio = prenda.desperdicio;
	const pct = desperdicio?.desperdicio_pct ?? ajustes.desperdicioEstimado.toFixed(3);
	const corte = prenda.corte;
	const medidas =
		contenido === undefined || contenido.medidas.length === 0
			? await medidasDelTipo(contexto, prenda.producto_id)
			: contenido.medidas.map((medida) => ({
					medida: medida.medida,
					valores: medida.valores.map((valor) => ({ talla_id: valor.tallaId, valor_cm: valor.valorCm })),
				}));
	// La tela principal primero; luego las de combinación o forro y los avíos, cada uno en su orden.
	const lineas =
		contenido === undefined
			? await lineasDeUnaRecetaNueva(
					contexto,
					prenda,
					desarrollo === undefined
						? undefined
						: materiales.find((material) => material.tipo === "tela" && material.nombre === desarrollo.tela)
								?.material_id,
				)
			: [...contenido.lineas]
					.sort(
						(una, otra) =>
							(una.papel === "tela_principal" ? 0 : una.papel === "avio" ? 2 : 1) -
								(otra.papel === "tela_principal" ? 0 : otra.papel === "avio" ? 2 : 1) || una.orden - otra.orden,
					)
					.map((linea) => ({
						papel: z.enum(["tela_principal", "combinacion", "forro", "avio"]).parse(linea.papel),
						material_id: linea.materialId,
						modo: z.enum(["igual", "por_talla"]).parse(linea.modo),
						unidad_receta: z.enum(["m", "cm", "pza"]).parse(linea.unidadReceta),
						cantidad: linea.cantidad,
						tallas: linea.tallas.map((talla) => ({ talla_id: talla.tallaId, cantidad: talla.cantidad })),
						receta_por_unidad_inventario: linea.recetaPorUnidadInventario,
					}));
	return {
		resultado: {
			producto_id: prenda.producto_id,
			receta_id: prenda.receta_id,
			prenda: prenda.nombre,
			subtitulo: `${prenda.escuela ?? sinEscuela} · tallas ${rangoDeTallas(prenda.tallas.map((talla) => ({ grupo: talla.grupo, talla: talla.nombre })))}`,
			estado: estadosDeReceta[prenda.estado],
			version: prenda.version,
			vigente: prenda.vigente,
			viendo: parametros.version_numero ?? null,
			tallas: prenda.tallas,
			talla_base_id: tallaDeEnMedio(prenda.tallas)?.talla_id ?? null,
			proximo_corte:
				corte === null
					? null
					: {
							texto: `${cuandoSeCorta(contexto, corte.fecha_corte).texto} · ${corte.folio}, ${piezasDelLote(corte)} piezas`,
							lote: corte.folio,
							piezas: piezasDelLote(corte),
							piezas_por_talla: corte.tallas.map((talla) => ({
								talla_id: talla.talla_id,
								piezas: talla.piezas_planeadas,
							})),
						},
			desperdicio: {
				pct,
				texto:
					desperdicio === null
						? `${textoDePorciento(pct)} estimado, sin medir en corte`
						: `${textoDePorciento(pct)} sobre el patrón, ${plural(desperdicio.lotes, "lote", "lotes")}`,
				para_cortar: `con ${Math.round(Number(pct))}% de desperdicio${desperdicio === null ? ", estimado" : ""}`,
			},
			desarrollo:
				desarrollo === undefined
					? null
					: { desarrollo_id: desarrollo.id, texto: `${desarrollo.folio} · ${nombresDeEtapa[desarrollo.etapa]}` },
			medidas,
			lineas,
			materiales,
			patron_contra_corte: await patronContraCorte(contexto, prenda, ajustes),
			versiones: await versiones(contexto, prenda),
		},
	};
});
