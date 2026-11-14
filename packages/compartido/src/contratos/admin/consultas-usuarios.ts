/**
 * Los contratos de las consultas de las cuentas en Administración del sistema: `admin.usuarios` (Usuarios y accesos),
 * `admin.cuenta_nueva` (las opciones de «Cuenta nueva» y «Pedir cuenta nueva»), `admin.alta_usuario` (el cajón Alta
 * de usuario, solo la dueña) y `admin.pantalla_acceso` (la pestaña Pantalla de acceso).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Usuarios y accesos», «Pantalla de acceso», «Alta de usuario» y
 * «Ventanas») y docs/modulos/admin/cuentas.md
 *
 * Ninguna lleva dinero: son cuentas, departamentos y sesiones.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { clavesDeDepartamento } from "./cuentas.ts";
import { cuentaParaVer } from "./vistas.ts";

/** Un departamento como sale en la matriz y en las casillas: su clave, su nombre y su grupo del menú. */
const departamentoParaEscoger = z.object({
	clave: z.enum(clavesDeDepartamento),
	nombre: z.string(),
	grupo: z.string().nullable().describe("El grupo del menú; nulo en Dirección"),
});

export const usuariosDeAdmin = definirConsulta({
	nombre: "admin.usuarios",
	descripcion:
		"Usuarios y accesos: las cuentas activas con su ubicación, su última entrada, sus sesiones y sus departamentos, la cuenta de soporte y las altas pendientes",
	entrada: z.object({}),
	salida: z.object({
		puede: z
			.object({
				crear_cuenta: z.boolean().describe("«Cuenta nueva» (`admin.crear_cuenta`); si no, «Pedir cuenta nueva»"),
				revisar_altas: z.boolean().describe("«Revisar» en una alta pendiente (el cajón Alta de usuario)"),
				quitar_acceso: z.boolean().describe("«Quitar acceso» (`admin.quitar_acceso`)"),
				cambiar_departamentos: z.boolean().describe("Las casillas de la matriz (`admin.cambiar_departamentos`)"),
			})
			.describe("Lo que quien ve puede hacer aquí: solo la dueña cambia accesos"),
		cuentas: z.array(
			cuentaParaVer.extend({
				version: z.number().int().describe("La versión de la cuenta, para cambiarla"),
				es_duena: z.boolean(),
				ubicacion: z.string().describe("«Todas» la dueña; si no, el área de su persona"),
				ultima_entrada: z.string().describe("«hoy 7:58», «ayer 18:20», «2 oct 11:15» o «Nunca»"),
				sesiones_abiertas: z.number().int(),
				puede_cerrar_sesiones: z.boolean().describe("Las de la dueña solo las cierra ella"),
				departamentos: z.array(z.enum(clavesDeDepartamento)).describe("Sus departamentos vigentes"),
			}),
		),
		soporte: z
			.object({ nombre: z.string(), correo: z.string(), ultima_entrada: z.string() })
			.nullable()
			.describe("La cuenta de soporte técnico, el último renglón"),
		altas_pendientes: z.array(
			z.object({
				autorizacion_id: z.uuid(),
				texto: z.string().describe("«{persona} pidió: {lo que pidió}.»"),
			}),
		),
		departamentos: z.array(departamentoParaEscoger).describe("Los de la matriz, en el orden del menú"),
	}),
	permiso: { departamento: "admin" },
});

export const cuentaNuevaDeAdmin = definirConsulta({
	nombre: "admin.cuenta_nueva",
	descripcion:
		"Las opciones de «Cuenta nueva»: las personas activas de Personal sin cuenta que no son de tienda, y los departamentos que se dan en un alta",
	entrada: z.object({}),
	salida: z.object({
		puede_crear_cuenta: z
			.boolean()
			.describe("Si da la cuenta (`admin.crear_cuenta`, la dueña); si no, la pide (`admin.pedir_cuenta`)"),
		personas: z.array(
			z.object({
				persona_id: z.uuid(),
				texto: z.string().describe("«{E-} · {nombre} · {puesto}»"),
			}),
		),
		departamentos: z.array(departamentoParaEscoger).describe("Todos menos la Puerta del taller, que entra con PIN"),
	}),
	permiso: { departamento: "admin" },
});

export const altaUsuarioDeAdmin = definirConsulta({
	nombre: "admin.alta_usuario",
	descripcion: "El cajón Alta de usuario: lo que se pidió, a quién se liga y con qué correo entra",
	entrada: z.object({ autorizacion_id: z.uuid().describe("La autorización AU- de alta de usuario") }),
	salida: z.object({
		autorizacion_id: z.uuid(),
		folio: z.string().describe("Su folio AU-"),
		version: z.number().int().describe("La versión de la autorización, para decidirla"),
		por_autorizar: z.boolean().describe("Si todavía se puede decidir"),
		pidio: z.string().describe("Quién la pidió"),
		persona: z.string(),
		correo: z.string(),
		departamentos: z.string().describe("Sus nombres, separados por coma"),
		ubicacion: z.string().describe("El área de su persona"),
		para_que: z.string().describe("Lo que se pidió"),
		liga: z.string().describe("«Se liga a {E-} · {persona}, {puesto}.»"),
	}),
	permiso: { departamento: "admin", soloDuena: true },
});

export const pantallaAccesoDeAdmin = definirConsulta({
	nombre: "admin.pantalla_acceso",
	descripcion:
		"La pantalla de entrada como la ve la gente: la marca, los minutos sin actividad del saludo al volver de Google y las cuentas con acceso",
	entrada: z.object({}),
	salida: z.object({
		marca: z.string().describe("El nombre comercial de la empresa"),
		inactividad_min: z
			.number()
			.int()
			.describe("`admin.sesion_inactividad_min`: la sesión se cierra sola tras esos minutos sin actividad"),
		cuentas: z.array(cuentaParaVer).describe("Las cuentas con acceso"),
	}),
	permiso: { departamento: "admin" },
});
