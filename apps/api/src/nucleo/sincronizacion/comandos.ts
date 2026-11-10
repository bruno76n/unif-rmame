/**
 * Un comando de un aparato: revisar su alcance y su forma, aplicarlo con la hora en que pasó, guardarlo y
 * reintentar el que quedó apartado.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Subir · `POST /v1/sync/subir`») y docs/modulos/admin/dispositivos.md
 * («`admin.reintentar_comando_apartado`»)
 *
 * El servidor acepta todo lo que ya pasó: solo aparta lo que no puede aplicar (fuera de su alcance, mal
 * formado, el documento que todavía no llega, la regla que no deja). Lo que no cuadra se aplica igual y
 * abre su excepción. La acción corre en un `SAVEPOINT`: si se aparta, no queda nada de lo que hizo, pero sí
 * el comando con su carga para revisarlo o reintentarlo.
 */

import { pareceSecreto } from "@uniformame/compartido/contratos/definir";
import { respuestaDeComando } from "@uniformame/compartido/contratos/sincronizacion";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { comandosRecibidos, dispositivos } from "../../modulos/admin/tablas.ts";
import { tipoQueLlama } from "../acceso/llave.ts";
import type { AparatoQueLlama } from "../acceso/quien.ts";
import { recorteComun } from "../acceso/recorte.ts";
import { aplicarAccion, crearContexto, type ServiciosDelCorredor } from "../acciones/corredor.ts";
import type { Almacen } from "../almacen.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion, type Transaccion } from "../base/transacciones.ts";
import { ErrorDeApi, FaltaDocumento } from "../http/errores.ts";
import { camposDeZod } from "../http/validacion.ts";
import { huellaDeCarga, sinSecretos } from "../idempotencia/claves.ts";
import type { RegistroDeModulos, RenglonDeBitacora } from "../modulos.ts";

/** La carga de un comando: lo que guardó el aparato en su cola, sin su clave. */
export const cargaDeComando = z.object({
	accion: z.string(),
	datos: z.unknown(),
	ocurrido_en: z.string(),
	persona_id: z.uuid().optional(),
	codigo_usado: z.string().optional(),
});

/** La carga de un comando. */
export type CargaDeComando = z.infer<typeof cargaDeComando>;

/** La respuesta a un comando, sin su clave: así se guarda en `comandos_recibidos`. */
const respuestaGuardada = respuestaDeComando.omit({ clave_idempotencia: true });

/** La respuesta a un comando, sin su clave. */
export type RespuestaSinClave = z.infer<typeof respuestaGuardada>;

/** Lo que necesita un comando: los módulos, la bitácora y los eventos, y el almacén. */
export interface DependenciasDeComandos {
	registro: RegistroDeModulos;
	servicios: ServiciosDelCorredor;
	almacen?: Almacen;
}

/** Lo que pasó al aplicar un comando: la respuesta que se contesta, la que se guarda y lo que tocó. */
interface ComandoHecho {
	respuesta: RespuestaSinClave;
	guardada: RespuestaSinClave;
	motivo: string | null;
	esperaEntidadId: string | null;
	entidad: { nombre: string; id: string } | undefined;
	excepcionId: string | null;
}

/** El motivo del apartado de lo que llegó con una clave ya usada y otros datos. */
export const motivoDeClaveRepetida = "clave_repetida_con_otros_datos";

/** El nombre con que la subida escribe en la bitácora lo que no es de una acción. */
export const accionDeLaSubida = "admin.subir";

/**
 * Un comando apartado: no se aplicó nada.
 * @param motivo Por qué (`fuera_de_alcance`, `mal_formado`, `falta_documento` o el código de la regla).
 * @param extra El documento que espera, los campos mal formados y los avisos.
 */
function apartado(
	motivo: string,
	extra: { esperaEntidadId?: string; campos?: Record<string, string>; avisos?: string[] } = {},
): ComandoHecho {
	const respuesta: RespuestaSinClave = {
		resultado: "apartado",
		datos: null,
		entidad: null,
		excepciones: [],
		motivo,
		espera_entidad_id: extra.esperaEntidadId ?? null,
		campos: extra.campos ?? null,
		avisos: extra.avisos ?? [],
	};
	return {
		respuesta,
		guardada: respuesta,
		motivo,
		esperaEntidadId: extra.esperaEntidadId ?? null,
		entidad: undefined,
		excepcionId: null,
	};
}

