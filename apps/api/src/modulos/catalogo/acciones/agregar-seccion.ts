/**
 * `catalogo.agregar_seccion`: la dueña agrega una sección del catálogo, al final del orden.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md (reglas 5 y 6, «`catalogo.agregar_seccion`»)
 *
 * La pantalla es de Administración; el renglón lo escribe Catálogo. Las secciones no se renombran ni se
 * quitan en la primera versión.
 */

import { agregarSeccion } from "@uniformame/compartido/contratos/catalogo/escuelas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { secciones, tiposPrenda } from "../tablas.ts";

export const accionAgregarSeccion = implementarAccion(agregarSeccion, async (contexto, datos) => {
	const { transaccion } = contexto;
	if (datos.tipo_prenda_defecto_id !== undefined) {
		const [tipo] = await transaccion
			.select({ id: tiposPrenda.id })
			.from(tiposPrenda)
			.where(and(eq(tiposPrenda.id, datos.tipo_prenda_defecto_id), isNull(tiposPrenda.bajaEn)));
		if (tipo === undefined) throw errorDeCampo("tipo_prenda_defecto_id", "Escoge un tipo de prenda activo.");
	}
	// Al final del orden: dos a la vez esperan una a la otra.
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext('catalogo.orden_de_secciones'))`);
	const id = uuidv7();
	const [agregada] = await transaccion
		.insert(secciones)
		.values({
			id,
			nombre: datos.nombre,
			orden: sql`(SELECT coalesce(max(orden), 0) + 1 FROM secciones)`,
			llevaReceta: datos.lleva_receta ?? true,
			tipoPrendaDefectoId: datos.tipo_prenda_defecto_id ?? null,
			creadoPor: quienCambia(contexto),
		})
		.onConflictDoNothing()
		.returning({ id: secciones.id });
	if (agregada === undefined) throw errorDeRegla("seccion_repetida", "Ya está en la lista.");
	contexto.bitacora({
		descripcion: `Sección nueva del catálogo: ${datos.nombre}`,
		entidad: "secciones",
		entidadId: id,
		despues: { nombre: datos.nombre, lleva_receta: datos.lleva_receta ?? true },
	});
	contexto.guardarEvento({
		tipo: "seccion.agregada",
		datos: { seccion_id: id },
		tablas: ["secciones"],
		entidad: "secciones",
		entidadId: id,
	});
	return {
		resultado: { seccion_id: id, mensaje: `${datos.nombre} ya está en Catálogo. Sale en Productos y en el alta` },
		entidad: { nombre: "secciones", id },
	};
});
