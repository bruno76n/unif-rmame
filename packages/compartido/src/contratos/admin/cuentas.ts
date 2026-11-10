/**
 * Los contratos de las cuentas, sus departamentos y sus permisos finos.
 * Fase 5 · docs/modulos/admin/cuentas.md («Acciones») y docs/modulos/admin/permisos.md («Acciones»)
 *
 * Todas son de la dueña, con «Confirmar con Google».
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Las claves de los 15 departamentos de la fábrica, en el orden del menú. */
export const clavesDeDepartamento = [
	"direccion",
	"compras",
	"catalogo",
	"patronaje",
	"ventas",
	"linea",
	"produccion",
	"puerta_taller",
	"calidad",
	"mantenimiento",
	"aduana",
	"bodega",
	"contaduria",
	"personal",
	"admin",
] as const;

/** Un departamento, por su clave. */
export const claveDeDepartamento = z.enum(clavesDeDepartamento);

/** Los permisos finos de una cuenta. */
export const permisosFinosDeCuenta = ["ven_sueldos_y_tarifas", "imprime_guias"] as const;

/** Los departamentos que la cuenta de soporte nunca tiene: ven dinero o nómina. */
export const departamentosConDinero: readonly string[] = ["direccion", "contaduria"];

/** Errores de las cuentas que comparten varias acciones. */
const esLaDuena = { codigo: "es_la_duena", mensaje: "La dueña no se quita el acceso." };
const cuentaNoActiva = { codigo: "cuenta_no_activa", mensaje: "Esa cuenta ya no tiene acceso." };
const soporteSinDinero = { codigo: "soporte_sin_dinero", mensaje: "La cuenta de soporte no ve dinero ni nómina." };

/** Lo que recibe una cuenta nueva, la dé la dueña o la pida la oficina. */
const cuentaNueva = {
	persona_id: z.uuid("Escoge a la persona.").describe("La persona de Personal"),
	correo: z
		.string("Escribe su correo de Google.")
		.trim()
		.toLowerCase()
		.min(1, "Escribe su correo de Google.")
		.pipe(z.email("Escribe su correo de Google.").max(254))
		.describe("La cuenta de Google, en minúsculas"),
	departamentos: z
		.array(claveDeDepartamento, "Marca al menos un departamento.")
		.min(1, "Marca al menos un departamento.")
		.describe("Las claves de sus departamentos"),
};

/** Los errores de una cuenta nueva. */
const erroresDeCuentaNueva = [
	{ codigo: "persona_no_valida", mensaje: "Nadie de tienda entra al sistema de fábrica." },
	{ codigo: "persona_con_cuenta", mensaje: "Esa persona ya tiene cuenta." },
	{ codigo: "correo_con_cuenta", mensaje: "Ese correo ya tiene cuenta." },
	{ codigo: "correo_solicitado", mensaje: "Ya hay una solicitud para ese correo." },
	{ codigo: "departamento_no_asignable", mensaje: "La Puerta del taller entra con PIN." },
] as const;

/** La dueña da de alta una cuenta nueva, ya activa. */
export const crearCuenta = definirAccion({
	nombre: "admin.crear_cuenta",
	descripcion: "Da de alta una cuenta de Google ya activa, ligada a su persona y con sus departamentos",
	entrada: z.object(cuentaNueva),
	salida: z.object({ usuario_id: z.uuid().describe("La cuenta nueva") }),
	permiso: { departamento: "admin", soloDuena: true, confirmarConGoogle: "crear_cuenta" },
	errores: [...erroresDeCuentaNueva],
});

/** La oficina pide una cuenta: nace solicitada y su autorización AU- llega a la dueña. */
export const pedirCuenta = definirAccion({
	nombre: "admin.pedir_cuenta",
	descripcion: "Pide una cuenta de Google para una persona; la decide la dueña como alta de usuario",
	entrada: z.object({
		...cuentaNueva,
		para_que: z.string().trim().max(80).optional().describe("Para qué la necesita, hasta 80 letras"),
	}),
	salida: z.object({
		usuario_id: z.uuid().describe("La cuenta solicitada"),
		autorizacion_id: z.uuid().describe("La autorización AU-"),
		folio: z.string().describe("El folio AU-"),
	}),
	permiso: { departamento: "admin" },
	errores: [
		{ codigo: "la_duena_da_de_alta", mensaje: "Tú das la cuenta directo con «Cuenta nueva»." },
		...erroresDeCuentaNueva,
	],
});