/** El motivo de lo que llega de un aparato revocado y pasó antes de revocarlo: queda retenido. */
export const motivoDeRetenido = "dispositivo_revocado";

/**
 * Lo que llegó de un aparato revocado no se aplica: lo que pasó antes de revocarlo queda retenido (se
 * contesta `excepcion`: la dueña lo aplica o Bodega lo resuelve, fase 9); lo de después se aparta con
 * `despues_de_revocar`. Ninguna de las dos cosas se pierde: su carga se guarda.
 * @param ocurridoEn Cuándo pasó.
 * @param revocadoEn Cuándo se revocó el aparato.
 */
export function deUnRevocado(ocurridoEn: string, revocadoEn: string): ComandoHecho {
	if (Temporal.Instant.compare(Temporal.Instant.from(ocurridoEn), Temporal.Instant.from(revocadoEn)) >= 0) {
		return apartado("despues_de_revocar");
	}
	const respuesta: RespuestaSinClave = {
		resultado: "excepcion",
		datos: null,
		entidad: null,
		excepciones: [],
		motivo: motivoDeRetenido,
		espera_entidad_id: null,
		campos: null,
		avisos: [],
	};
	return { respuesta, guardada: respuesta, motivo: null, esperaEntidadId: null, entidad: undefined, excepcionId: null };
}

/**
 * Aplica un comando de un aparato, con la hora en que pasó y a nombre de su persona.
 * @param dependencias Los módulos, la bitácora y los eventos, y el almacén.
 * @param transaccion La transacción del comando: la acción corre en un `SAVEPOINT` de ella.
 * @param aparato El aparato, con quien lo hizo.
 * @param carga El comando como lo guardó el aparato.
 * @param comandoId El id del comando en `comandos_recibidos`: lo llevan su bitácora y sus eventos.
 * @param ajustarBitacora Cambia cada renglón de bitácora de la acción (el reintento dice quién lo reintentó).
 * @returns Lo que pasó: aplicado, excepción o apartado, con su respuesta.
 * @throws Un error del servidor (no del comando): la tanda se detiene.
 */
export async function aplicarComando(
	dependencias: DependenciasDeComandos,
	transaccion: Transaccion,
	aparato: AparatoQueLlama,
	carga: CargaDeComando,
	comandoId: string,
	ajustarBitacora?: (renglon: RenglonDeBitacora) => RenglonDeBitacora,
): Promise<ComandoHecho> {
	const accion = dependencias.registro.acciones.get(carga.accion);
	// Paso 2: lo que no está en el alcance de su tipo de aparato, o no sube por la cola (solo en línea).
	const { permiso } = accion?.contrato ?? {};
	if (accion === undefined || permiso?.cola !== true || !(permiso.aparatos ?? []).includes(aparato.tipoDeAparato)) {
		return apartado("fuera_de_alcance");
	}
	// Paso 3: la forma del contrato de su acción.
	const forma = accion.contrato.entrada.safeParse(carga.datos);
	if (!forma.success) return apartado("mal_formado", { campos: camposDeZod(forma.error) });
	// Pasos 5 y 6: la acción, con la hora en que pasó; si no puede, no queda nada de lo que hizo.
	try {
		const { respuesta, salida } = await enTransaccion(transaccion, (puntoDeGuardado) =>
			aplicarAccion(
				dependencias,
				puntoDeGuardado,
				{
					accion,
					quien: aparato,
					datos: carga.datos,
					version: undefined,
					ahora: Temporal.Instant.from(carga.ocurrido_en),
					comandoId,
				},
				ajustarBitacora,
			),
		);
		const recortar = (resultado: Record<string, unknown>) =>
			recorteComun(aparato, resultado, dependencias.registro.camposDeSueldo).objeto;
		const sinElSecreto = z
			.object({ resultado: z.record(z.string(), z.unknown()) })
			.parse(sinSecretos(respuesta, accion.contrato.secretos));
		const comun = {
			resultado: salida.excepcion === undefined ? ("aplicado" as const) : ("excepcion" as const),
			entidad: salida.entidad === undefined ? null : { tabla: salida.entidad.nombre, id: salida.entidad.id },
			excepciones: salida.excepcion === undefined ? [] : [salida.excepcion],
			motivo: null,
			espera_entidad_id: null,
			campos: null,
			avisos: respuesta.avisos,
		};
		return {
			respuesta: { ...comun, datos: recortar(respuesta.resultado) },
			guardada: { ...comun, datos: recortar(sinElSecreto.resultado) },
			motivo: null,
			esperaEntidadId: null,
			entidad: salida.entidad,
			excepcionId: salida.excepcion?.id ?? null,
		};
	} catch (error) {
		if (error instanceof FaltaDocumento) return apartado("falta_documento", { esperaEntidadId: error.entidadId });
		// Lo que la acción no deja (una regla, algo que no existe) se aparta con su código; lo del servidor, no.
		if (error instanceof ErrorDeApi && error.estado < 500) {
			return apartado(error.codigo ?? error.error, { avisos: [error.message] });
		}
		throw error;
	}
}

