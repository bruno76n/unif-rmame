/**
 * Los contratos de los aparatos registrados: el código de registro, su canje, revocar y rotar la llave.
 * Fase 6 · docs/modulos/admin/dispositivos.md («Acciones»)
 *
 * El canje no es una acción de `/v1/acciones`: el código es la credencial y no hay sesión ni llave. Su
 * entrada y su salida van aquí para que el aparato y la documentación usen la misma forma.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Los tipos que se registran desde la web; la caja llega con el POS y la credencial con uniformame.mx. */
export const tiposQueSeRegistran = ["tablet_taller", "telefono_escanear", "puente_impresion"] as const;

/** Un secreto de llave: 32 bytes al azar en base64url (43 letras). */
const secretoDeLlave = z
	.string()
	.regex(/^[A-Za-z0-9_-]{43}$/, "La llave tiene que ser de 32 bytes al azar en base64url.")
	.describe("32 bytes al azar en base64url que hizo el aparato");

/** La dueña genera el código de 10 minutos para registrar un aparato. */
export const generarCodigoRegistro = definirAccion({
	nombre: "admin.generar_codigo_registro",
	descripcion: "Genera el código con que se registra un aparato nuevo; sale una sola vez",
	entrada: z.object({
		nombre: z.string().trim().max(30).optional().describe("Como sale en pantalla; vacío es «Dispositivo»"),
		tipo: z.enum(tiposQueSeRegistran).describe("Qué aparato es"),
		ubicacion_id: z.uuid("Escoge dónde se usa.").describe("Dónde se usa"),
	}),
	salida: z.object({
		codigo_registro_id: z.uuid().describe("El código, para cancelarlo o esperar su canje"),
		codigo: z.string().optional().describe("El código en claro, «K7Q-422»: solo en la primera respuesta"),
		vence_en: z.string().describe("Cuándo vence"),
	}),
	permiso: { departamento: "admin", soloDuena: true, confirmarConGoogle: "generar_codigo_registro" },
	errores: [{ codigo: "ubicacion_no_corresponde", mensaje: "Ese aparato no va en esa ubicación." }],
	secretos: ["codigo"],
});

/** La dueña cancela un código que no se usó. */
export const cancelarCodigoRegistro = definirAccion({
	nombre: "admin.cancelar_codigo_registro",
	descripcion: "Cancela un código de registro que todavía no se canjea",
	entrada: z.object({ codigo_registro_id: z.uuid().describe("El código") }),
	salida: z.object({ dispositivo_id: z.uuid().optional().describe("Si ya se canjeó: el aparato que nació") }),
	permiso: { departamento: "admin", soloDuena: true },
	errores: [{ codigo: "codigo_no_vigente", mensaje: "Ese código ya se canjeó o se canceló." }],
});

/** Lo que manda el aparato al canjear su código. */
export const entradaDelCanje = z
	.object({
		codigo: z
			.string()
			.trim()
			.regex(/^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/, "Escribe el código de 6 letras.")
			.describe("El código que dio la dueña, con o sin guion"),
		tipo: z.enum(tiposQueSeRegistran).describe("El tipo de su programa"),
		secreto: secretoDeLlave,
		aparato: z.string().trim().max(60).optional().describe("«Android 14 · Samsung»"),
		version_app: z
			.string()
			.regex(/^\d+\.\d+\.\d+$/)
			.describe("La versión de su programa"),
	})
	.strict();

/** El cuerpo del canje: con su clave de idempotencia, como una acción. */
export const cuerpoDelCanje = z
	.object({
		clave_idempotencia: z.uuid().describe("La hace el aparato; la misma en cada reintento"),
		datos: entradaDelCanje,
	})
	.strict();

/** Lo que recibe el aparato al canjear. */
export const salidaDelCanje = z
	.object({
		dispositivo_id: z.uuid().describe("El aparato"),
		folio: z.string().describe("Su folio DV-"),
		tipo: z.string().describe("Su tipo"),
		ubicacion_id: z.uuid().nullable().describe("Su ubicación"),
		prefijo_folio: z.string().nullable().describe("El prefijo de los folios que numera, en la caja"),
		llave_id: z.string().describe("La parte pública de su llave"),
		intervalo_segundos: z.number().int().describe("Cada cuánto pregunta si no le llega un aviso"),
		mensaje: z.string().describe("El aviso de la pantalla"),
	})
	.strict();

/** La dueña revoca un aparato: deja de entrar al momento, y nada de su cola se tira. */
export const revocarDispositivo = definirAccion({
	nombre: "admin.revocar_dispositivo",
	descripcion: "Revoca un aparato: deja de entrar al momento y su cola sin subir no se pierde",
	entrada: z.object({
		dispositivo_id: z.uuid().describe("El aparato"),
		motivo: z.string().trim().min(5, "Escribe el motivo").max(60).describe("Por qué, de 5 a 60 letras"),
		anular_pines: z.boolean().optional().describe("En la tablet: si se perdió o la pudo usar alguien más"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true, confirmarConGoogle: "revocar_dispositivo" },
	errores: [{ codigo: "ya_revocado", mensaje: "Ese aparato ya está revocado." }],
	edita: true,
});

/**
 * Rota la llave. El aparato lo hace solo, con su llave vigente y su secreto nuevo; desde la web la dueña
 * solo rota la credencial de uniformame.mx, y recibe el secreto nuevo una sola vez.
 */
export const rotarLlave = definirAccion({
	nombre: "admin.rotar_llave",
	descripcion: "Cambia la llave de un aparato; la anterior vale durante la gracia",
	entrada: z.object({
		secreto_nuevo: secretoDeLlave.optional().describe("El aparato: su secreto nuevo"),
		dispositivo_id: z.uuid().optional().describe("La web: la credencial que se rota"),
		version: z.number().int().nonnegative().optional().describe("La web: la versión que se leyó"),
	}),
	salida: z.object({
		rotada_en: z.string().describe("Cuándo se rotó la llave"),
		secreto: z.string().optional().describe("La web: el secreto nuevo en claro, una sola vez"),
	}),
	permiso: {
		departamento: "admin",
		soloDuena: true,
		confirmarConGoogle: "rotar_llave",
		aparatos: ["tablet", "puente"],
	},
	errores: [
		{
			codigo: "solo_credencial",
			mensaje: "Los aparatos cambian su llave solos. Aquí solo se rota la credencial de uniformame.mx.",
		},
		{ codigo: "ya_revocado", mensaje: "Ese aparato ya está revocado." },
	],
	secretos: ["secreto"],
});
