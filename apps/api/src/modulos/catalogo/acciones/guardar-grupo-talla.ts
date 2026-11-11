/**
 * `catalogo.guardar_grupo_talla`: Catálogo agrega un grupo de tallas, o le agrega tallas, las renombra, las
 * reordena o las quita.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md (reglas 1 y 2, «`catalogo.guardar_grupo_talla`»)
 *
 * Se manda el grupo completo. Una talla que ya no viene queda con baja; una que vuelve con el nombre de una
 * quitada la reactiva. Una talla que ya usa algún producto no se renombra ni se quita (`tallaEnUso`).
 */

import { guardarGrupoTalla } from "@uniformame/compartido/contratos/catalogo/tallas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { revisarQueNoSeUsa } from "../dominio/tallas.ts";
import { gruposTalla, tallas } from "../tablas.ts";

/**
 * El grupo que se guarda: el que existe, bloqueado y con su versión tomada, o uno nuevo.
 * @returns Su id y si es nuevo.
 */
async function grupoQueSeGuarda(
	contexto: ContextoDeAccion,
	datos: { grupo_talla_id?: string | undefined; nombre: string; version?: number | undefined },
): Promise<{ id: string; nuevo: boolean }> {
	const { transaccion } = contexto;
	const repetido = errorDeRegla("grupo_repetido", "Ese grupo de tallas ya existe.");
	if (datos.grupo_talla_id === undefined) {
		const id = uuidv7();
		const [creado] = await transaccion
			.insert(gruposTalla)
			.values({
				id,
				nombre: datos.nombre,
				orden: sql`(SELECT coalesce(max(orden), 0) + 1 FROM grupos_talla)`,
				creadoPor: quienCambia(contexto),
			})
			.onConflictDoNothing()
			.returning({ id: gruposTalla.id });
		if (creado === undefined) throw repetido;
		return { id, nuevo: true };
	}
	const [grupo] = await transaccion.select().from(gruposTalla).where(eq(gruposTalla.id, datos.grupo_talla_id));
	if (grupo === undefined) throw noExiste();
	await tomarVersion(contexto, gruposTalla, grupo.id, datos.version, async () => ({
		grupo_talla_id: grupo.id,
		nombre: grupo.nombre,
	}));
	const [otro] = await transaccion
		.select({ id: gruposTalla.id })
		.from(gruposTalla)
		.where(sql`lower(${gruposTalla.nombre}) = lower(${datos.nombre}) and ${gruposTalla.id} <> ${grupo.id}`);
	if (otro !== undefined) throw repetido;
	if (grupo.nombre !== datos.nombre) {
		await transaccion.update(gruposTalla).set({ nombre: datos.nombre }).where(eq(gruposTalla.id, grupo.id));
	}
	return { id: grupo.id, nuevo: false };
}

export const accionGuardarGrupoTalla = implementarAccion(guardarGrupoTalla, async (contexto, datos) => {
	const { transaccion } = contexto;
	const vistos = new Set<string>();
	for (const talla of datos.tallas) {
		const llave = talla.nombre.toLowerCase();
		if (vistos.has(llave)) throw errorDeRegla("talla_repetida", `La talla ${talla.nombre} ya está en el grupo.`);
		vistos.add(llave);
	}
	const grupo = await grupoQueSeGuarda(contexto, datos);
	const deAntes = await transaccion
		.select()
		.from(tallas)
		.where(eq(tallas.grupoTallaId, grupo.id))
		.orderBy(tallas.orden)
		.for("update");
	const vigentesAntes = deAntes.filter((talla) => talla.bajaEn === null);
	const quien = quienCambia(contexto);
	// Las que ya no vienen quedan con baja, si nadie las usa.
	const queVienen = new Set(datos.tallas.flatMap((talla) => (talla.talla_id === undefined ? [] : [talla.talla_id])));
	for (const talla of vigentesAntes.filter((vigente) => !queVienen.has(vigente.id))) {
		await revisarQueNoSeUsa(transaccion, talla);
		await transaccion
			.update(tallas)
			.set({ bajaEn: contexto.ahora.toString(), bajaPor: quien, motivoBaja: "Se quitó del grupo" })
			.where(eq(tallas.id, talla.id));
	}
	for (const talla of datos.tallas) {
		const existente = deAntes.find(
			(antes) =>
				antes.id === talla.talla_id ||
				(talla.talla_id === undefined && antes.nombre.toLowerCase() === talla.nombre.toLowerCase()),
		);
		if (talla.talla_id !== undefined && existente === undefined) throw noExiste();
		if (existente === undefined) {
			await transaccion
				.insert(tallas)
				.values({ id: uuidv7(), grupoTallaId: grupo.id, nombre: talla.nombre, orden: talla.orden, creadoPor: quien });
			continue;
		}
		if (existente.nombre !== talla.nombre) await revisarQueNoSeUsa(transaccion, existente);
		// Una que vuelve con el nombre de una quitada la reactiva.
		const vuelve = existente.bajaEn !== null;
		if (existente.nombre !== talla.nombre || existente.orden !== talla.orden || vuelve) {
			await transaccion
				.update(tallas)
				.set({
					nombre: talla.nombre,
					orden: talla.orden,
					...(vuelve ? { bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() } : {}),
				})
				.where(eq(tallas.id, existente.id));
		}
	}
	const despues = await transaccion
		.select({ nombre: tallas.nombre, orden: tallas.orden })
		.from(tallas)
		.where(and(eq(tallas.grupoTallaId, grupo.id), isNull(tallas.bajaEn)))
		.orderBy(tallas.orden);
	contexto.bitacora({
		descripcion: `Grupo ${datos.nombre}: ${despues.map((talla) => talla.nombre).join(", ")}`,
		entidad: "grupos_talla",
		entidadId: grupo.id,
		...(grupo.nuevo ? {} : { antes: { tallas: vigentesAntes.map(({ nombre, orden }) => ({ nombre, orden })) } }),
		despues: { tallas: despues },
	});
	contexto.guardarEvento({
		tipo: "talla.cambiada",
		datos: { grupo_talla_id: grupo.id },
		tablas: ["grupos_talla", "tallas"],
		entidad: "grupos_talla",
		entidadId: grupo.id,
	});
	return {
		resultado: {
			grupo_talla_id: grupo.id,
			version: await versionActual(transaccion, gruposTalla, grupo.id),
			mensaje: `Grupo ${datos.nombre} guardado`,
		},
		entidad: { nombre: "grupos_talla", id: grupo.id },
	};
});
