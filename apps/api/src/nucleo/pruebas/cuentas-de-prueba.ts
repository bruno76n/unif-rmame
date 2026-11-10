/**
 * Las cuentas y los aparatos de las pruebas: quién llama con `x-prueba-quien` y las cuentas que la base
 * plantilla trae para ellos.
 * Fase 5 · docs/modulos/admin/cuentas.md («Las primeras cuentas»)
 *
 * La dueña y soporte son las de la muestra; Ventas, Aduana y Administración del sistema son cuentas de un
 * solo departamento, para probar lo que una cuenta no puede. Cada cuenta trae su sesión abierta.
 */

import { cuentasDeLaMuestra, sembrarCuentas } from "../../../semillas/cuentas.ts";
import { sesiones } from "../../modulos/admin/tablas.ts";
import type { CuentaQueLlama, QuienLlama } from "../acceso/quien.ts";
import type { Base } from "../base/conexion.ts";

/** Quién puede llamar en las pruebas, por el valor de `x-prueba-quien`. */
export const quienesDePrueba: Record<string, QuienLlama> = {
	duena: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000001",
		sesionId: "01936f2e-0000-7000-8000-000000000011",
		esDuena: true,
		departamentos: [],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	ventas: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000002",
		sesionId: "01936f2e-0000-7000-8000-000000000012",
		esDuena: false,
		departamentos: ["ventas"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	admin: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000004",
		sesionId: "01936f2e-0000-7000-8000-000000000014",
		esDuena: false,
		departamentos: ["admin"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	aduana: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000003",
		sesionId: "01936f2e-0000-7000-8000-000000000013",
		esDuena: false,
		departamentos: ["aduana"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	soporte: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000005",
		sesionId: "01936f2e-0000-7000-8000-000000000015",
		esDuena: false,
		departamentos: ["admin"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	puente: {
		tipo: "aparato",
		dispositivoId: "01936f2e-0000-7000-8000-000000000031",
		tipoDeAparato: "puente",
		personaId: undefined,
	},
	otro_puente: {
		tipo: "aparato",
		dispositivoId: "01936f2e-0000-7000-8000-000000000032",
		tipoDeAparato: "puente",
		personaId: undefined,
	},
	tablet: {
		tipo: "aparato",
		dispositivoId: "01936f2e-0000-7000-8000-000000000021",
		tipoDeAparato: "tablet",
		personaId: undefined,
	},
};

/**
 * Siembra en la base plantilla las cuentas de prueba que no son de la muestra, y la sesión abierta de
 * cada cuenta de prueba. Corre después de la carga de la muestra, con el rol dueño.
 * @param base La base plantilla, con el rol dueño.
 */
export async function sembrarCuentasDePrueba(base: Base): Promise<void> {
	const deLaMuestra = new Set(cuentasDeLaMuestra.map((cuenta) => cuenta.id));
	const cuentas = Object.entries(quienesDePrueba).flatMap(([nombre, quien]): [string, CuentaQueLlama][] =>
		quien.tipo === "cuenta" ? [[nombre, quien]] : [],
	);
	await sembrarCuentas(
		base,
		cuentas
			.filter(([, quien]) => !deLaMuestra.has(quien.usuarioId))
			.map(([nombre, quien]) => ({
				id: quien.usuarioId,
				correo: `${nombre}@alameda.invalid`,
				// Su persona llega en la fase 7: un id fijo que se parece al de la cuenta.
				personaId: `${quien.usuarioId.slice(0, -3)}f${quien.usuarioId.slice(-2)}`,
				departamentos: quien.departamentos,
				permisosFinos: quien.permisosFinos.filter(
					(permiso): permiso is "ven_sueldos_y_tarifas" | "imprime_guias" =>
						permiso === "ven_sueldos_y_tarifas" || permiso === "imprime_guias",
				),
			})),
	);
	const ahora = new Date().toISOString();
	await base
		.insert(sesiones)
		.values(
			cuentas.map(([nombre, quien]) => ({
				id: quien.sesionId,
				usuarioId: quien.usuarioId,
				tokenHash: `sesion-de-prueba-${nombre}`,
				ultimaActividadEn: ahora,
				venceEn: "2100-01-01T00:00:00Z",
			})),
		)
		.onConflictDoNothing();
}

/**
 * El id de una cuenta de prueba.
 * @param nombre Su nombre en `quienesDePrueba`.
 */
export function cuentaDePrueba(nombre: string): string {
	const quien = quienesDePrueba[nombre];
	if (quien?.tipo !== "cuenta") throw new Error(`no hay cuenta de prueba ${nombre}`);
	return quien.usuarioId;
}
