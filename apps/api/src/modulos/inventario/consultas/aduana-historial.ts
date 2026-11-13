/**
 * `inventario.aduana_historial`: todo lo que entró y salió de aduana, lo más reciente primero, por páginas. Entró: lo
 * recibido del taller, lo que venía en camino, las órdenes de compra y las devoluciones de los clientes. Salió: los
 * despachos, las notas entregadas, lo que confirmó Bodega, lo que regresó al proveedor y la merma de Calidad.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Historial»)
 *
 * Cada renglón sale de su papel (la recepción, el despacho o el movimiento), que nunca cambia: el texto se arma aquí.
 */

import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { historialDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { cursorDe, desdeDelCursor } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { piezasEscritas } from "./aduana-comun.ts";
import { metrosEscritos } from "./bodega-comun.ts";

/** Cuántos renglones por página, si no se pide otro número. */
const limitePorOmision = 50;

/** Un renglón como sale de la base: su clase y sus datos, sin el texto. */
const delRenglon = z.object({
	momento: z.string(),
	clave: z.string(),
	clase: z.enum([
		"del_taller",
		"de_camino",
		"de_proveedor",
		"devolucion",
		"despacho",
		"entrega",
		"bodega",
		"al_proveedor",
		"merma",
	]),
	referencia: z.string(),
	quien: z.string().nullable(),
	piezas: z.coerce.number().nullable(),
	otras: z.coerce.number().nullable(),
	cantidad: z.coerce.number().nullable(),
	rollos: z.coerce.number().nullable(),
	unidad: z.string().nullable(),
	material: z.string().nullable(),
	nombre: z.string().nullable(),
});

/** Lo que entró (verde) y lo que salió (ámbar) de aduana. */
const movimientos = {
	entro: { texto: "Entró", color: "verde" },
	salio: { texto: "Salió", color: "ambar" },
} satisfies Record<string, z.infer<typeof historialDeAduana.resultado>["renglones"][number]["movimiento"]>;

/** Un renglón leído. */
type Renglon = z.infer<typeof delRenglon>;

/**
 * El texto de un renglón del historial (la tabla de «Historial»).
 * @param renglon El renglón leído.
 */
function queDice(renglon: Renglon): string {
	const piezas = renglon.piezas ?? 0;
	const otras = renglon.otras ?? 0;
	const cantidad = metrosEscritos(renglon.cantidad ?? 0);
	switch (renglon.clase) {
		case "del_taller":
			return `Del taller: ${piezasEscritas(piezas)}, revisadas por calidad`;
		case "de_camino":
			return `De ${renglon.quien ?? ""}: ${piezasEscritas(piezas)}${otras === 0 ? "" : ` · ${otras} de diferencia`}`;
		case "de_proveedor":
			return (renglon.rollos ?? 0) > 0
				? `${renglon.quien ?? ""}: ${cantidad} m en ${plural(renglon.rollos ?? 0, "rollo", "rollos")}`
				: `${renglon.quien ?? ""}: ${cantidad} ${renglon.unidad ?? ""}`;
		case "devolucion":
			return `Devolución de ${renglon.quien ?? ""}: ${piezasEscritas(piezas)}, ${otras} con defecto`;
		case "despacho":
			return `A ${renglon.quien ?? ""}: ${piezas > 0 ? piezasEscritas(piezas) : `${cantidad} ${renglon.unidad ?? ""}`}`;
		case "entrega":
			return `Entregada a ${renglon.quien ?? ""}: ${piezasEscritas(piezas)}, recibió ${renglon.nombre ?? ""}`;
		case "bodega":
			if (piezas === 0 && otras === 0) return "Bodega confirmó el material";
			return piezas === otras
				? `Bodega confirmó ${piezasEscritas(piezas)}`
				: `Bodega recibió ${piezas} de ${piezasEscritas(otras)}`;
		case "al_proveedor":
			return `Regresó a ${renglon.quien ?? ""}: ${cantidad} ${renglon.unidad ?? ""} de ${renglon.material ?? ""}`;
		case "merma":
			return `Merma: ${piezasEscritas(piezas)} · ${renglon.nombre ?? ""}`;
	}
}

export const consultaHistorialDeAduana = implementarConsulta(historialDeAduana, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const desde = desdeDelCursor(parametros.cursor);
		const limite = parametros.limite ?? limitePorOmision;
		const { rows } = await accion.transaccion.execute(sql`
		WITH contado AS (
			SELECT rl.recepcion_id, sum(rl.piezas_contadas) AS piezas, sum(rl.piezas_esperadas) AS esperadas,
				sum(rl.cantidad_contada) AS cantidad, count(rl.rollo_id) AS rollos,
				sum(CASE WHEN rl.con_defecto THEN rl.piezas_contadas ELSE 0 END) AS con_defecto,
				sum(abs(coalesce(rl.diferencia_piezas, 0))) AS diferencia, min(m.unidad) AS unidad
			FROM recepcion_lineas rl LEFT JOIN materiales m ON m.id = rl.material_id GROUP BY rl.recepcion_id
		), renglones AS (
			SELECT r.recibido_en AS momento, r.id::text AS clave,
				CASE r.tipo WHEN 'aduana_del_taller' THEN 'del_taller' WHEN 'aduana_de_camino' THEN 'de_camino'
					WHEN 'aduana_de_proveedor' THEN 'de_proveedor' ELSE 'devolucion' END AS clase,
				coalesce(rp.folio, lo.folio, oc.folio, t.folio) AS referencia,
				coalesce(tp.nombre, uo.nombre, tcl.nombre) AS quien,
				c.piezas, CASE WHEN r.tipo = 'aduana_devolucion' THEN c.con_defecto ELSE c.diferencia END AS otras,
				c.cantidad, c.rollos, c.unidad, NULL::text AS material, NULL::text AS nombre
			FROM recepciones r JOIN contado c ON c.recepcion_id = r.id
			LEFT JOIN reprocesos rp ON rp.id = r.reproceso_id LEFT JOIN lotes lo ON lo.id = r.lote_id
			LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
			LEFT JOIN proveedores pr ON pr.id = oc.proveedor_id LEFT JOIN terceros tp ON tp.id = pr.tercero_id
			LEFT JOIN traspasos t ON t.id = r.traspaso_id LEFT JOIN ubicaciones uo ON uo.id = t.origen_ubicacion_id
			LEFT JOIN notas_credito nc ON nc.id = t.nota_credito_id
			LEFT JOIN clientes cl ON cl.id = nc.cliente_id LEFT JOIN terceros tcl ON tcl.id = cl.tercero_id
			WHERE r.tipo IN ('aduana_del_taller', 'aduana_de_camino', 'aduana_de_proveedor', 'aduana_devolucion')
			UNION ALL
			SELECT d.despachado_en, d.id::text, 'despacho', d.folio, coalesce(u.nombre, tc.nombre),
				(SELECT sum(coalesce(l.piezas_recibidas_aduana, 0) - l.piezas_repartidas) FROM traspasos tr
					JOIN traspaso_lineas l ON l.traspaso_id = tr.id WHERE tr.despacho_id = d.id AND l.variante_id IS NOT NULL),
				NULL,
				(SELECT sum(coalesce(l.cantidad_recibida_aduana, 0) - l.cantidad_repartida) FROM traspasos tr
					JOIN traspaso_lineas l ON l.traspaso_id = tr.id WHERE tr.despacho_id = d.id AND l.material_id IS NOT NULL),
				NULL, (SELECT min(m.unidad) FROM traspasos tr JOIN traspaso_lineas l ON l.traspaso_id = tr.id
					JOIN materiales m ON m.id = l.material_id WHERE tr.despacho_id = d.id), NULL, NULL
			FROM despachos d LEFT JOIN ubicaciones u ON u.id = d.destino_ubicacion_id
			LEFT JOIN notas_entrega nv ON nv.id = d.nota_entrega_id
			LEFT JOIN clientes c ON c.id = coalesce(d.cliente_id, nv.cliente_id)
			LEFT JOIN terceros tc ON tc.id = c.tercero_id
			UNION ALL
			SELECT r.recibido_en, r.id::text, 'entrega', coalesce(nv.folio, d.folio), tc.nombre, c.piezas, NULL, NULL, NULL,
				NULL, NULL, coalesce(nv.recibio_nombre, d.recibio_nombre)
			FROM recepciones r JOIN contado c ON c.recepcion_id = r.id JOIN despachos d ON d.id = r.despacho_id
			LEFT JOIN notas_entrega nv ON nv.id = d.nota_entrega_id
			LEFT JOIN clientes cl ON cl.id = coalesce(d.cliente_id, nv.cliente_id) LEFT JOIN terceros tc ON tc.id = cl.tercero_id
			WHERE r.tipo = 'entrega_cliente'
			UNION ALL
			SELECT r.recibido_en, r.id::text, 'bodega', d.folio, NULL, c.piezas, c.esperadas, NULL, NULL, NULL, NULL, NULL
			FROM recepciones r JOIN contado c ON c.recepcion_id = r.id JOIN despachos d ON d.id = r.despacho_id
			JOIN ubicaciones u ON u.id = r.ubicacion_id AND u.tipo = 'bodega'
			WHERE r.tipo = 'destino_despacho'
			UNION ALL
			SELECT mv.ocurrido_en, mv.id::text, CASE mv.tipo WHEN 'devolucion_proveedor' THEN 'al_proveedor' ELSE 'merma' END,
				coalesce(oc.folio, mv.documento_folio, ''), tp.nombre,
				(SELECT sum(ml.piezas) FROM movimiento_lineas ml WHERE ml.movimiento_id = mv.id), NULL,
				(SELECT sum(ml.cantidad) FROM movimiento_lineas ml WHERE ml.movimiento_id = mv.id), NULL,
				(SELECT min(m.unidad) FROM movimiento_lineas ml JOIN materiales m ON m.id = ml.material_id
					WHERE ml.movimiento_id = mv.id),
				(SELECT min(m.nombre) FROM movimiento_lineas ml JOIN materiales m ON m.id = ml.material_id
					WHERE ml.movimiento_id = mv.id),
				mv.nota
			FROM movimientos mv
			LEFT JOIN LATERAL (SELECT tr.orden_compra_id FROM movimiento_lineas ml JOIN traspasos tr ON tr.id = ml.traspaso_id
				WHERE ml.movimiento_id = mv.id LIMIT 1) x ON true
			LEFT JOIN ordenes_compra oc ON oc.id = x.orden_compra_id
			LEFT JOIN proveedores pr ON pr.id = oc.proveedor_id LEFT JOIN terceros tp ON tp.id = pr.tercero_id
			WHERE mv.tipo IN ('devolucion_proveedor', 'merma_calidad')
		)
		SELECT momento::text AS momento, clave, clase, referencia, quien, piezas, otras, cantidad, rollos, unidad,
			material, nombre
		FROM renglones ORDER BY renglones.momento DESC, clave DESC LIMIT ${limite + 1} OFFSET ${desde}`);
		const renglones = z.array(delRenglon).parse(rows);
		const pagina = renglones.slice(0, limite);
		return {
			renglones: pagina.map((renglon) => {
				const entro = ["del_taller", "de_camino", "de_proveedor", "devolucion"].includes(renglon.clase);
				return {
					clave: renglon.clave,
					fecha: textoDeMomentoCorto(renglon.momento),
					movimiento: entro ? movimientos.entro : movimientos.salio,
					referencia: renglon.referencia,
					que: queDice(renglon),
				};
			}),
			cursor: renglones.length > limite ? cursorDe({ desde: desde + limite }) : null,
			hay_mas: renglones.length > limite,
		};
	}),
}));
