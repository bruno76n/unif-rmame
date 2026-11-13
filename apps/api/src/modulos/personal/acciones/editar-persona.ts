/**
 * `personal.editar_persona`: Personal edita la ficha de una persona (también de una dada de baja).
 * Fase 7 · docs/modulos/personal/personas.md («`personal.editar_persona`», reglas 3, 4 y 7)
 *
 * El pago por día, solo con «ven sueldos y tarifas»: sin el permiso no viaja y se conserva, y no se puede
 * cambiar la forma de pago (eso cambia el sueldo). No se pasa a tienda a alguien
 * con cuenta. Salir del Taller con PIN vivo lo anula, en la misma transacción.
 */

import { editarPersona } from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
import { veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	columnasDeLaFicha,
	fichaParaBitacora,
	leerPersona,
	pedirPermisoDeSueldos,
	revisarFicha,
	tieneCuenta,
} from "../dominio/personas.ts";
import { anularPin } from "../internas/pin.ts";
import { personas } from "../tablas.ts";

/**
 * Lo que cambió entre dos fichas, campo por campo.
 * @returns El antes y el después de los campos que cambiaron.
 */
function loQueCambio(antes: Record<string, unknown>, despues: Record<string, unknown>) {
	// Los campos de las dos fichas: el pago por día solo va en la que lo tiene.
	const todos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
	const campos = todos.filter((campo) => antes[campo] !== despues[campo]);
	return {
		antes: Object.fromEntries(campos.map((campo) => [campo, antes[campo] ?? null])),
		despues: Object.fromEntries(campos.map((campo) => [campo, despues[campo] ?? null])),
	};
}

export const accionEditarPersona = implementarAccion(editarPersona, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const { persona_id: personaId, ...ficha } = datos;
	const antes = await leerPersona(transaccion, personaId);
	// Sin el permiso, el pago por día no viaja y se conserva; cambiar la forma de pago es cambiar el sueldo.
	if (
		!veSueldosYTarifas(contexto.quien) &&
		(ficha.pago_dia_centavos !== undefined || antes.formaPago !== ficha.forma_pago)
	) {
		pedirPermisoDeSueldos(contexto);
	}
	const pagoDia = veSueldosYTarifas(contexto.quien) ? (ficha.pago_dia_centavos ?? null) : antes.pagoDiaCentavos;
	await revisarFicha(contexto, ficha, pagoDia);
	if (ficha.area === "tienda" && antes.area !== "tienda" && (await tieneCuenta(transaccion, personaId))) {
		throw errorDeRegla(
			"tiene_cuenta",
			`${antes.nombre} entra con Google y nadie de tienda entra al sistema de fábrica. Quítale el acceso antes de pasarla a una tienda.`,
		);
	}
	await tomarVersion(contexto, personas, personaId, version, async () => ({ persona_id: personaId }));
	await transaccion.update(personas).set(columnasDeLaFicha(ficha, pagoDia)).where(eq(personas.id, personaId));
	const despues = await leerPersona(transaccion, personaId);
	// Salir del Taller anula el PIN vivo (si no tenía, no hace nada).
	const pin =
		antes.area === "taller" && despues.area !== "taller"
			? await anularPin(contexto, {
					persona_id: personaId,
					motivo: "cambio_area",
					anulado_por: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null,
				})
			: { anulado: false };
	const cambio = loQueCambio(fichaParaBitacora(antes), fichaParaBitacora(despues));
	const tocaElPago = "forma_pago" in cambio.despues || "pago_dia_centavos" in cambio.despues;
	contexto.bitacora({
		// Puede llevar el pago por día: la descripción va como plantilla, para armarla también sin sueldos.
		descripcion: {
			plantilla: `Editó la ficha de {persona}${tocaElPago ? " (forma de pago o tarifa)" : ""}`,
			valores: { persona: despues.nombre },
		},
		entidad: "personas",
		entidadId: personaId,
		entidadFolio: despues.folio,
		...cambio,
	});
	contexto.guardarEvento({
		tipo: "persona.editada",
		datos: { persona_id: personaId },
		tablas: ["personas"],
		entidad: "personas",
		entidadId: personaId,
		entidadFolio: despues.folio,
	});
	return {
		resultado: {
			mensaje: `${despues.nombre} actualizada${pin.anulado ? ". Su PIN ya no entra" : ""}`,
			version: await versionActual(transaccion, personas, personaId),
		},
		entidad: { nombre: "personas", id: personaId },
	};
});
