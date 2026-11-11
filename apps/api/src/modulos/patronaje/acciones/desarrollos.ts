/**
 * Las seis acciones del desarrollo de un producto nuevo: registrar la solicitud, empezar y entregar la muestra,
 * pedir cambios, registrar la aprobación del cliente y descartar.
 * Fase 10 · docs/modulos/patronaje/desarrollos.md (reglas, «Estados», «Acciones»)
 *
 * Sin escuela aprueba Dirección: entregar la muestra pide la autorización `aprobar_desarrollo`, y pedir cambios o
 * descartar con ella esperando la cancela. Cada paso queda en el historial.
 */

import {
	descartarDesarrollo,
	empezarMuestra,
	entregarMuestra,
	pedirCambiosMuestra,
	registrarAprobacionCliente,
	registrarSolicitud,
} from "@uniformame/compartido/contratos/patronaje/desarrollos";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { escuelas } from "../../catalogo/tablas.ts";
import { materiales } from "../../compras/tablas.ts";
import { autorizaciones } from "../../direccion/tablas.ts";
import { avanzar, type Desarrollo, leerDesarrollo, registrarPaso, revisarEtapa } from "../dominio/desarrollos.ts";
import { desarrollos } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `direccion.pedir_autorizacion`. */
const autorizacionPedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() });

/**
 * Lee el desarrollo con su versión tomada.
 * @param contexto El contexto de la acción.
 * @param id El desarrollo.
 * @param version La versión que se leyó.
 */
async function conSuVersion(contexto: ContextoDeAccion, id: string, version: number | undefined): Promise<Desarrollo> {
	const desarrollo = await leerDesarrollo(contexto.transaccion, id);
	await tomarVersion(contexto, desarrollos, desarrollo.id, version, async () => ({
		desarrollo_id: desarrollo.id,
		etapa: desarrollo.etapa,
	}));
	return desarrollo;
}

/**
 * Lo que regresa cada paso: su mensaje, la versión nueva y su entidad.
 * @param contexto El contexto de la acción.
 * @param desarrollo El desarrollo.
 * @param mensaje El mensaje.
 */
async function hecho(contexto: ContextoDeAccion, desarrollo: Desarrollo, mensaje: string) {
	return {
		resultado: { mensaje, version: await versionActual(contexto.transaccion, desarrollos, desarrollo.id) },
		entidad: { nombre: "desarrollos", id: desarrollo.id },
	};
}

/**
 * Cancela la AU- que espera de un desarrollo sin escuela en aprobación.
 * @param contexto El contexto de la acción.
 * @param desarrollo El desarrollo.
 * @param motivo «Patronaje regresó la muestra con cambios» o «Patronaje descartó el desarrollo».
 */
async function cancelarSuAutorizacion(contexto: ContextoDeAccion, desarrollo: Desarrollo, motivo: string) {
	if (desarrollo.escuelaId !== null || desarrollo.etapa !== "aprobacion" || desarrollo.autorizacionId === null) return;
	await contexto.interna("direccion.cancelar_autorizacion", { autorizacion_id: desarrollo.autorizacionId, motivo });
}