/** La dueña le quita el acceso a una cuenta: cierra sus sesiones y le da de baja sus departamentos y permisos. */
export const quitarAcceso = definirAccion({
	nombre: "admin.quitar_acceso",
	descripcion: "Le quita el acceso a una cuenta: sus sesiones se cierran al momento",
	entrada: z.object({
		usuario_id: z.uuid().describe("La cuenta"),
		motivo: z.string().trim().max(80).optional().describe("Por qué"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true, confirmarConGoogle: "quitar_acceso" },
	errores: [esLaDuena, cuentaNoActiva],
	edita: true,
});

/** Lo que cambia de una cuenta: lo que recibe y lo que deja. */
const cambioDeDepartamentos = z.object({
	usuario_id: z.uuid().describe("La cuenta"),
	version: z.number().int().nonnegative().describe("La versión de la cuenta que se leyó"),
	recibe: z.array(claveDeDepartamento).describe("Los departamentos que se le dan"),
	deja: z.array(claveDeDepartamento).describe("Los departamentos que se le quitan"),
});

/** La dueña cambia los departamentos de una o varias cuentas. */
export const cambiarDepartamentos = definirAccion({
	nombre: "admin.cambiar_departamentos",
	descripcion: "Cambia los departamentos de una o varias cuentas: el menú les cambia al momento",
	entrada: z.object({
		cambios: z.array(cambioDeDepartamentos).min(1).describe("Por cuenta, lo que recibe y lo que deja"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true, confirmarConGoogle: "cambiar_departamentos" },
	errores: [
		{ codigo: "sin_cambios", mensaje: "No hay cambios por guardar." },
		{ codigo: "es_la_duena", mensaje: "La dueña tiene todos los departamentos." },
		cuentaNoActiva,
		{
			codigo: "sin_departamentos",
			mensaje: "Esa cuenta se quedaría sin departamentos. Para quitarle todo, usa «Quitar acceso».",
		},
		soporteSinDinero,
		{ codigo: "departamento_no_asignable", mensaje: "La Puerta del taller entra con PIN." },
	],
});

/** La dueña da o quita un permiso fino a una cuenta. */
export const cambiarPermisoFino = definirAccion({
	nombre: "admin.cambiar_permiso_fino",
	descripcion: "Da o quita a una cuenta «ven sueldos y tarifas» o «imprime guías»",
	entrada: z.object({
		usuario_id: z.uuid().describe("La cuenta"),
		permiso: z.enum(permisosFinosDeCuenta).describe("El permiso fino"),
		tiene: z.boolean().describe("Si lo tiene después del cambio"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true, confirmarConGoogle: "cambiar_permiso_fino" },
	errores: [
		{ codigo: "es_la_duena", mensaje: "La casilla de la dueña no se puede quitar." },
		cuentaNoActiva,
		soporteSinDinero,
	],
	edita: true,
});

/** Sale del sistema: cierra la sesión de quien llama. */
export const salir = definirAccion({
	nombre: "admin.salir",
	descripcion: "Cierra la sesión de quien llama y borra su cookie",
	entrada: z.object({}),
	salida: z.object({}),
	permiso: {},
	cierraLaSesion: true,
});

/** Cierra sesiones de la propia cuenta: una, o todas las demás. */
export const cerrarMiSesion = definirAccion({
	nombre: "admin.cerrar_mi_sesion",
	descripcion: "Cierra una sesión de la propia cuenta, o todas las demás",
	entrada: z.object({
		sesion_id: z.uuid().optional().describe("La sesión que se cierra"),
		todas_las_demas: z.boolean().optional().describe("Cierra todas menos la de esta pantalla"),
	}),
	salida: z.object({ cerradas: z.number().int().describe("Cuántas sesiones cerró") }),
	permiso: {},
});

/** Administración del sistema cierra las sesiones abiertas de otra cuenta; las de la dueña, solo ella. */
export const cerrarSesiones = definirAccion({
	nombre: "admin.cerrar_sesiones",
	descripcion: "Cierra las sesiones abiertas de una cuenta; las de la dueña solo las cierra ella",
	entrada: z.object({ usuario_id: z.uuid().describe("La cuenta") }),
	salida: z.object({ cerradas: z.number().int().describe("Cuántas sesiones cerró") }),
	permiso: { departamento: "admin" },
	errores: [{ codigo: "sin_sesiones_abiertas", mensaje: "Esa cuenta no tiene sesiones abiertas." }],
});
