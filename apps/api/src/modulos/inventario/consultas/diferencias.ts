/**
 * `inventario.diferencias`: la pestaña Diferencias de Bodega. Las por contar (con «Contada · en autorización» si ya se
 * contó), las de recepción por aclarar con quién recibió y su espejo para «Venía en otro», las de material con si
 * siguen en negativo, la lista «Motivos de ajuste» y las resueltas por páginas, con cómo se resolvió cada una.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Diferencias») y docs/modulos/inventario/diferencias-ajustes-y-mermas.md
 * («Cómo se aclara una de recepción»)
 *
 * El lugar que recibió es Aduana en un tramo en camino a aduana y en la del taller, y el destino del traspaso en un
 * tramo en tránsito. El espejo es otra DF- por aclarar de la misma prenda y talla, con las mismas piezas al revés.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { diferenciasDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { listaDeMotivosAjuste } from "../siembra.ts";

/** Cuántas resueltas van en una página, si no se dice. */
const limitePorOmision = 25;

/** Cómo se dice cada aclaración en «Cómo se resolvió». */
const aclaracionEscrita: Readonly<Record<string, string>> = {
	llego: "Llegó",
	no_salio: "No salió",
	venia_en_otro: "Venía en otro",
	perdida: "Se perdió",
	ajuste: "Ajuste",
	aclarada: "Ya se cubrió",
};

/** Una diferencia por aclarar como sale de la base. */
const dePorAclarar = z.object({
	id: z.uuid(),
	folio: z.string(),
	version: z.coerce.number(),
	variante_id: z.uuid().nullable(),
	piezas: z.coerce.number().nullable(),
	prenda: z.string().nullable(),
	material: z.string().nullable(),
	descripcion: z.string(),
	a_cargo: z.string(),
	recibio: z.string(),
	negativa: z.boolean(),
});

/**
 * Las diferencias por aclarar, de recepción y de material, cada una con su espejo.
 * @param contexto El contexto de la lectura.
 */
async function porAclarar(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT f.id, f.folio, f.version, f.variante_id, f.piezas, p.nombre || ' · talla ' || t.nombre AS prenda,
			m.nombre AS material, f.descripcion, ac.nombre AS a_cargo,
			'Recibió ' || CASE WHEN hu.tipo = 'transito' THEN coalesce(de.nombre, 'el cliente') ELSE 'Aduana' END AS recibio,
			coalesce(em.cantidad < 0, false) AS negativa
		FROM diferencias f JOIN ubicaciones ac ON ac.id = f.a_cargo_ubicacion_id JOIN ubicaciones hu ON hu.id = f.ubicacion_id
		LEFT JOIN traspasos tr ON tr.id = f.traspaso_id LEFT JOIN ubicaciones de ON de.id = tr.destino_ubicacion_id
		LEFT JOIN variantes v ON v.id = f.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = f.material_id
		LEFT JOIN existencias_material em ON em.ubicacion_id = f.ubicacion_id AND em.material_id = f.material_id
			AND em.rollo_id IS NOT DISTINCT FROM f.rollo_id
		WHERE f.estado = 'por_aclarar' ORDER BY f.creado_en, f.folio`);
	const filas = z.array(dePorAclarar).parse(rows);
	return filas.map((fila) => ({
		diferencia_id: fila.id,
		folio: fila.folio,
		version: fila.version,
		es_material: fila.variante_id === null,
		prenda: fila.prenda ?? fila.material ?? "",
		descripcion: fila.descripcion,
		a_cargo: fila.a_cargo,
		recibio: fila.recibio,
		espejos: filas
			.filter(
				(otra) =>
					otra.id !== fila.id &&
					fila.variante_id !== null &&
					otra.variante_id === fila.variante_id &&
					otra.piezas === -(fila.piezas ?? 0),
			)
			.map((otra) => ({ diferencia_id: otra.id, folio: otra.folio, descripcion: otra.descripcion })),
		sigue_en_negativo: fila.negativa,
	}));
}

/** Una resuelta como sale de la base. */
const deLaResuelta = z.object({
	id: z.uuid(),
	folio: z.string(),
	en: z.string(),
	prenda: z.string(),
	ubicacion: z.string(),
	ajuste: z.string().nullable(),
	conteo: z.string().nullable(),
	aclaracion: z.string().nullable(),
	motivo_resolucion: z.string().nullable(),
});

/**
 * Cómo se resolvió una diferencia: el folio de su ajuste, o la aclaración (o el conteo) con su motivo.
 * @param fila La resuelta.
 */
function comoSeResolvio(fila: z.infer<typeof deLaResuelta>): string {
	if (fila.ajuste !== null) return fila.ajuste;
	const como = fila.aclaracion === null ? fila.conteo : (aclaracionEscrita[fila.aclaracion] ?? null);
	return [como, fila.motivo_resolucion].filter((parte) => parte !== null).join(" · ");
}

/**
 * Las resueltas, de la más reciente, por páginas.
 * @param contexto El contexto de la lectura.
 * @param cursor Dónde sigue la página.
 * @param limite Cuántas.
 */
async function resueltas(contexto: ContextoDeAccion, cursor: string | undefined, limite: number) {
	const posicion = leerCursor(cursor);
	const despues =
		posicion === undefined
			? sql``
			: sql`AND (f.resuelta_en, f.folio) < (${String(posicion.en)}::timestamptz, ${String(posicion.folio)})`;
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT f.id, f.folio, f.resuelta_en::text AS en, coalesce(p.nombre || ' · talla ' || t.nombre, m.nombre, '') AS prenda,
			u.nombre AS ubicacion, aj.folio AS ajuste, cn.folio AS conteo, f.aclaracion, f.motivo_resolucion
		FROM diferencias f JOIN ubicaciones u ON u.id = f.ubicacion_id
		LEFT JOIN variantes v ON v.id = f.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = f.material_id
		LEFT JOIN ajustes aj ON aj.id = f.ajuste_id LEFT JOIN conteos cn ON cn.id = f.conteo_id
		WHERE f.estado = 'resuelta' ${despues} ORDER BY f.resuelta_en DESC, f.folio DESC LIMIT ${limite + 1}`);
	const pagina = paginar(z.array(deLaResuelta).parse(rows), limite, (fila) => ({ en: fila.en, folio: fila.folio }));
	return {
		...pagina,
		renglones: pagina.renglones.map((fila) => ({
			diferencia_id: fila.id,
			folio: fila.folio,
			prenda: fila.prenda,
			ubicacion: fila.ubicacion,
			como: comoSeResolvio(fila),
		})),
	};
}