export const accionRegistrarSolicitud = implementarAccion(registrarSolicitud, async (contexto, datos) => {
	const { transaccion } = contexto;
	if (datos.escuela_id !== null) {
		// Compartida: mientras la solicitud no confirme, la escuela no se da de baja.
		const [escuela] = await transaccion
			.select({ nombre: escuelas.nombre, bajaEn: escuelas.bajaEn })
			.from(escuelas)
			.where(eq(escuelas.id, datos.escuela_id))
			.for("share");
		if (escuela === undefined) throw errorDeCampo("escuela_id", "Escoge la escuela.");
		if (escuela.bajaEn !== null) throw errorDeRegla("escuela_dada_de_baja", `${escuela.nombre} está dada de baja.`);
	}
	const [tela] = await transaccion
		.select({ tipo: materiales.tipo, bajaEn: materiales.bajaEn })
		.from(materiales)
		.where(eq(materiales.id, datos.tela_material_id))
		.for("share");
	if (tela === undefined || tela.tipo !== "tela" || tela.bajaEn !== null) {
		throw errorDeRegla("tela_no_es_tela", "Escoge una tela.");
	}
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "desarrollo" }));
	const id = uuidv7();
	await transaccion.insert(desarrollos).values({
		id,
		folio,
		escuelaId: datos.escuela_id,
		prenda: datos.prenda,
		telaMaterialId: datos.tela_material_id,
		tallas: datos.tallas,
		descripcion: datos.descripcion ?? null,
		creadoPor: quienCambia(contexto),
	});
	await registrarPaso(contexto, id, {
		accion: "solicitud_registrada",
		etapaAntes: null,
		etapaDespues: "solicitud",
		motivo: null,
		autorizacionId: null,
	});
	contexto.bitacora({
		descripcion: `Registró ${folio} ${datos.prenda}`,
		entidad: "desarrollos",
		entidadId: id,
		entidadFolio: folio,
		despues: { prenda: datos.prenda, escuela_id: datos.escuela_id, tallas: datos.tallas },
	});
	return {
		resultado: { desarrollo_id: id, folio, mensaje: `${folio} registrada en Solicitud` },
		entidad: { nombre: "desarrollos", id },
	};
});

export const accionEmpezarMuestra = implementarAccion(empezarMuestra, async (contexto, datos, version) => {
	const desarrollo = await conSuVersion(contexto, datos.desarrollo_id, version);
	revisarEtapa(desarrollo, "solicitud");
	await avanzar(contexto, desarrollo, {
		etapa: "muestra",
		accion: "muestra_empezada",
		cambios: { muestraEmpezadaEn: contexto.ahora.toString(), muestraTalla: datos.muestra_talla ?? null },
	});
	contexto.bitacora({
		descripcion: `Empezó la muestra de ${desarrollo.folio}`,
		entidad: "desarrollos",
		entidadId: desarrollo.id,
		entidadFolio: desarrollo.folio,
	});
	return hecho(contexto, desarrollo, `${desarrollo.folio}: muestra`);
});

export const accionEntregarMuestra = implementarAccion(entregarMuestra, async (contexto, datos, version) => {
	const desarrollo = await conSuVersion(contexto, datos.desarrollo_id, version);
	revisarEtapa(desarrollo, "muestra");
	// Sin escuela, la aprueba Dirección: nace la AU-.
	let autorizacionId: string | null = null;
	if (desarrollo.escuelaId === null) {
		const [tela] = await contexto.transaccion
			.select({ nombre: materiales.nombre })
			.from(materiales)
			.where(eq(materiales.id, desarrollo.telaMaterialId));
		autorizacionId = autorizacionPedida.parse(
			await contexto.interna("direccion.pedir_autorizacion", {
				tipo: "aprobar_desarrollo",
				departamento_origen: "patronaje",
				resumen: `Aprobar la muestra de ${desarrollo.folio} · ${desarrollo.prenda}`,
				detalle: `Básico o general · ${tela?.nombre ?? ""} · tallas ${desarrollo.tallas}`,
				documento: desarrollo.folio,
				desarrollo_id: desarrollo.id,
			}),
		).autorizacion_id;
	}
	await avanzar(contexto, desarrollo, {
		etapa: "aprobacion",
		accion: "muestra_entregada",
		cambios: {
			muestraEntregadaEn: contexto.ahora.toString(),
			...(autorizacionId === null ? {} : { autorizacionId }),
		},
		autorizacionId,
	});
	contexto.bitacora({
		descripcion:
			desarrollo.escuelaId === null
				? `Terminó la muestra de ${desarrollo.folio} para aprobar`
				: `Entregó la muestra de ${desarrollo.folio} al cliente`,
		entidad: "desarrollos",
		entidadId: desarrollo.id,
		entidadFolio: desarrollo.folio,
	});
	const respuesta = await hecho(contexto, desarrollo, `${desarrollo.folio}: aprobación`);
	return { ...respuesta, resultado: { ...respuesta.resultado, autorizacion_id: autorizacionId } };
});

