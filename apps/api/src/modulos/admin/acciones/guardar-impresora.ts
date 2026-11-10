/**
 * `admin.guardar_impresora`: la dueña agrega, cambia o da de baja una impresora.
 * Fase 4 · docs/modulos/admin/impresion.md («`admin.guardar_impresora`»)
 *
 * El puente tiene que ser un programa de impresión sin revocar y no atender ya otra impresora. Cambiar o
 * dar de baja pide la versión que se leyó.
 */

import { guardarImpresora } from "@uniformame/compartido/contratos/admin/impresion";
import { and, eq, isNull, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { datosDelAparato, tipoPuente } from "../dominio/impresion.ts";
import { impresoras } from "../tablas.ts";

/**
 * Revisa que el puente sea un programa de impresión sin revocar que no atiende otra impresora.
 * @throws `422 puente_no_valido` o `422 puente_ocupado`.
 */
async function revisarPuente(contexto: ContextoDeAccion, dispositivoId: string, impresoraId: string): Promise<void> {
	const aparato = await datosDelAparato(contexto, dispositivoId);
	if (aparato === undefined || aparato.tipo !== tipoPuente || aparato.revocado) {
		throw errorDeRegla("puente_no_valido", "Ese aparato no es un programa de impresión.");
	}
	const [otra] = await contexto.transaccion
		.select({ nombre: impresoras.nombre })
		.from(impresoras)
		.where(and(eq(impresoras.dispositivoId, dispositivoId), isNull(impresoras.bajaEn), ne(impresoras.id, impresoraId)));
	if (otra !== undefined) throw errorDeRegla("puente_ocupado", `${aparato.nombre} ya atiende ${otra.nombre}.`);
}

export const accionGuardarImpresora = implementarAccion(guardarImpresora, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [ubicacion] = await transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, datos.ubicacion_id));
	if (ubicacion === undefined) throw errorDeCampo("ubicacion_id", "Escoge una ubicación.");
	const largoMinimo = Number(await contexto.lectura("admin.parametro", { clave: "general.largo_minimo_motivo" }));
	if (datos.baja === true && (datos.motivo_baja ?? "").length < largoMinimo) {
		throw errorDeCampo("motivo_baja", "Escribe el motivo");
	}
	const id = datos.impresora_id ?? uuidv7();
	if (datos.dispositivo_id !== undefined) await revisarPuente(contexto, datos.dispositivo_id, id);
	const valores = {
		nombre: datos.nombre,
		modelo: datos.modelo,
		ubicacionId: datos.ubicacion_id,
		dispositivoId: datos.dispositivo_id ?? null,
		...(datos.baja === true
			? {
					bajaEn: contexto.ahora.toString(),
					bajaPor: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null,
					motivoBaja: datos.motivo_baja ?? null,
				}
			: {}),
	};
	if (datos.impresora_id === undefined) {
		await transaccion
			.insert(impresoras)
			.values({ id, ...valores, creadoPor: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null });
	} else {
		if (datos.version === undefined) throw errorDeCampo("version", "Falta la versión que se leyó.");
		await tomarVersion(
			contexto,
			impresoras,
			id,
			datos.version,
			async () => (await transaccion.select().from(impresoras).where(eq(impresoras.id, id)))[0],
		);
		await transaccion.update(impresoras).set(valores).where(eq(impresoras.id, id));
	}
	const descripcion =
		datos.baja === true
			? `Dio de baja la impresora ${datos.nombre}: ${datos.motivo_baja ?? ""}`
			: datos.impresora_id === undefined
				? `Agregó la impresora ${datos.nombre}`
				: `Cambió la impresora ${datos.nombre}`;
	contexto.bitacora({ descripcion, entidad: "impresoras", entidadId: id });
	contexto.guardarEvento({
		tipo: "impresora.cambiada",
		datos: { impresora_id: id },
		tablas: ["impresoras"],
		entidad: "impresoras",
		entidadId: id,
	});
	return {
		resultado: {
			mensaje: datos.baja === true ? `${datos.nombre} dada de baja` : `${datos.nombre} guardada`,
			impresora_id: id,
			version: await versionActual(transaccion, impresoras, id),
		},
		entidad: { nombre: "impresoras", id },
	};
});