/** Una por contar como sale de la base. */
const dePorContar = z.object({
	diferencia_id: z.uuid(),
	folio: z.string(),
	fecha: z.string(),
	piezas: z.coerce.number(),
	prenda: z.string(),
	talla: z.string(),
	descripcion: z.string(),
	ubicacion: z.string(),
	contada: z.boolean(),
});

/** Lo que regresa `admin.valores_de_lista`. */
const valoresDeLaLista = z.object({ valores: z.array(z.object({ id: z.uuid(), nombre: z.string() })) });

export const consultaDiferencias = implementarConsulta(diferenciasDeBodega, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { rows: filasPorContar } = await accion.transaccion.execute(sql`
			SELECT f.id AS diferencia_id, f.folio, (f.creado_en AT TIME ZONE ${zonaDelNegocio}::text)::date::text AS fecha,
				abs(f.piezas) AS piezas, p.nombre AS prenda, t.nombre AS talla, f.descripcion, u.nombre AS ubicacion,
				f.estado = 'esperando_autorizacion' AS contada
			FROM diferencias f JOIN ubicaciones u ON u.id = f.ubicacion_id JOIN variantes v ON v.id = f.variante_id
			JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			WHERE f.estado = 'por_contar' OR (f.estado = 'esperando_autorizacion' AND f.conteo_id IS NOT NULL)
			ORDER BY f.creado_en, f.folio`);
		const { valores: motivos } = valoresDeLaLista.parse(
			await accion.lectura("admin.valores_de_lista", { lista: listaDeMotivosAjuste, solo_seleccionables: true }),
		);
		const abiertas = await porAclarar(accion);
		return {
			por_contar: z.array(dePorContar).parse(filasPorContar),
			de_recepcion: abiertas.filter((diferencia) => !diferencia.es_material),
			material: abiertas.filter((diferencia) => diferencia.es_material),
			motivos_ajuste: motivos,
			resueltas: await resueltas(accion, parametros.cursor, parametros.limite ?? limitePorOmision),
		};
	}),
}));
