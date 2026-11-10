/**
 * `admin.cambiar_departamentos`: la dueña cambia los departamentos de una o varias cuentas.
 * Fase 5 · docs/modulos/admin/cuentas.md («`admin.cambiar_departamentos`»)
 *
 * Por cuenta: da de baja lo que deja, agrega un renglón por lo que recibe y sube su versión. Ninguna cuenta
 * queda sin departamentos (para eso está «Quitar acceso»), la de soporte nunca recibe Dirección ni
 * Contaduría y a la dueña no se le cambia nada. Cada cuenta deja su renglón de bitácora y su
 * `cuenta.departamentos_cambiados`, que les manda `permisos_cambiados` a sus sesiones. Las cuentas se
 * bloquean en orden por su id, para que dos cambios a la vez no se crucen.
 */

import { cambiarDepartamentos, departamentosConDinero } from "@uniformame/compartido/contratos/admin/cuentas";
import { inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { revisarVersion, tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	confirmadoConGoogle,
	cuentaQueLlama,
	departamentosPorClave,
	departamentosVigentes,
	leerCuenta,
	nombreDeCuenta,
	revisarAsignables,
	revisarQueSePuedeCambiar,
} from "../dominio/cuentas.ts";
import { usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Lo que ve la dueña de una cuenta en un `409`: sus departamentos de ahora. */
async function departamentosVisibles(transaccion: Transaccion, usuarioId: string) {
	return {
		usuario_id: usuarioId,
		departamentos: (await departamentosVigentes(transaccion, usuarioId)).map((depto) => depto.clave),
	};
}

export const accionCambiarDepartamentos = implementarAccion(cambiarDepartamentos, async (contexto, datos) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	const deptos = await departamentosPorClave(transaccion, [
		...new Set(datos.cambios.flatMap((cambio) => [...cambio.recibe, ...cambio.deja])),
	]);
	const nombreDe = (clave: string) => deptos.get(clave)?.nombre ?? clave;
	const cambios = [...datos.cambios].sort((a, b) => a.usuario_id.localeCompare(b.usuario_id));
	let cambiaron = 0;
	for (const cambio of cambios) {
		const cuenta = await leerCuenta(transaccion, cambio.usuario_id);
		revisarQueSePuedeCambiar(cuenta, "La dueña tiene todos los departamentos");
		const visible = () => departamentosVisibles(transaccion, cuenta.id);
		const vigentes = await departamentosVigentes(transaccion, cuenta.id);
		const tiene = new Set(vigentes.map((depto) => depto.clave));
		// Lo que pide dar y quitar a la vez no cambia; tampoco dar lo que ya tiene ni quitar lo que no tiene.
		const pideDar = new Set<string>(cambio.recibe);
		const pideQuitar = new Set<string>(cambio.deja);
		const recibe = [...pideDar].filter((clave) => !tiene.has(clave) && !pideQuitar.has(clave));
		const deja = vigentes.filter((depto) => pideQuitar.has(depto.clave) && !pideDar.has(depto.clave));
		if (recibe.length === 0 && deja.length === 0) {
			await revisarVersion(contexto, usuarios, cuenta.id, cambio.version, visible);
			continue;
		}
		const nombre = nombreDeCuenta(cuenta);
		if (cuenta.esSoporte && recibe.some((clave) => departamentosConDinero.includes(clave))) {
			throw errorDeRegla("soporte_sin_dinero", "La cuenta de soporte no ve dinero ni nómina.");
		}
		revisarAsignables(recibe.map((clave) => deptos.get(clave) ?? { asignableEnAlta: false }));
		if (tiene.size - deja.length + recibe.length === 0) {
			throw errorDeRegla(
				"sin_departamentos",
				`${nombre} se quedaría sin departamentos. Para quitarle todo, usa «Quitar acceso»`,
			);
		}
		await tomarVersion(contexto, usuarios, cuenta.id, cambio.version, visible);
		const ahora = contexto.ahora.toString();
		if (deja.length > 0) {
			await transaccion
				.update(usuarioDepartamentos)
				.set({ bajaEn: ahora, bajaPor: duena })
				.where(
					inArray(
						usuarioDepartamentos.id,
						deja.map((depto) => depto.id),
					),
				);
		}
		if (recibe.length > 0) {
			await transaccion.insert(usuarioDepartamentos).values(
				recibe.map((clave) => ({
					id: uuidv7(),
					usuarioId: cuenta.id,
					departamentoId: deptos.get(clave)?.id ?? "",
					confirmadoConGoogleEn: confirmado,
					creadoPor: duena,
				})),
			);
		}
		const partes = [
			recibe.length > 0 ? `recibe ${recibe.map(nombreDe).join(", ")}` : undefined,
			deja.length > 0 ? `deja ${deja.map((depto) => nombreDe(depto.clave)).join(", ")}` : undefined,
		].filter((parte) => parte !== undefined);
		contexto.bitacora({
			descripcion: `Departamentos de ${nombre}: ${partes.join(" · ")}`,
			entidad: "usuarios",
			entidadId: cuenta.id,
			antes: { departamentos: [...tiene] },
			despues: { departamentos: (await departamentosVigentes(transaccion, cuenta.id)).map((depto) => depto.clave) },
			esAlerta: true,
			confirmadoConGoogleEn: confirmado,
		});
		contexto.guardarEvento({
			tipo: "cuenta.departamentos_cambiados",
			datos: { usuario_id: cuenta.id },
			tablas: ["usuario_departamentos", "usuarios"],
			entidad: "usuarios",
			entidadId: cuenta.id,
		});
		cambiaron += 1;
	}
	if (cambiaron === 0) throw errorDeRegla("sin_cambios", "No hay cambios por guardar.");
	return { resultado: { mensaje: "Departamentos guardados. Los menús ya cambiaron" } };
});
