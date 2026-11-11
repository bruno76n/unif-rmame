/**
 * `catalogo.agregar_escuela`, `catalogo.editar_escuela`, `catalogo.dar_baja_escuela` y
 * `catalogo.reactivar_escuela`: Catálogo lleva las escuelas con modelos propios.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md (reglas 1 a 4, «Acciones»)
 *
 * Una escuela es única por nombre y municipio, sin importar acentos ni mayúsculas (lo cuida un índice único
 * de la base). Darla de baja conserva sus modelos y su historial.
 */

import {
	agregarEscuela,
	darBajaEscuela,
	editarEscuela,
	reactivarEscuela,
} from "@uniformame/compartido/contratos/catalogo/escuelas";
import { and, eq, ne, sql } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { quienCambia, revisarMotivo } from "../dominio/comunes.ts";
import { crearEscuela, escuelaCambiada, leerEscuela } from "../dominio/escuelas.ts";
import { escuelas } from "../tablas.ts";

export const accionAgregarEscuela = implementarAccion(agregarEscuela, async (contexto, datos) => {
	const escuela = await crearEscuela(contexto, datos, "Esa escuela ya existe.");
	contexto.bitacora({
		descripcion: `Escuela nueva: ${datos.nombre}, ${datos.municipio}`,
		entidad: "escuelas",
		entidadId: escuela.id,
		despues: { nombre: datos.nombre, municipio: datos.municipio, color: escuela.color },
	});
	return {
		resultado: {
			escuela_id: escuela.id,
			color: escuela.color,
			mensaje: `${datos.nombre} ya está en el catálogo. Ahora puedes crearle modelos`,
		},
		entidad: { nombre: "escuelas", id: escuela.id },
	};
});

export const accionEditarEscuela = implementarAccion(editarEscuela, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const antes = await leerEscuela(transaccion, datos.escuela_id);
	await tomarVersion(contexto, escuelas, antes.id, version, async () => ({
		escuela_id: antes.id,
		nombre: antes.nombre,
		municipio: antes.municipio,
	}));
	const [otra] = await transaccion
		.select({ id: escuelas.id })
		.from(escuelas)
		.where(
			and(
				ne(escuelas.id, antes.id),
				sql`sin_acentos(${escuelas.nombre}) = sin_acentos(${datos.nombre})`,
				sql`sin_acentos(${escuelas.municipio}) = sin_acentos(${datos.municipio})`,
			),
		);
	if (otra !== undefined) throw errorDeRegla("escuela_repetida", "Esa escuela ya existe.");
	await transaccion
		.update(escuelas)
		.set({ nombre: datos.nombre, municipio: datos.municipio })
		.where(eq(escuelas.id, antes.id));
	contexto.bitacora({
		descripcion: `Escuela ${antes.nombre} → ${datos.nombre}`,
		entidad: "escuelas",
		entidadId: antes.id,
		antes: { nombre: antes.nombre, municipio: antes.municipio },
		despues: { nombre: datos.nombre, municipio: datos.municipio },
	});
	escuelaCambiada(contexto, antes.id);
	return {
		resultado: {
			mensaje: `Datos de ${datos.nombre} guardados`,
			version: await versionActual(transaccion, escuelas, antes.id),
		},
		entidad: { nombre: "escuelas", id: antes.id },
	};
});

export const accionDarBajaEscuela = implementarAccion(darBajaEscuela, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const escuela = await leerEscuela(transaccion, datos.escuela_id);
	await tomarVersion(contexto, escuelas, escuela.id, version, async () => ({
		escuela_id: escuela.id,
		baja_en: escuela.bajaEn,
	}));
	if (escuela.bajaEn !== null) throw errorDeRegla("ya_dada_de_baja", `${escuela.nombre} ya está dada de baja.`);
	await transaccion
		.update(escuelas)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
		.where(eq(escuelas.id, escuela.id));
	contexto.bitacora({
		descripcion: `Dio de baja ${escuela.nombre}: ${datos.motivo}`,
		entidad: "escuelas",
		entidadId: escuela.id,
		antes: { activa: true },
		despues: { activa: false, motivo: datos.motivo },
	});
	escuelaCambiada(contexto, escuela.id);
	return {
		resultado: {
			mensaje: `${escuela.nombre} dada de baja. Sus modelos y su historial se conservan`,
			version: await versionActual(transaccion, escuelas, escuela.id),
		},
		entidad: { nombre: "escuelas", id: escuela.id },
	};
});

export const accionReactivarEscuela = implementarAccion(reactivarEscuela, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const escuela = await leerEscuela(transaccion, datos.escuela_id);
	await tomarVersion(contexto, escuelas, escuela.id, version, async () => ({
		escuela_id: escuela.id,
		baja_en: escuela.bajaEn,
	}));
	if (escuela.bajaEn === null) throw errorDeRegla("escuela_activa", `${escuela.nombre} ya está activa.`);
	await transaccion
		.update(escuelas)
		.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
		.where(eq(escuelas.id, escuela.id));
	contexto.bitacora({
		descripcion: `${escuela.nombre} vuelve a estar activa`,
		entidad: "escuelas",
		entidadId: escuela.id,
		antes: { activa: false, motivo: escuela.motivoBaja },
		despues: { activa: true },
	});
	escuelaCambiada(contexto, escuela.id);
	return {
		resultado: {
			mensaje: `${escuela.nombre} vuelve a estar activa`,
			version: await versionActual(transaccion, escuelas, escuela.id),
		},
		entidad: { nombre: "escuelas", id: escuela.id },
	};
});