export const accionPedirCambiosMuestra = implementarAccion(pedirCambiosMuestra, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	const desarrollo = await conSuVersion(contexto, datos.desarrollo_id, version);
	revisarEtapa(desarrollo, "aprobacion");
	await cancelarSuAutorizacion(contexto, desarrollo, "Patronaje regresó la muestra con cambios");
	await avanzar(contexto, desarrollo, {
		etapa: "muestra",
		accion: "cambios_pedidos",
		cambios: { motivoCambios: datos.motivo },
		motivo: datos.motivo,
	});
	contexto.bitacora({
		descripcion: `Regresó la muestra de ${desarrollo.folio} con cambios: ${datos.motivo}`,
		entidad: "desarrollos",
		entidadId: desarrollo.id,
		entidadFolio: desarrollo.folio,
	});
	return hecho(contexto, desarrollo, `${desarrollo.folio} regresa a muestra`);
});

export const accionRegistrarAprobacionCliente = implementarAccion(
	registrarAprobacionCliente,
	async (contexto, datos, version) => {
		const desarrollo = await conSuVersion(contexto, datos.desarrollo_id, version);
		revisarEtapa(desarrollo, "aprobacion");
		if (desarrollo.escuelaId === null) {
			const [au] =
				desarrollo.autorizacionId === null
					? []
					: await contexto.transaccion
							.select({ folio: autorizaciones.folio })
							.from(autorizaciones)
							.where(eq(autorizaciones.id, desarrollo.autorizacionId));
			throw errorDeRegla(
				"aprueba_direccion",
				`Sin escuela la aprueba Dirección: está en sus autorizaciones (${au?.folio ?? "sin folio"}).`,
			);
		}
		await avanzar(contexto, desarrollo, {
			etapa: "ficha_tecnica",
			accion: "aprobado",
			cambios: {
				aprobadoEn: contexto.ahora.toString(),
				aprobadoPorTipo: "cliente",
				aprobadoPor: quienCambia(contexto),
			},
		});
		contexto.bitacora({
			descripcion: `El cliente aprobó la muestra de ${desarrollo.folio}`,
			entidad: "desarrollos",
			entidadId: desarrollo.id,
			entidadFolio: desarrollo.folio,
		});
		return hecho(contexto, desarrollo, `${desarrollo.folio}: ficha técnica`);
	},
);

export const accionDescartarDesarrollo = implementarAccion(descartarDesarrollo, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	const desarrollo = await conSuVersion(contexto, datos.desarrollo_id, version);
	if (desarrollo.etapa === "en_catalogo" || desarrollo.etapa === "cancelado") {
		throw errorDeRegla(
			"desarrollo_terminado",
			desarrollo.etapa === "en_catalogo"
				? `${desarrollo.folio} ya está en catálogo: no se descarta.`
				: `${desarrollo.folio} ya está descartado.`,
		);
	}
	await cancelarSuAutorizacion(contexto, desarrollo, "Patronaje descartó el desarrollo");
	await avanzar(contexto, desarrollo, {
		etapa: "cancelado",
		accion: "cancelado",
		cambios: {
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quienCambia(contexto),
			motivoCancelacion: datos.motivo,
		},
		motivo: datos.motivo,
	});
	contexto.bitacora({
		descripcion: `Descartó ${desarrollo.folio} ${desarrollo.prenda}: ${datos.motivo}`,
		entidad: "desarrollos",
		entidadId: desarrollo.id,
		entidadFolio: desarrollo.folio,
	});
	return hecho(contexto, desarrollo, `${desarrollo.folio} descartada. Queda en el historial con su motivo`);
});