/**
 * La huella de un comando de aparato: su acción, sus datos, cuándo pasó, quién y con qué código.
 * @param carga El comando.
 */
export function huellaDeComando(carga: CargaDeComando): string {
	const { accion, ...contenido } = carga;
	return huellaDeCarga(accion, contenido, undefined);
}

/**
 * Lo que se contesta a un comando que ya llegó con la misma huella: su respuesta guardada, como `repetido`
 * (o la del apartado, si sigue apartado: el aparato lo marca otra vez).
 * @param guardada La respuesta guardada.
 */
export function respuestaRepetida(guardada: unknown): RespuestaSinClave {
	const respuesta = respuestaGuardada.parse(guardada);
	return respuesta.resultado === "apartado" ? respuesta : { ...respuesta, resultado: "repetido" };
}

/**
 * Quita de un valor, a cualquier profundidad, los campos con nombre de secreto. Lo que sube por la cola no
 * los lleva (`definirAccion` lo revisa), pero lo que llega fuera de alcance puede traer cualquier cosa, y su
 * carga se guarda: un secreto nunca queda en claro en la base.
 * @param valor Los datos del comando.
 */
function sinCamposSecretos(valor: unknown): unknown {
	if (Array.isArray(valor)) return valor.map(sinCamposSecretos);
	if (typeof valor !== "object" || valor === null) return valor;
	return Object.fromEntries(
		Object.entries(valor)
			.filter(([campo]) => !pareceSecreto(campo))
			.map(([campo, interior]) => [campo, sinCamposSecretos(interior)]),
	);
}

/**
 * Guarda el comando con lo que pasó: su renglón de `comandos_recibidos`, con su carga si se apartó o abrió
 * una excepción.
 * @param transaccion La transacción del comando.
 * @param comando El id, la clave, el aparato, la carga, su huella y lo que pasó.
 */
export async function guardarComando(
	transaccion: Transaccion,
	comando: {
		id: string;
		clave: string;
		aparato: AparatoQueLlama;
		carga: CargaDeComando;
		hecho: ComandoHecho;
		/** Llegó de un aparato ya revocado. */
		revocado: boolean;
	},
): Promise<void> {
	const { hecho, carga } = comando;
	const resultado =
		hecho.respuesta.resultado === "excepcion" ? "excepcion" : hecho.motivo === null ? "aplicado" : "apartado";
	await transaccion.insert(comandosRecibidos).values({
		id: comando.id,
		claveIdempotencia: comando.clave,
		origen: "aparato",
		dispositivoId: comando.aparato.dispositivoId,
		personaId: carga.persona_id ?? null,
		tipoComando: carga.accion,
		ocurridoEn: carga.ocurrido_en,
		cargaHash: huellaDeComando(carga),
		// La huella ya se tomó con la carga completa; lo que se guarda va sin secretos.
		carga: resultado === "aplicado" ? null : { ...carga, datos: sinCamposSecretos(carga.datos) },
		resultado,
		motivoApartado: hecho.motivo,
		esperaEntidadId: hecho.esperaEntidadId,
		excepcionId: hecho.excepcionId,
		entidad: hecho.entidad?.nombre ?? null,
		entidadId: hecho.entidad?.id ?? null,
		respuesta: hecho.guardada,
		dispositivoRevocado: comando.revocado,
	});
}

