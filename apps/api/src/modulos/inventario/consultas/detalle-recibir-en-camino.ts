/**
 * `inventario.detalle_recibir_en_camino`: el cajón Recibir lo que viene en camino. Lo que mandó Bodega (o una tienda)
 * con su versión y lo que mandó por renglón; la devolución de un cliente, con el catálogo de defectos; o un reproceso
 * aprobado, que se cuenta a ciegas: ni lo aprobado ni renglones.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Recibir lo que viene en camino) y
 * docs/modulos/inventario/recepcion-del-taller.md (regla 3)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { detalleRecibirEnCamino } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { cuantoViene, destinoDelLote, destinoEnCamino, leerEnCamino, queViene, quienLoManda } from "./aduana-comun.ts";
import { metrosEscritos } from "./bodega-comun.ts";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleRecibirEnCamino.resultado>;

/** Lo que regresa `calidad.reproceso_para_aduana`, sin lo aprobado: no se lee. */
const reprocesoParaAduana = z
	.object({ reproceso_id: z.uuid(), folio: z.string(), lote_id: z.uuid(), variante_id: z.uuid() })
	.passthrough()
	.nullable();

/**
 * Lo que viene en camino o la devolución de un cliente.
 * @param contexto El contexto de la lectura.
 * @param traspasoId El traspaso.
 * @throws `404` si no viene en camino ni se espera.
 */
async function delTraspaso(contexto: ContextoDeAccion, traspasoId: string): Promise<Detalle> {
	const [fila] = await leerEnCamino(contexto, { traspasoId });
	if (fila === undefined) throw noExiste();
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT t.version, l.id AS traspaso_linea_id, coalesce(p.nombre || ' talla ' || ta.nombre, m.nombre) AS prenda,
			l.material_id IS NOT NULL AS es_material, coalesce(l.piezas_enviadas::text, l.cantidad_enviada::text) AS mandaron
		FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
		LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas ta ON ta.id = v.talla_id LEFT JOIN materiales m ON m.id = l.material_id
		WHERE t.id = ${traspasoId}::uuid ORDER BY l.renglon`);
	const renglones = z
		.array(
			z.object({
				version: z.coerce.number(),
				traspaso_linea_id: z.uuid(),
				prenda: z.string(),
				es_material: z.boolean(),
				mandaron: z.string(),
			}),
		)
		.parse(rows);
	const esDevolucion = fila.estado === "esperado";
	const { rows: filasDeDefectos } = esDevolucion
		? await contexto.transaccion.execute(sql`SELECT id AS defecto_id, nombre FROM defectos ORDER BY nombre`)
		: { rows: [] };
	return {
		tipo: esDevolucion ? "devolucion" : "camino",
		id: fila.id,
		version: renglones[0]?.version ?? null,
		folio: fila.folio,
		de: quienLoManda(fila),
		que: queViene(fila),
		mandaron: cuantoViene(fila),
		salio: fila.enviado_dia === null ? "—" : textoDeDiaCorto(fila.enviado_dia),
		va_a: destinoEnCamino(fila).destino,
		recibido: false,
		renglones: renglones.map(({ traspaso_linea_id, prenda, es_material, mandaron }) => ({
			traspaso_linea_id,
			prenda,
			es_material,
			mandaron: es_material ? metrosEscritos(mandaron) : mandaron,
		})),
		defectos: z.array(z.object({ defecto_id: z.uuid(), nombre: z.string() })).parse(filasDeDefectos),
	};
}

/**
 * Un reproceso aprobado: su folio, la prenda y la talla, de Calidad, y a dónde va; a ciegas.
 * @param contexto El contexto de la lectura.
 * @param reprocesoId El reproceso.
 * @throws `404` si no existe.
 */
async function delReproceso(contexto: ContextoDeAccion, reprocesoId: string): Promise<Detalle> {
	const reproceso = reprocesoParaAduana.parse(
		await contexto.lectura("calidad.reproceso_para_aduana", { reproceso_id: reprocesoId }),
	);
	if (reproceso === null) throw noExiste();
	const { lote, vaA } = await destinoDelLote(contexto, reproceso.lote_id);
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT t.nombre AS talla,
			EXISTS (SELECT 1 FROM recepciones r WHERE r.reproceso_id = ${reprocesoId}::uuid) AS recibido
		FROM variantes v JOIN tallas t ON t.id = v.talla_id WHERE v.id = ${reproceso.variante_id}::uuid`);
	const { talla, recibido } = z.object({ talla: z.string(), recibido: z.boolean() }).parse(rows[0]);
	return {
		tipo: "reproceso",
		id: reproceso.reproceso_id,
		version: null,
		folio: reproceso.folio,
		de: "Calidad",
		que: `${reproceso.folio} · ${lote.prenda} talla ${talla}`,
		mandaron: "",
		salio: "—",
		va_a: vaA,
		recibido,
		renglones: [],
		defectos: [],
	};
}

export const consultaDetalleRecibirEnCamino = implementarConsulta(
	detalleRecibirEnCamino,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			if (parametros.reproceso_id !== undefined) return delReproceso(accion, parametros.reproceso_id);
			if (parametros.traspaso_id !== undefined) return delTraspaso(accion, parametros.traspaso_id);
			throw noExiste();
		}),
	}),
);
