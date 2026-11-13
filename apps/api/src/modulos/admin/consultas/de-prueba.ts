/**
 * Lo que comparten las pruebas de las consultas de Administración del sistema: pedir un alta de usuario como la
 * oficina, escribir una alerta de seguridad y registrar un respaldo y una restauración probada.
 * Fase 19 · docs/fases/19-web-principal.md («Criterios de terminado»)
 *
 * Lo usan también las pruebas de pantalla de Administración, contra la API de prueba con la muestra.
 */

import { v7 as uuidv7 } from "uuid";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa pedir un alta de prueba. */
export interface AltaDePrueba {
	autorizacionId: string;
	folio: string;
	usuarioId: string;
	personaId: string;
	persona: string;
	correo: string;
}

/**
 * Pide, como la cuenta de Administración del sistema, una cuenta con Calidad para una persona de la muestra que no
 * tiene cuenta ni es de tienda.
 * @param servidor El servidor de prueba.
 * @param cual Cuál de esas personas, en el orden de su folio (para que dos pruebas no pidan la misma).
 */
export async function pedirAltaDePrueba(servidor: ServidorDePrueba, cual: number): Promise<AltaDePrueba> {
	const { rows } = await servidor.base.dueno.query(
		`SELECT id, nombre FROM personas
		 WHERE area <> 'tienda' AND baja_en IS NULL
		   AND id NOT IN (SELECT persona_id FROM usuarios WHERE estado IN ('solicitada', 'activa') AND persona_id IS NOT NULL)
		 ORDER BY folio OFFSET $1 LIMIT 1`,
		[cual],
	);
	const persona = rows[0];
	if (persona === undefined) throw new Error("no quedan personas sin cuenta");
	const correo = `alta-${cual}-${Date.now()}@alameda.invalid`;
	const respuesta = await mandarAccion(
		servidor,
		"admin.pedir_cuenta",
		{ datos: { persona_id: persona.id, correo, departamentos: ["calidad"], para_que: "para revisar lotes" } },
		"admin",
	);
	if (respuesta.estado !== 200) throw new Error(`no se pudo pedir el alta: ${JSON.stringify(respuesta.cuerpo)}`);
	const resultado = respuesta.cuerpo.resultado as { autorizacion_id: string; folio: string; usuario_id: string };
	return {
		autorizacionId: resultado.autorizacion_id,
		folio: resultado.folio,
		usuarioId: resultado.usuario_id,
		personaId: String(persona.id),
		persona: String(persona.nombre),
		correo,
	};
}

/**
 * Escribe una alerta de seguridad en la bitácora, como la deja un intento de entrar sin acceso.
 * @param servidor El servidor de prueba.
 * @param correo El correo que intentó entrar.
 * @param haceMinutos Hace cuánto pasó.
 * @returns El id del renglón.
 */
export async function escribirAlertaDePrueba(
	servidor: ServidorDePrueba,
	correo: string,
	haceMinutos = 1,
): Promise<string> {
	const id = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO bitacora (id, ocurrido_en, tipo, es_alerta, modulo, origen, accion, descripcion, correo_intento)
		 VALUES ($1, now() - make_interval(mins => $2), 'acceso', true, 'admin', 'fabrica', 'admin.entrar_con_google', $3, $4)`,
		[id, haceMinutos, `Intentó entrar una cuenta de Google sin acceso: ${correo}`, correo],
	);
	return id;
}

/**
 * Registra un respaldo semanal correcto hace unos días, como lo deja el trabajo del worker.
 * @param servidor El servidor de prueba.
 * @param haceDias Hace cuántos días se hizo.
 * @returns El id del respaldo.
 */
export async function registrarRespaldoDePrueba(servidor: ServidorDePrueba, haceDias: number): Promise<string> {
	const id = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO respaldos (id, hecho_en, estado, tamano_bytes, cifrado, destino, sha256)
		 VALUES ($1, now() - make_interval(days => $2), 'correcto', 1932735283, true, 'r2://uniformame-respaldos/prueba', repeat('a', 64))`,
		[id, haceDias],
	);
	return id;
}

/**
 * Registra una restauración probada hace unos días, con su evidencia, sobre un respaldo.
 * @param servidor El servidor de prueba.
 * @param respaldoId El respaldo que se restauró.
 * @param haceDias Hace cuántos días se probó.
 * @param cuadro Si los conteos cuadraron.
 * @returns El id de la prueba.
 */
export async function registrarRestauracionDePrueba(
	servidor: ServidorDePrueba,
	respaldoId: string,
	haceDias: number,
	cuadro = true,
): Promise<string> {
	const archivo = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO archivos (id, proposito, modulo, entidad, nombre_original, tipo_mime, tamano_bytes, sha256, almacen_clave, subido_en)
		 VALUES ($1, 'evidencia_restauracion', 'admin', 'restauraciones_probadas', 'conteos.pdf', 'application/pdf', 1000, repeat('b', 64), $2, now())`,
		[archivo, `admin/prueba/${archivo}`],
	);
	const id = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO restauraciones_probadas (id, probada_en, tipo, respaldo_id, conteos_cuadraron, evidencia_archivo_id, creado_por)
		 VALUES ($1, now() - make_interval(days => $2), 'semanal_externo', $3, $4, $5, '01936f2e-0000-7000-8000-000000000001')`,
		[id, haceDias, respaldoId, cuadro, archivo],
	);
	return id;
}
