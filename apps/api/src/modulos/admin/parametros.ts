/**
 * Los parámetros que declara `admin`: los generales que usan todos, si cada aviso va por correo, las
 * versiones mínimas de cada app, cuánto se guardan los eventos y cada cuánto se apunta una consulta sensible.
 * Fase 4 · docs/modulos/admin/configuracion.md («Parámetros»), docs/cimientos/API.md,
 * docs/cimientos/EVENTOS-Y-TRABAJOS.md («Parámetros»), docs/modulos/admin/bitacora.md,
 * docs/modulos/admin/avisos.md y docs/modulos/admin/archivos.md («Parámetros»)
 */

import { type DefinicionDeParametro, semillaDeParametros } from "../../nucleo/parametros.ts";

/** Si cada tipo de aviso del núcleo va también por correo, al inicio (docs/modulos/admin/avisos.md). */
const correoPorTipo: readonly [string, string, boolean][] = [
	["autorizacion_pedida", "Autorización pedida", true],
	["autorizacion_decidida", "Autorización decidida", false],
	["alerta_seguridad", "Alerta de seguridad", true],
	["dispositivo_sin_sincronizar", "Aparato sin sincronizar", true],
	["alerta_direccion", "Alerta de Dirección", false],
	["restauracion_por_probar", "Prueba de restauración", true],
	["respaldo_fallido", "Respaldo fallido", true],
	["pin_bloqueado", "PIN bloqueado", false],
	["trabajo_fallido", "Trabajo fallido", true],
];

/** Los parámetros de `admin`, con su valor inicial. */
export const parametrosDeAdmin: readonly DefinicionDeParametro[] = [
	...correoPorTipo.map(
		([tipo, nombre, inicial], i): DefinicionDeParametro => ({
			clave: `avisos.correo_${tipo}`,
			seccion: "parametro",
			nombre: `Correo: ${nombre}`,
			explicacion: "Si este aviso también llega por correo",
			tipo: "booleano",
			inicial,
			orden: 100 + i,
		}),
	),
	{
		clave: "general.largo_minimo_motivo",
		seccion: "parametro",
		nombre: "Largo mínimo de un motivo",
		explicacion: "Lo mínimo que se escribe al cancelar, dar de baja, ajustar o rechazar",
		tipo: "entero",
		unidad: "letras",
		inicial: 5,
		minimo: 1,
		orden: 10,
	},
	{
		clave: "general.dias_de_trabajo",
		seccion: "parametro",
		nombre: "Días de trabajo",
		explicacion: "Los días hábiles de la fábrica, del 1 (lunes) al 7 (domingo), separados por coma",
		tipo: "texto",
		inicial: "1,2,3,4,5,6",
		orden: 20,
	},
	{
		clave: "admin.version_minima_web",
		seccion: "tecnico",
		nombre: "Versión mínima de la web",
		explicacion: "La versión más vieja de la web que se acepta",
		tipo: "texto",
		inicial: "1.0.0",
		orden: 900,
	},
	{
		clave: "admin.version_minima_tablet",
		seccion: "tecnico",
		nombre: "Versión mínima de la tablet",
		explicacion: "La versión más vieja de la tablet del taller que se acepta",
		tipo: "texto",
		inicial: "1.0.0",
		orden: 910,
	},
	{
		clave: "admin.version_minima_puente",
		seccion: "tecnico",
		nombre: "Versión mínima del programa puente",
		explicacion: "La versión más vieja del programa puente que se acepta",
		tipo: "texto",
		inicial: "1.0.0",
		orden: 920,
	},
	{
		clave: "admin.minutos_consulta_sensible",
		seccion: "tecnico",
		nombre: "Minutos entre consultas sensibles",
		explicacion: "Cada cuánto se vuelve a apuntar la misma consulta sensible de la misma cuenta",
		tipo: "entero",
		unidad: "min",
		inicial: 10,
		minimo: 1,
		orden: 940,
	},
	{
		clave: "admin.archivo_tamano_max_mb",
		seccion: "tecnico",
		nombre: "Tamaño máximo de un archivo",
		explicacion: "El tamaño máximo de cualquier archivo que se sube",
		tipo: "entero",
		unidad: "MB",
		inicial: 20,
		minimo: 1,
		orden: 950,
	},
	{
		clave: "admin.minutos_enlace_archivo",
		seccion: "tecnico",
		nombre: "Minutos que vale un enlace a un archivo",
		explicacion: "Cuánto valen las direcciones firmadas de subida y de bajada",
		tipo: "entero",
		unidad: "min",
		inicial: 5,
		minimo: 1,
		orden: 960,
	},
	{
		clave: "admin.dias_guardar_eventos",
		seccion: "tecnico",
		nombre: "Días que se guardan los eventos",
		explicacion: "Cuánto se guardan los eventos ya procesados",
		tipo: "entero",
		unidad: "días",
		inicial: 90,
		minimo: 1,
		orden: 930,
	},
];

/** La siembra de los parámetros de `admin`. */
export const semillaDeParametrosDeAdmin = semillaDeParametros("admin", parametrosDeAdmin);