/**
 * Escribe en la bitácora lo que llegó con una clave ya usada y otros datos: no deja renglón nuevo en
 * `comandos_recibidos`, pero se ve.
 * @param dependencias Los módulos y la bitácora.
 * @param transaccion La transacción del comando.
 * @param aparato El aparato y su nombre.
 * @param accion La acción que traía.
 * @param ahora La hora de la subida.
 */
export async function anotarClaveRepetida(
	dependencias: DependenciasDeComandos,
	transaccion: Transaccion,
	aparato: { quien: AparatoQueLlama; nombre: string },
	accion: string,
	ahora: Temporal.Instant,
): Promise<void> {
	const { contexto } = crearContexto(
		dependencias.registro,
		transaccion,
		aparato.quien,
		accionDeLaSubida,
		ahora,
		undefined,
	);
	await dependencias.servicios.escribirBitacora(contexto, [
		{
			descripcion: `Llegó de ${aparato.nombre} un comando con una clave ya usada y otros datos (${accion})`,
			entidad: "dispositivos",
			entidadId: aparato.quien.dispositivoId,
		},
	]);
}

/**
 * Vuelve a correr un comando apartado por el mismo camino de la subida: con su hora, su persona y su código
 * de origen, a nombre del mismo aparato. Suma el reintento; si se aplica, el comando pasa a `aplicado` o
 * `excepcion` con su respuesta nueva, que es la que recibe el aparato si vuelve a mandar esa clave.
 * @param dependencias Los módulos, la bitácora y los eventos.
 * @param transaccion La transacción del reintento.
 * @param comandoId El comando.
 * @param ajustarBitacora Cambia cada renglón de bitácora de la acción (quién lo reintentó).
 * @returns Lo que pasó, o `undefined` si el comando ya no está apartado, se descartó o es de un aparato
 * revocado.
 */
export async function reintentarComando(
	dependencias: DependenciasDeComandos,
	transaccion: Transaccion,
	comandoId: string,
	ajustarBitacora?: (renglon: RenglonDeBitacora) => RenglonDeBitacora,
): Promise<ComandoHecho | undefined> {
	const [comando] = await transaccion
		.select({
			resultado: comandosRecibidos.resultado,
			descartadoEn: comandosRecibidos.descartadoEn,
			carga: comandosRecibidos.carga,
			dispositivoId: comandosRecibidos.dispositivoId,
			deUnRevocado: comandosRecibidos.dispositivoRevocado,
			tipo: dispositivos.tipo,
			revocadoEn: dispositivos.bajaEn,
		})
		.from(comandosRecibidos)
		.innerJoin(dispositivos, eq(dispositivos.id, comandosRecibidos.dispositivoId))
		.where(eq(comandosRecibidos.id, comandoId))
		.for("update", { of: comandosRecibidos });
	if (comando === undefined || comando.resultado !== "apartado" || comando.descartadoEn !== null) return undefined;
	// Lo de un aparato revocado no se reintenta: pudo estar en otras manos.
	if (comando.deUnRevocado || comando.revocadoEn !== null) return undefined;
	const carga = cargaDeComando.parse(comando.carga);
	const tipoDeAparato = tipoQueLlama[comando.tipo];
	if (comando.dispositivoId === null || tipoDeAparato === undefined) return undefined;
	const aparato: AparatoQueLlama = {
		tipo: "aparato",
		dispositivoId: comando.dispositivoId,
		tipoDeAparato,
		personaId: carga.persona_id,
	};
	const hecho = await aplicarComando(dependencias, transaccion, aparato, carga, comandoId, ajustarBitacora);
	const aplicado = hecho.motivo === null;
	await transaccion
		.update(comandosRecibidos)
		.set({
			reintentos: sql`${comandosRecibidos.reintentos} + 1`,
			ultimoReintentoEn: sql`now()`,
			respuesta: hecho.guardada,
			actualizadoEn: sql`now()`,
			...(aplicado
				? {
						resultado: hecho.respuesta.resultado === "excepcion" ? "excepcion" : "aplicado",
						entidad: hecho.entidad?.nombre ?? null,
						entidadId: hecho.entidad?.id ?? null,
						excepcionId: hecho.excepcionId,
					}
				: // Sigue apartado, quizá por otro motivo: si ya no espera un documento, deja de reintentarse solo.
					{ motivoApartado: hecho.motivo, esperaEntidadId: hecho.esperaEntidadId }),
		})
		.where(eq(comandosRecibidos.id, comandoId));
	return hecho;
}

