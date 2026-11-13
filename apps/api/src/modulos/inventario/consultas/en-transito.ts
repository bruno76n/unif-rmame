/**
 * `inventario.en_transito`: los despachos que su destino no ha confirmado, el más nuevo primero, por páginas. Cada uno
 * con quién debe confirmar (Bodega, la encargada de la tienda o el cliente, y sus recordatorios), cuánto lleva sin
 * confirmar y su botón: «Confirmar entrega» en una nota de entrega o en una tienda sin caja, «Recordar» en lo demás.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («En tránsito») y docs/modulos/inventario/surtido-y-despachos.md (reglas 6
 * y 9)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { enTransito } from "@uniformame/compartido/contratos/inventario/aduana";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { cursorDe, desdeDelCursor } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { diasDesde, materialEscrito, parametrosDeAduana, piezasEscritas, sinConfirmar } from "./aduana-comun.ts";

/** Un renglón de la consulta. */
type Renglon = z.infer<typeof enTransito.resultado>["renglones"][number];

/** Cuántos renglones por página, si no se pide otro número. */
const limitePorOmision = 50;

/** Un despacho como se lee. */
const delDespacho = z.object({
	id: z.uuid(),
	folio: z.string(),
	version: z.coerce.number(),
	recordatorios: z.coerce.number(),
	salio_dia: z.string(),
	destino: z.string().nullable(),
	destino_tipo: z.string().nullable(),
	sin_caja: z.boolean().nullable(),
	cliente: z.string().nullable(),
	nota_id: z.uuid().nullable(),
	nota: z.string().nullable(),
	nota_version: z.coerce.number().nullable(),
});

/** Un renglón de un despacho como se lee. */
const delRenglon = z.object({
	despacho_id: z.uuid(),
	traspaso_linea_id: z.uuid(),
	prenda: z.string().nullable(),
	material: z.string().nullable(),
	unidad: z.string().nullable(),
	piezas: z.coerce.number().nullable(),
	cantidad: z.coerce.number().nullable(),
});

export const consultaEnTransito = implementarConsulta(enTransito, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const desde = desdeDelCursor(parametros.cursor);
		const limite = parametros.limite ?? limitePorOmision;
		const { rows } = await accion.transaccion.execute(sql`
			SELECT d.id, d.folio, d.version, d.recordatorios,
				(d.despachado_en AT TIME ZONE 'America/Mexico_City')::date::text AS salio_dia,
				u.nombre AS destino, u.tipo AS destino_tipo, (u.tipo = 'tienda' AND u.existencia_desde IS NULL) AS sin_caja,
				tc.nombre AS cliente, nv.id AS nota_id, nv.folio AS nota, nv.version AS nota_version
			FROM despachos d LEFT JOIN ubicaciones u ON u.id = d.destino_ubicacion_id
			LEFT JOIN notas_entrega nv ON nv.id = d.nota_entrega_id
			LEFT JOIN clientes c ON c.id = coalesce(d.cliente_id, nv.cliente_id)
			LEFT JOIN terceros tc ON tc.id = c.tercero_id
			WHERE d.estado = 'en_transito' ORDER BY d.despachado_en DESC, d.id DESC
			LIMIT ${limite + 1} OFFSET ${desde}`);
		const despachos = z.array(delDespacho).parse(rows);
		const pagina = despachos.slice(0, limite);
		const ids = pagina.map((despacho) => sql`${despacho.id}::uuid`);
		const { rows: filas } =
			ids.length === 0
				? { rows: [] }
				: await accion.transaccion.execute(sql`
			SELECT tr.despacho_id, l.id AS traspaso_linea_id, p.nombre || ' talla ' || t.nombre AS prenda,
				m.nombre AS material, m.unidad,
				coalesce(l.piezas_recibidas_aduana, 0) - l.piezas_repartidas AS piezas,
				coalesce(l.cantidad_recibida_aduana, 0) - l.cantidad_repartida AS cantidad
			FROM traspasos tr JOIN traspaso_lineas l ON l.traspaso_id = tr.id
			LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
			LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = l.material_id
			WHERE tr.despacho_id IN (${sql.join(ids, sql`, `)}) ORDER BY tr.folio, l.renglon`);
		const renglones = z.array(delRenglon).parse(filas);
		const { diasSinConfirmarRojo } = await parametrosDeAduana(accion);
		return {
			renglones: pagina.map((despacho) => {
				const suyos = renglones.filter((renglon) => renglon.despacho_id === despacho.id);
				const prendas = suyos.filter((renglon) => renglon.prenda !== null);
				const piezas = prendas.reduce((suma, renglon) => suma + (renglon.piezas ?? 0), 0);
				const materiales = suyos.flatMap((renglon) =>
					renglon.material === null
						? []
						: [{ nombre: renglon.material, unidad: renglon.unidad ?? "", cantidad: renglon.cantidad ?? 0 }],
				);
				const nombres = [
					...new Set(suyos.map((renglon) => (renglon.prenda ?? renglon.material ?? "").replace(/ talla .*$/, ""))),
				];
				const esCliente = despacho.nota_id !== null || despacho.destino === null;
				const destino = esCliente ? (despacho.cliente ?? "el cliente") : (despacho.destino ?? "");
				const confirma =
					despacho.destino_tipo === "bodega"
						? "Bodega"
						: despacho.destino_tipo === "tienda"
							? `Encargada de ${destino}`
							: destino;
				const tiendaSinCaja = despacho.destino_tipo === "tienda" && despacho.sin_caja === true;
				const boton: Renglon["boton"] = esCliente ? "confirmar_nota" : tiendaSinCaja ? "confirmar_tienda" : "recordar";
				return {
					despacho_id: despacho.id,
					folio: despacho.folio,
					version: despacho.version,
					salio: textoDeDiaCorto(despacho.salio_dia),
					que: nombres.join(", "),
					a: `A ${destino}`,
					cantidad: prendas.length === 0 ? materialEscrito(materiales) : piezasEscritas(piezas),
					debe_confirmar:
						despacho.recordatorios === 0
							? confirma
							: `${confirma} · ${plural(despacho.recordatorios, "recordatorio", "recordatorios")}`,
					sin_confirmar: sinConfirmar(diasDesde(accion.diaDeNegocio, despacho.salio_dia), diasSinConfirmarRojo),
					boton,
					tienda: tiendaSinCaja ? destino : null,
					nota:
						despacho.nota_id === null
							? null
							: {
									nota_id: despacho.nota_id,
									folio: despacho.nota ?? "",
									version: despacho.nota_version ?? 0,
									cliente: destino,
									piezas,
								},
					renglones: prendas.map((renglon) => ({
						traspaso_linea_id: renglon.traspaso_linea_id,
						prenda: renglon.prenda ?? "",
						piezas: renglon.piezas ?? 0,
					})),
				};
			}),
			cursor: despachos.length > limite ? cursorDe({ desde: desde + limite }) : null,
			hay_mas: despachos.length > limite,
		};
	}),
}));
