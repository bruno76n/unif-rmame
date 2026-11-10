/**
 * `direccion.decidir_autorizacion`: Dirección autoriza o rechaza una autorización, una sola vez.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md (reglas 1 a 6 y «`direccion.decidir_autorizacion`»)
 *
 * El efecto lo aplica el módulo de origen, con la interna que registró para su tipo, en la misma
 * transacción: si falla, su error sale tal cual y no se decide nada. El efecto no escribe bitácora: la
 * acción deja un solo renglón, del módulo `direccion` y del departamento de la pantalla, con lo que regresó
 * el efecto. La dueña también decide desde Bodega (solo ajustes) y desde Administración (solo altas); el alta
 * de usuario solo la decide ella.
 */

import {
	decidirAutorizacion,
	nombreDelTipoDeAutorizacion,
	type TipoDeAutorizacion,
} from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import { departamentos } from "../../admin/tablas.ts";
import { type Autorizacion, leerAutorizacion, ligasDe, tipoDe } from "../dominio/autorizaciones.ts";
import { autorizaciones } from "../tablas.ts";

/** Lo que regresa el efecto del módulo de origen. */
const loQueRegresaElEfecto = z
	.object({
		/** El aviso verde, si el efecto tiene uno propio (un alta: «{persona} dada de alta…»). */
		mensaje: z.string().optional(),
		/** El renglón de bitácora, si el efecto tiene uno propio (un alta: «Dio de alta a…»). */
		descripcion: z.string().optional(),
		/** El estado del documento antes y después, para la bitácora. */
		antes: z.unknown().optional(),
		despues: z.unknown().optional(),
		/** Lo que regresa a la pantalla (el NC-). */
		datos: z.record(z.string(), z.unknown()).optional(),
	})
	.strict();

/** Lo único que cada pantalla que no es Dirección decide (y solo la dueña). */
const loQueSeDecideDesde: Readonly<Record<"bodega" | "admin", TipoDeAutorizacion>> = {
	bodega: "ajuste_inventario",
	admin: "alta_usuario",
};

/**
 * Revisa que quien llama pueda decidir esta autorización desde esa pantalla.
 * @throws `403 solo_duena` o `422 no_se_decide_aqui`.
 */
function revisarQuienDecide(
	contexto: ContextoDeAccion,
	tipo: TipoDeAutorizacion,
	desde: "direccion" | "bodega" | "admin",
): void {
	const esDuena = contexto.quien.tipo === "cuenta" && contexto.quien.esDuena;
	if (tipo === "alta_usuario" && !esDuena) {
		throw new ErrorDeApi("sin_permiso", "solo_duena", "Las cuentas nuevas solo las da la dueña.");
	}
	if (desde === "direccion") return;
	if (!esDuena) throw new ErrorDeApi("sin_permiso", "solo_duena", "Desde esta pantalla solo decide la dueña.");
	if (loQueSeDecideDesde[desde] !== tipo) {
		throw errorDeRegla(
			"no_se_decide_aqui",
			`Desde esta pantalla solo se decide: ${nombreDelTipoDeAutorizacion[loQueSeDecideDesde[desde]].toLowerCase()}.`,
		);
	}
}

/**
 * Corre el efecto del módulo de origen con un contexto que no deja escribir bitácora: el renglón es de la
 * decisión.
 * @returns Lo que regresó el efecto.
 */
async function aplicarEfecto(
	contexto: ContextoDeAccion,
	autorizacion: Autorizacion,
	decision: { decision: "autorizar" | "rechazar"; motivo: string | undefined },
) {
	const tipo = tipoDe(autorizacion);
	const nombre = contexto.registro.efectosDeAutorizacion.get(tipo);
	const efecto = nombre === undefined ? undefined : contexto.registro.internas.get(nombre);
	if (efecto === undefined) throw new Error(`la autorización ${tipo} no tiene efecto registrado`);
	const sinBitacora: ContextoDeAccion = {
		...contexto,
		bitacora: () => {
			throw new Error(`el efecto ${nombre} no escribe bitácora: la escribe la decisión`);
		},
	};
	return loQueRegresaElEfecto.parse(
		(await efecto(sinBitacora, {
			autorizacion_id: autorizacion.id,
			folio: autorizacion.folio,
			tipo,
			decision: decision.decision,
			...(decision.motivo === undefined ? {} : { motivo: decision.motivo }),
			...ligasDe(autorizacion),
		})) ?? {},
	);
}