/**
 * Reintenta, en el orden en que pasaron, los comandos apartados de un aparato que esperaban un documento que
 * ya llegó. Cada uno en su transacción.
 * @param dependencias Los módulos, la bitácora y los eventos.
 * @param base La base, o la transacción del reintento a mano (entonces cada uno va en un `SAVEPOINT`).
 * @param dispositivoId El aparato.
 * @param entidadId El documento que llegó.
 */
export async function reintentarLosQueEsperaban(
	dependencias: DependenciasDeComandos,
	base: Base | Transaccion,
	dispositivoId: string,
	entidadId: string,
): Promise<void> {
	const esperan = await base
		.select({ id: comandosRecibidos.id })
		.from(comandosRecibidos)
		.where(
			and(
				eq(comandosRecibidos.dispositivoId, dispositivoId),
				eq(comandosRecibidos.esperaEntidadId, entidadId),
				eq(comandosRecibidos.resultado, "apartado"),
				isNull(comandosRecibidos.descartadoEn),
			),
		)
		.orderBy(asc(comandosRecibidos.ocurridoEn), asc(comandosRecibidos.recibidoEn));
	for (const { id } of esperan) {
		const hecho = await enTransaccion(base, (transaccion) => reintentarComando(dependencias, transaccion, id));
		// Lo que se aplicó también puede ser el documento que esperaban otros.
		if (hecho?.entidad !== undefined)
			await reintentarLosQueEsperaban(dependencias, base, dispositivoId, hecho.entidad.id);
	}
}

/**
 * Reintenta los apartados de un aparato que esperaban un documento que ya llegó de ese mismo aparato (lo creó
 * o lo tocó un comando suyo que se aplicó): los que se quedaron esperando porque su reintento falló.
 * @param dependencias Los módulos, la bitácora y los eventos.
 * @param base La base.
 * @param dispositivoId El aparato.
 */
export async function reintentarLosQueYaTienenSuDocumento(
	dependencias: DependenciasDeComandos,
	base: Base,
	dispositivoId: string,
): Promise<void> {
	// Documento por documento, en el orden en que pasó el primer apartado que espera cada uno (y, si empatan,
	// en el que llegó); los de cada documento van en el orden en que pasaron.
	const { rows } = await base.execute(sql`
		SELECT a.espera_entidad_id::text AS entidad FROM comandos_recibidos a
		WHERE a.dispositivo_id = ${dispositivoId}::uuid AND a.resultado = 'apartado'
			AND a.motivo_apartado = 'falta_documento' AND a.espera_entidad_id IS NOT NULL AND a.descartado_en IS NULL
			AND EXISTS (
				SELECT 1 FROM comandos_recibidos c
				WHERE c.dispositivo_id = a.dispositivo_id AND c.entidad_id = a.espera_entidad_id AND c.resultado <> 'apartado'
			)
		GROUP BY a.espera_entidad_id
		ORDER BY min(a.ocurrido_en), min(a.recibido_en)`);
	for (const { entidad } of z.array(z.object({ entidad: z.string() })).parse(rows)) {
		await reintentarLosQueEsperaban(dependencias, base, dispositivoId, entidad);
	}
}
