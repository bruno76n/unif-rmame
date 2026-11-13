/**
 * `inventario.detalle_conteo`: lo que necesitan los cajones Nuevo conteo, Conteo de diferencia y Carga inicial. Las
 * ubicaciones donde cuenta la cuenta (Bodega o Aduana; una cuenta de Aduana, solo Aduana), las secciones, las prendas,
 * la lista «Motivos de ajuste» y las variantes que se cuentan: las de una sección, una prenda o todas; o solo la de una
 * diferencia por contar, en su ubicación. En la carga inicial, cuáles ya tienen movimientos en la ubicación.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Nuevo conteo, Conteo de diferencia y Carga inicial) y
 * docs/modulos/inventario/conteos.md (regla 1)
 *
 * El conteo es ciego: nunca manda lo que tiene el sistema.
 */

import { detalleDeConteo } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import { listaDeMotivosAjuste } from "../siembra.ts";

/** Un nombre con su id. */
const deNombre = z.array(z.object({ id: z.uuid(), nombre: z.string() }));

/** Una diferencia por contar. */
const deLaDiferencia = z.object({
	folio: z.string(),
	estado: z.string(),
	ubicacion_id: z.uuid(),
	ubicacion: z.string(),
	variante_id: z.uuid().nullable(),
});

/** Una variante que se cuenta. */
const deLaVariante = z.object({
	variante_id: z.uuid(),
	prenda: z.string(),
	talla: z.string(),
	escuela: z.string(),
	con_movimientos: z.boolean(),
});

/** Lo que regresa `admin.valores_de_lista`. */
const valoresDeLaLista = z.object({ valores: z.array(z.object({ id: z.uuid(), nombre: z.string() })) });

export const consultaDetalleDeConteo = implementarConsulta(detalleDeConteo, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { quien } = contexto;
		const conBodega = tieneDepartamento(quien, "bodega");
		const { rows: ubicaciones } = await accion.transaccion.execute(sql`
			SELECT id, nombre FROM ubicaciones
			WHERE tipo = 'aduana' ${conBodega ? sql`OR tipo = 'bodega'` : sql``} ORDER BY orden`);
		const { rows: secciones } = await accion.transaccion.execute(sql`SELECT id, nombre FROM secciones ORDER BY orden`);
		const { rows: productos } = await accion.transaccion.execute(sql`
			SELECT id, nombre FROM productos WHERE baja_en IS NULL AND NOT es_servicio ORDER BY nombre`);
		const { valores: motivos } = valoresDeLaLista.parse(
			await accion.lectura("admin.valores_de_lista", { lista: listaDeMotivosAjuste, solo_seleccionables: true }),
		);
		// El de una diferencia: solo su variante, en la ubicación de la diferencia.
		let diferencia: z.infer<typeof deLaDiferencia> | undefined;
		if (parametros.diferencia_id !== undefined) {
			const { rows } = await accion.transaccion.execute(sql`
				SELECT f.folio, f.estado, f.ubicacion_id, u.nombre AS ubicacion, f.variante_id
				FROM diferencias f JOIN ubicaciones u ON u.id = f.ubicacion_id WHERE f.id = ${parametros.diferencia_id}::uuid`);
			diferencia = z.array(deLaDiferencia).parse(rows)[0];
			if (diferencia === undefined || diferencia.estado !== "por_contar" || diferencia.variante_id === null) {
				throw errorDeRegla("no_por_contar", `${diferencia?.folio ?? "Esa diferencia"} ya no está por contar.`);
			}
		}
		const ubicacionId = diferencia?.ubicacion_id ?? parametros.ubicacion_id;
		const filtro =
			diferencia !== undefined
				? sql`v.id = ${diferencia.variante_id}::uuid`
				: parametros.producto_id !== undefined
					? sql`p.id = ${parametros.producto_id}::uuid`
					: parametros.seccion_id !== undefined
						? sql`p.seccion_id = ${parametros.seccion_id}::uuid`
						: parametros.carga_inicial === true
							? sql`true`
							: sql`false`;
		const { rows: variantes } = await accion.transaccion.execute(sql`
			SELECT v.id AS variante_id, p.nombre AS prenda, t.nombre AS talla, coalesce(es.nombre, 'Básico') AS escuela,
				${
					ubicacionId === undefined || parametros.carga_inicial !== true
						? sql`false`
						: sql`EXISTS (SELECT 1 FROM movimiento_lineas ml WHERE ml.variante_id = v.id
							AND (ml.origen_ubicacion_id = ${ubicacionId}::uuid OR ml.destino_ubicacion_id = ${ubicacionId}::uuid))`
				} AS con_movimientos
			FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			LEFT JOIN escuelas es ON es.id = p.escuela_id
			WHERE ${filtro} AND v.baja_en IS NULL AND NOT v.es_pedido_especial AND p.baja_en IS NULL AND NOT p.es_servicio
			ORDER BY p.nombre, ${ordenDeTallas("t")}`);
		return {
			ubicaciones: deNombre.parse(ubicaciones),
			secciones: deNombre.parse(secciones),
			productos: deNombre.parse(productos),
			motivos_ajuste: deNombre.parse(motivos),
			diferencia:
				diferencia === undefined
					? null
					: { folio: diferencia.folio, ubicacion_id: diferencia.ubicacion_id, ubicacion: diferencia.ubicacion },
			variantes: z.array(deLaVariante).parse(variantes),
		};
	}),
}));
