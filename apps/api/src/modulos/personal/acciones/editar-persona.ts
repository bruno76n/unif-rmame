/**
 * `personal.editar_persona`: Personal edita la ficha de una persona (también de una dada de baja).
 * Fase 7 · docs/modulos/personal/personas.md («`personal.editar_persona`», reglas 3, 4 y 7)
 *
 * El pago por día, solo con «ven sueldos y tarifas»: sin el permiso no viaja y se conserva, y no se puede
 * pasar de por pieza a por tiempo o mixta ni al revés (eso cambia el sueldo). No se pasa a tienda a alguien
 * con cuenta. Salir del Taller con PIN vivo lo anula (con el PIN del taller, en la parte 3).
 */

import { editarPersona } from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
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
	veSueldos,
} from "../dominio/personas.ts";
import { personas } from "../tablas.ts";

/**
 * Lo que cambió entre dos fichas, campo por campo.
 * @returns El antes y el después de los campos que cambiaron.
 */
function loQueCambio(antes: Record<string, unknown>, despues: Record<string, unknown>) {
	const campos = Object.keys(despues).filter((campo) => antes[campo] !== despues[campo]);
	return {
		antes: Object.fromEntries(campos.map((campo) => [campo, antes[campo]])),
		despues: Object.fromEntries(campos.map((campo) => [campo, despues[campo]])),
	};
}

export const accionEditarPersona = implementarAccion(editarPersona, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const { persona_id: personaId, ...ficha } = datos;
	const antes = await leerPersona(transaccion, personaId);
	// Sin el permiso, el pago por día no viaja y se conserva; cambiar si lleva pago o no es cambiar el sueldo.
	if (!veSueldos(contexto)) {
		const llevaPago = (forma: string) => forma !== "pieza";
		if (ficha.pago_dia_centavos !== undefined || llevaPago(antes.formaPago) !== llevaPago(ficha.forma_pago)) {
			pedirPermisoDeSueldos(contexto);
		}
	}
	const pagoDia = veSueldos(contexto) ? (ficha.pago_dia_centavos ?? null) : antes.pagoDiaCentavos;
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
			mensaje: `${despues.nombre} actualizada`,
			version: await versionActual(transaccion, personas, personaId),
		},
		entidad: { nombre: "personas", id: personaId },
	};
});
