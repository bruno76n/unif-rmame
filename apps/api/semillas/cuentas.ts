/**
 * Las cuentas de la muestra: la dueña, la oficina, Aduana y bodega, el encargado del taller y soporte.
 * Fase 5 · docs/modulos/admin/cuentas.md («Las primeras cuentas»)
 *
 * Las de la muestra aprobada (`docs/interfaz/muestra/sistema-alameda.html`), con sus departamentos y sus
 * permisos finos de inicio. Van directo a la base: la dueña y soporte nacen con la siembra, y las demás
 * piden una persona, que llega en la fase 7 (hasta entonces sus `persona_id` son fijos y sin tabla). La
 * Puerta del taller no se da en un alta: el encargado del taller entra a ella con su PIN.
 */

import { inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { departamentos, permisosFinos, usuarioDepartamentos, usuarios } from "../src/modulos/admin/tablas.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";

/** Una cuenta que nace sembrada, con sus departamentos y sus permisos finos. */
export interface CuentaSembrada {
	id: string;
	correo: string;
	personaId: string | null;
	esDuena?: boolean;
	esSoporte?: boolean;
	/** Solo en soporte: las demás usan el nombre de su persona. */
	nombre?: string;
	departamentos: readonly string[];
	permisosFinos: readonly ("ven_sueldos_y_tarifas" | "imprime_guias")[];
}

/** Las cuentas de la muestra. La dueña y soporte son también las de las pruebas. */
export const cuentasDeLaMuestra: readonly CuentaSembrada[] = [
	{
		id: "01936f2e-0000-7000-8000-000000000001",
		correo: "carmen@uniformesalameda.mx",
		personaId: "01936f2e-0000-7000-8000-0000000000e1",
		esDuena: true,
		departamentos: [],
		permisosFinos: [],
	},
	{
		id: "01936f2e-0000-7000-8000-000000000005",
		correo: "soporte@centerdiv.mx",
		personaId: null,
		esSoporte: true,
		nombre: "Soporte técnico",
		departamentos: ["admin"],
		permisosFinos: [],
	},
	{
		id: "01936f2e-0000-7000-8000-000000000006",
		correo: "rosa@uniformesalameda.mx",
		personaId: "01936f2e-0000-7000-8000-0000000000e2",
		departamentos: ["compras", "catalogo", "patronaje", "ventas", "linea", "contaduria", "personal", "admin"],
		permisosFinos: ["ven_sueldos_y_tarifas"],
	},
	{
		id: "01936f2e-0000-7000-8000-000000000007",
		correo: "javier@uniformesalameda.mx",
		personaId: "01936f2e-0000-7000-8000-0000000000e3",
		departamentos: ["aduana", "bodega"],
		permisosFinos: ["imprime_guias"],
	},
	{
		id: "01936f2e-0000-7000-8000-000000000008",
		correo: "tomas@uniformesalameda.mx",
		personaId: "01936f2e-0000-7000-8000-0000000000e4",
		departamentos: ["produccion", "calidad", "mantenimiento"],
		permisosFinos: [],
	},
];

/**
 * Siembra cuentas activas con sus departamentos y sus permisos finos. Con el rol dueño: solo él pone
 * `es_duena` y `es_soporte`. Una cuenta que ya existe se deja como está.
 * @param base La base, con el rol dueño.
 * @param cuentas Las cuentas.
 */
export async function sembrarCuentas(base: Base, cuentas: readonly CuentaSembrada[]): Promise<void> {
	const claves = [...new Set(cuentas.flatMap((cuenta) => cuenta.departamentos))];
	const deptos =
		claves.length === 0
			? []
			: await base
					.select({ id: departamentos.id, clave: departamentos.clave })
					.from(departamentos)
					.where(inArray(departamentos.clave, claves));
	const idDe = new Map(deptos.map((depto) => [depto.clave, depto.id]));
	for (const cuenta of cuentas) {
		const nuevas = await base
			.insert(usuarios)
			.values({
				id: cuenta.id,
				personaId: cuenta.personaId,
				correo: cuenta.correo,
				estado: "activa",
				esDuena: cuenta.esDuena ?? false,
				esSoporte: cuenta.esSoporte ?? false,
				nombre: cuenta.nombre ?? null,
				activadaEn: new Date().toISOString(),
			})
			.onConflictDoNothing()
			.returning({ id: usuarios.id });
		if (nuevas.length === 0) continue;
		for (const clave of cuenta.departamentos) {
			const departamentoId = idDe.get(clave);
			if (departamentoId === undefined) throw new Error(`no hay departamento ${clave}`);
			await base.insert(usuarioDepartamentos).values({ id: uuidv7(), usuarioId: cuenta.id, departamentoId });
		}
		for (const permiso of cuenta.permisosFinos) {
			await base.insert(permisosFinos).values({ id: uuidv7(), usuarioId: cuenta.id, permiso });
		}
	}
}

/**
 * La carga de la muestra de las cuentas.
 * @param base La base, con el rol dueño.
 */
export async function cargarCuentasDeLaMuestra(base: Base): Promise<void> {
	await sembrarCuentas(base, cuentasDeLaMuestra);
}
