/**
 * `compras.agregar_proveedor_material`, `compras.quitar_proveedor_material` y `compras.hacer_habitual`: qué
 * proveedores surten un material y cuál es el habitual.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md (reglas 7, 9 y 11, «Acciones») y materiales.md (regla 11)
 *
 * El material es un agregado con sus proveedores: cada una toma la versión del material, así que quien lo ve en el
 * cajón Material choca si alguien más lo cambió. El candado `en_borrador` llega con las órdenes (parte 4).
 */

import {
	agregarProveedorMaterial,
	hacerHabitual,
	quitarProveedorMaterial,
} from "@uniformame/compartido/contratos/compras/materiales";
import { and, eq } from "drizzle-orm";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import {
	eventoDeMaterial,
	leerMaterial,
	leerProveedor,
	precioATexto,
	registrarPrecio,
	revisarPrecio,
	revisarProveedorActivo,
} from "../dominio/comunes.ts";
import { materiales, materialProveedores } from "../tablas.ts";

/**
 * Lee el material con su versión tomada, y el proveedor compartido (que nadie lo dé de baja mientras).
 * @param contexto El contexto de la acción.
 * @param datos El material y el proveedor.
 * @param version La versión del material que se leyó.
 */
async function materialYProveedor(
	contexto: ContextoDeAccion,
	datos: { material_id: string; proveedor_id: string },
	version: number | undefined,
) {
	const material = await leerMaterial(contexto, datos.material_id);
	await tomarVersion(contexto, materiales, material.id, version, async () => ({
		material_id: material.id,
		proveedor_habitual_id: material.proveedorHabitualId,
	}));
	const proveedor = await leerProveedor(contexto, datos.proveedor_id, "share");
	const [par] = await contexto.transaccion
		.select()
		.from(materialProveedores)
		.where(and(eq(materialProveedores.materialId, material.id), eq(materialProveedores.proveedorId, proveedor.id)));
	return { material, proveedor, surte: par !== undefined && par.bajaEn === null, par };
}

/**
 * Lo que regresa cada una: su mensaje, la versión nueva del material y su entidad. Guarda `material.cambiado`.
 * @param contexto El contexto de la acción.
 * @param materialId El material.
 * @param mensaje El mensaje.
 */
async function hecho(contexto: ContextoDeAccion, materialId: string, mensaje: string) {
	eventoDeMaterial(contexto, "material.cambiado", materialId);
	return {
		resultado: { mensaje, version: await versionActual(contexto.transaccion, materiales, materialId) },
		entidad: { nombre: "materiales", id: materialId },
	};
}

export const accionAgregarProveedorMaterial = implementarAccion(
	agregarProveedorMaterial,
	async (contexto, datos, version) => {
		await revisarPrecio(contexto, "precio_centavos", "Escribe el precio.", datos.precio_centavos);
		const { material, proveedor, surte } = await materialYProveedor(contexto, datos, version);
		if (surte) throw errorDeRegla("ya_lo_surte", `${proveedor.nombre} ya surte ${material.nombre}.`);
		revisarProveedorActivo(proveedor);
		// El par nace o se reactiva con este precio como su último, y el precio entra al historial.
		await registrarPrecio(contexto, {
			materialId: material.id,
			proveedorId: proveedor.id,
			precioCentavos: datos.precio_centavos,
			origen: "proveedor_agregado",
		});
		contexto.bitacora({
			descripcion: `${proveedor.nombre} surte ${material.nombre} a ${precioATexto(datos.precio_centavos)}`,
			entidad: "materiales",
			entidadId: material.id,
			despues: { proveedor_id: proveedor.id, precio_centavos: datos.precio_centavos },
		});
		return hecho(contexto, material.id, `${proveedor.nombre} ya surte ${material.nombre}`);
	},
);

export const accionQuitarProveedorMaterial = implementarAccion(
	quitarProveedorMaterial,
	async (contexto, datos, version) => {
		await revisarMotivo(contexto, datos.motivo);
		const { material, proveedor, surte, par } = await materialYProveedor(contexto, datos, version);
		if (!surte || par === undefined) {
			throw errorDeRegla("no_lo_surte", `${proveedor.nombre} no surte ${material.nombre}.`);
		}
		if (material.proveedorHabitualId === proveedor.id) {
			throw errorDeRegla(
				"proveedor_habitual",
				`${proveedor.nombre} es el habitual de ${material.nombre}: haz habitual a otro antes de quitarlo.`,
			);
		}
		// La baja del par; el historial de precios se queda.
		await contexto.transaccion
			.update(materialProveedores)
			.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
			.where(eq(materialProveedores.id, par.id));
		contexto.bitacora({
			descripcion: `${proveedor.nombre} ya no surte ${material.nombre}: ${datos.motivo}`,
			entidad: "materiales",
			entidadId: material.id,
			antes: { proveedor_id: proveedor.id, surte: true },
			despues: { proveedor_id: proveedor.id, surte: false, motivo: datos.motivo },
		});
		return hecho(contexto, material.id, `${proveedor.nombre} ya no surte ${material.nombre}`);
	},
);

export const accionHacerHabitual = implementarAccion(hacerHabitual, async (contexto, datos, version) => {
	const { material, proveedor, surte } = await materialYProveedor(contexto, datos, version);
	if (!surte) {
		throw errorDeRegla("no_lo_surte", `${proveedor.nombre} no surte ${material.nombre}: agrégalo primero.`);
	}
	if (material.proveedorHabitualId === proveedor.id) {
		throw errorDeRegla("ya_es_habitual", `${proveedor.nombre} ya es el habitual de ${material.nombre}.`);
	}
	revisarProveedorActivo(proveedor);
	await contexto.transaccion
		.update(materiales)
		.set({ proveedorHabitualId: proveedor.id })
		.where(eq(materiales.id, material.id));
	contexto.bitacora({
		descripcion: `${proveedor.nombre} pasa a ser el proveedor habitual de ${material.nombre}`,
		entidad: "materiales",
		entidadId: material.id,
		antes: { proveedor_habitual_id: material.proveedorHabitualId },
		despues: { proveedor_habitual_id: proveedor.id },
	});
	return hecho(
		contexto,
		material.id,
		`${proveedor.nombre} es el proveedor habitual de ${material.nombre}. El pedido sugerido usa su tiempo de entrega`,
	);
});
