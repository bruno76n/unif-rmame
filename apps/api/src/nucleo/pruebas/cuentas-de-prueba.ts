/**
 * Las cuentas y los aparatos de las pruebas: quién llama con `x-prueba-quien` y las cuentas que la base
 * plantilla trae para ellos.
 * Fase 5 · docs/modulos/admin/cuentas.md («Las primeras cuentas»)
 *
 * La dueña y soporte son las de la muestra; Ventas, Aduana y Administración del sistema son cuentas de un
 * solo departamento, para probar lo que una cuenta no puede. Cada cuenta trae su sesión abierta.
 * Fase 6: los aparatos de prueba (la tablet del Taller, el puente de Aduana y el del Taller) son aparatos
 * registrados, con su llave conocida (`llavesDePrueba`) y su contacto de ahora con la versión 1.0.0.
 */

import { eq } from "drizzle-orm";
import { cuentasDeLaMuestra, sembrarCuentas } from "../../../semillas/cuentas.ts";
import { dispositivos, dispositivosSync, sesiones } from "../../modulos/admin/tablas.ts";
import { ubicaciones } from "../../modulos/inventario/tablas.ts";
import { personas } from "../../modulos/personal/tablas.ts";
import { hashDe } from "../acceso/cookies.ts";
import type { CuentaQueLlama, QuienLlama } from "../acceso/quien.ts";
import type { Base } from "../base/conexion.ts";

/** Quién puede llamar en las pruebas, por el valor de `x-prueba-quien`. */
export const quienesDePrueba: Record<string, QuienLlama> = {
	duena: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000001",
		sesionId: "01936f2e-0000-7000-8000-000000000011",
		esDuena: true,
		esSoporte: false,
		departamentos: [],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	ventas: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000002",
		sesionId: "01936f2e-0000-7000-8000-000000000012",
		esDuena: false,
		esSoporte: false,
		departamentos: ["ventas"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	admin: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000004",
		sesionId: "01936f2e-0000-7000-8000-000000000014",
		esDuena: false,
		esSoporte: false,
		departamentos: ["admin"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	aduana: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000003",
		sesionId: "01936f2e-0000-7000-8000-000000000013",
		esDuena: false,
		esSoporte: false,
		departamentos: ["aduana"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	direccion: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000009",
		sesionId: "01936f2e-0000-7000-8000-000000000019",
		esDuena: false,
		esSoporte: false,
		departamentos: ["direccion"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	personal: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-00000000000a",
		sesionId: "01936f2e-0000-7000-8000-00000000001a",
		esDuena: false,
		esSoporte: false,
		departamentos: ["personal"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	personal_sueldos: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-00000000000b",
		sesionId: "01936f2e-0000-7000-8000-00000000001b",
		esDuena: false,
		esSoporte: false,
		departamentos: ["personal"],
		permisosFinos: ["ven_sueldos_y_tarifas"],
		confirmadoConGoogleEn: undefined,
	},
	catalogo: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-00000000000c",
		sesionId: "01936f2e-0000-7000-8000-00000000001c",
		esDuena: false,
		esSoporte: false,
		departamentos: ["catalogo"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	soporte: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000005",
		sesionId: "01936f2e-0000-7000-8000-000000000015",
		esDuena: false,
		esSoporte: true,
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
 * La persona de una cuenta de prueba: un id fijo que se parece al de la cuenta.
 * @param usuarioId La cuenta.
 */
export function personaDePrueba(usuarioId: string): string {
	return `${usuarioId.slice(0, -3)}f${usuarioId.slice(-2)}`;
}

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
	const nuevas = cuentas.filter(([, quien]) => !deLaMuestra.has(quien.usuarioId));
	// Su persona, con un folio que no choca con los de la muestra.
	await base
		.insert(personas)
		.values(
			nuevas.map(([nombre, quien], i) => ({
				id: personaDePrueba(quien.usuarioId),
				folio: `E-9${String(i).padStart(2, "0")}`,
				nombre: `Prueba ${nombre}`,
				area: quien.departamentos.includes("aduana") ? "aduana_bodega" : "oficina",
				puesto: "Cuenta de prueba",
				formaPago: "tiempo",
				pagoDiaCentavos: 50_000,
				fechaIngreso: "2020-01-06",
			})),
		)
		.onConflictDoNothing();
	await sembrarCuentas(
		base,
		nuevas.map(([nombre, quien]) => ({
			id: quien.usuarioId,
			correo: `${nombre}@alameda.invalid`,
			personaId: personaDePrueba(quien.usuarioId),
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

/** Los aparatos de prueba: su tipo registrado, su ubicación, su nombre y su llave conocida. */
export const aparatosRegistradosDePrueba = {
	tablet: { tipo: "tablet_taller", ubicacion: "TAL", nombre: "Tablet del taller", llaveId: "prueba21" },
	puente: { tipo: "puente_impresion", ubicacion: "ADU", nombre: "Puente de Aduana", llaveId: "prueba31" },
	otro_puente: { tipo: "puente_impresion", ubicacion: "TAL", nombre: "Puente del Taller", llaveId: "prueba32" },
} as const;

/** El secreto de la llave de cada aparato de prueba: 43 letras de base64url, solo de pruebas. */
export function secretoDePrueba(nombre: keyof typeof aparatosRegistradosDePrueba): string {
	return `secreto-de-prueba-${nombre}`.padEnd(43, "x");
}

/**
 * El encabezado `Authorization` de un aparato de prueba.
 * @param nombre El aparato.
 */
export function llaveDePrueba(nombre: keyof typeof aparatosRegistradosDePrueba): string {
	return `Llave ${aparatosRegistradosDePrueba[nombre].llaveId}.${secretoDePrueba(nombre)}`;
}

/**
 * Siembra en la base plantilla los aparatos de prueba, con su renglón de sincronización: contacto de
 * ahora y versión 1.0.0.
 * @param base La base plantilla, con el rol dueño.
 */
export async function sembrarAparatosDePrueba(base: Base): Promise<void> {
	for (const nombre of ["tablet", "puente", "otro_puente"] as const) {
		const aparato = aparatosRegistradosDePrueba[nombre];
		const quien = quienesDePrueba[nombre];
		if (quien?.tipo !== "aparato") throw new Error(`no hay aparato de prueba ${nombre}`);
		const [ubicacion] = await base
			.select({ id: ubicaciones.id })
			.from(ubicaciones)
			.where(eq(ubicaciones.codigo, aparato.ubicacion));
		await base
			.insert(dispositivos)
			.values({
				id: quien.dispositivoId,
				folio: `DV-P${quien.dispositivoId.slice(-2)}`,
				nombre: aparato.nombre,
				tipo: aparato.tipo,
				ubicacionId: ubicacion?.id ?? null,
				llaveId: aparato.llaveId,
				llaveHash: hashDe(secretoDePrueba(nombre)),
			})
			.onConflictDoNothing();
		await base
			.insert(dispositivosSync)
			.values({
				id: quien.dispositivoId,
				dispositivoId: quien.dispositivoId,
				ultimoContactoEn: new Date().toISOString(),
				versionApp: "1.0.0",
			})
			.onConflictDoNothing();
	}
}
