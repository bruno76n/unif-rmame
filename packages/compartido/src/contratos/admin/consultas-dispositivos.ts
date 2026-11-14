/**
 * Los contratos de las consultas de Dispositivos: `admin.dispositivos` (los registrados y los revocados),
 * `admin.codigo_registro` (si el código ya se canjeó, para la ventana «Registrar dispositivo») y
 * `admin.comandos_apartados` (lo que subió un aparato y no se pudo aplicar).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Dispositivos» y «Ventanas») y docs/modulos/admin/dispositivos.md
 *
 * Nunca viaja una llave ni su hash: solo su parte pública, como se lee («k1·a8f2»).
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { tiposQueSeRegistran } from "./dispositivos.ts";

/** Una ubicación donde se registra un aparato, con el tipo que le toca. */
const dondeSeUsa = z.object({
	ubicacion_id: z.uuid(),
	nombre: z.string().describe("«Taller», «Aduana»"),
	tipo: z
		.enum(tiposQueSeRegistran)
		.describe("El aparato que va ahí: la tablet en el Taller, el teléfono en Aduana o Bodega"),
	con_impresora: z.boolean().describe("Si ahí hay una impresora sin baja: puede llevar un programa de impresión"),
});

export const dispositivosDeAdmin = definirConsulta({
	nombre: "admin.dispositivos",
	descripcion:
		"Dispositivos: los aparatos registrados con su última sincronización, su llave, su versión y sus apartados, y los revocados",
	entrada: z.object({}),
	salida: z.object({
		puede: z
			.object({
				registrar: z.boolean().describe("«Registrar dispositivo» (`admin.generar_codigo_registro`)"),
				revocar: z.boolean().describe("«Revocar» (`admin.revocar_dispositivo`)"),
			})
			.describe("Lo que quien ve puede hacer aquí: solo la dueña registra y revoca"),
		registrados: z.array(
			z.object({
				dispositivo_id: z.uuid(),
				version: z.number().int(),
				nombre: z.string(),
				registrado: z.string().describe("«Registrado el 2 ago 2026»"),
				tipo: z.string().describe("El tipo, para la ventana de revocar"),
				tipo_texto: z.string().describe("«Tablet del taller», «Teléfono para escanear», «Programa de impresión»"),
				ubicacion: z.string().nullable(),
				sincronizacion: z.object({
					texto: z.string().describe("«hace 5 min», «Último contacto hace 2 h», «No sincroniza» o «Nunca»"),
					tono: z
						.enum(["verde", "rojo", "ninguno"])
						.describe("El punto: rojo pasadas `admin.horas_sin_sincronizar_aviso`"),
				}),
				llave_id: z.string().describe("Su parte pública, «k1·a8f2»"),
				version_app: z.string().nullable(),
				reloj_desfasado: z.boolean().describe("Más de `sync.minutos_reloj_desfasado` de diferencia"),
				apartados: z.number().int().describe("Los comandos apartados sin descartar"),
				pendientes_por_subir: z.number().int().describe("Lo que dice tener en su cola"),
			}),
		),
		revocados: z.array(
			z.object({
				dispositivo_id: z.uuid(),
				nombre: z.string(),
				llave_id: z.string().describe("Su parte pública"),
				revocado: z.string().describe("«9 oct»"),
				motivo: z.string(),
				despues_de_revocar: z.number().int().describe("Lo que llegó después de revocarlo"),
			}),
		),
		donde_se_usa: z.array(dondeSeUsa).describe("Las opciones de «Dónde se usa» al registrar"),
		vigencia_codigo_min: z.number().int().describe("`admin.codigo_registro_vigencia_min`"),
	}),
	permiso: { departamento: "admin" },
});

export const codigoRegistroDeAdmin = definirConsulta({
	nombre: "admin.codigo_registro",
	descripcion: "Cómo va un código de registro: si sigue vigente, venció, se canceló o ya nació su aparato",
	entrada: z.object({ codigo_registro_id: z.uuid().describe("El código") }),
	salida: z.object({
		estado: z.enum(["vigente", "vencido", "canjeado", "cancelado"]),
		nombre: z.string().describe("El nombre que se le dio al aparato"),
		dispositivo_id: z.uuid().nullable().describe("El aparato que nació, si ya se canjeó"),
	}),
	permiso: { departamento: "admin", soloDuena: true },
});

export const comandosApartadosDeAdmin = definirConsulta({
	nombre: "admin.comandos_apartados",
	descripcion: "Lo que subió un aparato y no se pudo aplicar, el más nuevo arriba, con sus reintentos",
	entrada: z.object({
		dispositivo_id: z.uuid().describe("El aparato"),
		incluir_descartados: z.enum(["si", "no"]).optional().describe("«si» para ver también los descartados"),
		...parametrosDePagina(50),
	}),
	salida: z.object({
		nombre: z.string().describe("El nombre del aparato"),
		puede_descartar: z.boolean().describe("«Descartar» (`admin.descartar_comando_apartado`): solo la dueña"),
		...paginaDe(
			z.object({
				comando_id: z.uuid(),
				cuando: z.string().describe("Cuándo pasó en el aparato: «9 oct · 14:20»"),
				accion: z.string().describe("La acción que mandó"),
				motivo: z.string().describe("Por qué se apartó"),
				persona: z.string().nullable().describe("Quién lo hizo en el aparato"),
				reintentos: z.number().int(),
				descartado: z.string().nullable().describe("«Descartado: {motivo}», si ya se descartó"),
			}),
		),
	}),
	permiso: { departamento: "admin" },
});