export const accionDecidirAutorizacion = implementarAccion(decidirAutorizacion, async (contexto, datos, version) => {
	const { transaccion, quien } = contexto;
	if (quien.tipo !== "cuenta") throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
	const autorizacion = await leerAutorizacion(transaccion, datos.autorizacion_id);
	const tipo = tipoDe(autorizacion);
	revisarQuienDecide(contexto, tipo, datos.desde);
	if (autorizacion.estado !== "por_autorizar") {
		throw errorDeRegla(
			"ya_decidida",
			autorizacion.estado === "cancelada"
				? `Esa autorización se canceló: ${autorizacion.motivoCancelacion ?? "su documento se canceló"}.`
				: "Esa autorización ya se decidió.",
		);
	}
	const motivo = datos.decision === "rechazar" ? datos.motivo : undefined;
	if (datos.decision === "rechazar" && motivo === undefined) {
		throw errorDeCampo("motivo", "Escribe el motivo: le llega a quien lo pidió");
	}
	await tomarVersion(contexto, autorizaciones, autorizacion.id, version, async () => ({
		autorizacion_id: autorizacion.id,
		estado: (await leerAutorizacion(transaccion, autorizacion.id)).estado,
	}));
	const [desde] = await transaccion
		.select({ id: departamentos.id })
		.from(departamentos)
		.where(eq(departamentos.clave, datos.desde));
	const estado = datos.decision === "autorizar" ? ("autorizada" as const) : ("rechazada" as const);
	const confirmado = confirmadoConGoogle(contexto);
	await transaccion
		.update(autorizaciones)
		.set({
			estado,
			decididaEn: contexto.ahora.toString(),
			decididaPor: quien.usuarioId,
			decididaDesdeId: desde?.id ?? null,
			motivoRechazo: motivo ?? null,
			confirmadoConGoogleEn: confirmado,
		})
		.where(eq(autorizaciones.id, autorizacion.id));
	// El efecto del módulo de origen, en esta misma transacción: si falla, no se decide nada.
	const efecto = await aplicarEfecto(contexto, autorizacion, { decision: datos.decision, motivo });
	const mismaPersona = autorizacion.creadoPor === quien.usuarioId;
	contexto.bitacora({
		descripcion:
			efecto.descripcion ??
			(motivo === undefined
				? `Autorizó: ${autorizacion.resumen}${mismaPersona ? " · pedida y autorizada por la misma persona" : ""}`
				: `Rechazó: ${autorizacion.resumen} · ${motivo}`),
		entidad: "autorizaciones",
		entidadId: autorizacion.id,
		entidadFolio: autorizacion.folio,
		antes: { estado: "por_autorizar", documento: efecto.antes },
		despues: { estado, documento: efecto.despues },
		departamento: datos.desde,
		mismaPersona,
		confirmadoConGoogleEn: confirmado,
	});
	contexto.guardarEvento({
		tipo: "autorizacion.decidida",
		datos: {
			autorizacion_id: autorizacion.id,
			tipo,
			decision: datos.decision,
			pedida_por: autorizacion.creadoPor,
		},
		tablas: ["autorizaciones"],
		entidad: "autorizaciones",
		entidadId: autorizacion.id,
		entidadFolio: autorizacion.folio,
	});
	const nombre = nombreDelTipoDeAutorizacion[tipo].toLowerCase();
	return {
		resultado: {
			estado,
			folio: autorizacion.folio,
			...(efecto.datos === undefined ? {} : { datos: efecto.datos }),
			mensaje:
				efecto.mensaje ?? (estado === "autorizada" ? `Autorizado por Dirección: ${nombre}` : `Rechazado: ${nombre}`),
			version: await versionActual(transaccion, autorizaciones, autorizacion.id),
		},
		entidad: { nombre: "autorizaciones", id: autorizacion.id },
	};
});
