/**
 * Prueba de la subida de los aparatos: cada comando en su transacción, con lo que ya pasó aplicado,
 * repetido, apartado o con su excepción, y la tanda cortada con `detenido`.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md (parte 2)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaDePrueba, llaveDePrueba, quienesDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** Un comando de la cola de la tablet. */
interface Comando {
	clave_idempotencia: string;
	accion: string;
	datos: unknown;
	ocurrido_en: string;
	persona_id?: string;
}

/** La persona del taller que registra en la tablet de prueba. */
const lupita = "01936f2e-0000-7000-8000-00000000a001";

/**
 * Un comando de la tablet, con su clave nueva y la hora de hace un rato.
 * @param accion Su acción.
 * @param datos Sus datos.
 */
function comando(accion: string, datos: unknown, ocurridoEn = "2026-11-10T18:30:00Z"): Comando {
	return { clave_idempotencia: nuevaClave(), accion, datos, ocurrido_en: ocurridoEn, persona_id: lupita };
}

/** El id de la tablet de prueba. */
function tablet(): string {
	const quien = quienesDePrueba.tablet;
	if (quien?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
	return quien.dispositivoId;
}

describe("la subida aplica lo que ya pasó, aparta lo que no puede aplicar y nunca duplica", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La tablet sube una tanda. */
	async function subir(
		comandos: readonly Comando[],
		extra: { enviado_en?: string; pendientes_por_subir?: number; llave?: string } = {},
	) {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { authorization: extra.llave ?? llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
			payload: {
				enviado_en: extra.enviado_en ?? new Date().toISOString(),
				pendientes_por_subir: extra.pendientes_por_subir ?? comandos.length,
				comandos,
			},
		});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	/** El renglón de `comandos_recibidos` de una clave. */
	async function recibido(clave: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT resultado, motivo_apartado, espera_entidad_id, carga, persona_id, origen, dispositivo_id,
			        to_char(ocurrido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ocurrido_en, excepcion_id,
			        entidad, entidad_id, reintentos, respuesta
			 FROM comandos_recibidos WHERE clave_idempotencia = $1`,
			[clave],
		);
		return rows;
	}

	it("lo que ya pasó se aplica con su hora y su persona, a nombre del aparato", async () => {
		const lote = uuidv7();
		const abrir = comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-122" }, "2026-11-10T17:05:00Z");
		const { estado, cuerpo } = await subir([abrir]);
		expect(estado).toBe(200);
		expect(cuerpo).toMatchObject({ ok: true, detenido: false, revocado: false, hay_cambios: true });
		expect(cuerpo.respuestas).toEqual([
			{
				clave_idempotencia: abrir.clave_idempotencia,
				resultado: "aplicado",
				datos: { mensaje: "Lote abierto" },
				entidad: { tabla: "prueba_lotes", id: lote },
				excepciones: [],
				motivo: null,
				espera_entidad_id: null,
				campos: null,
				avisos: [],
			},
		]);
		expect(await recibido(abrir.clave_idempotencia)).toEqual([
			expect.objectContaining({
				resultado: "aplicado",
				origen: "aparato",
				dispositivo_id: tablet(),
				persona_id: lupita,
				ocurrido_en: "2026-11-10T17:05:00Z",
				carga: null,
			}),
		]);
		const bitacora = await servidor.base.dueno.query(
			"SELECT ocurrido_en, dispositivo_id, persona_id FROM bitacora WHERE entidad_id = $1",
			[lote],
		);
		expect(bitacora.rows).toEqual([
			{ ocurrido_en: new Date("2026-11-10T17:05:00Z"), dispositivo_id: tablet(), persona_id: lupita },
		]);
	});

	it("la misma clave con el mismo contenido es repetido y no escribe nada; con otros datos, apartado clave_repetida_con_otros_datos, sin renglón nuevo y en la bitácora", async () => {
		const lote = uuidv7();
		const abrir = comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-123" });
		await subir([abrir]);
		const otraVez = await subir([abrir]);
		expect(otraVez.cuerpo.respuestas).toEqual([
			expect.objectContaining({ resultado: "repetido", entidad: { tabla: "prueba_lotes", id: lote } }),
		]);
		const cambiado = { ...abrir, datos: { id: lote, nombre: "Otro nombre" } };
		const apartado = await subir([cambiado]);
		expect(apartado.cuerpo.respuestas).toEqual([
			expect.objectContaining({ resultado: "apartado", motivo: "clave_repetida_con_otros_datos", datos: null }),
		]);
		expect(await recibido(abrir.clave_idempotencia)).toHaveLength(1);
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM prueba_lotes WHERE id = $1", [
			lote,
		]);
		expect(rows[0]?.n).toBe(1);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'admin.subir' AND entidad_id = $1",
			[tablet()],
		);
		expect(bitacora.rows).toContainEqual({
			descripcion: "Llegó de Tablet del taller un comando con una clave ya usada y otros datos (prueba.abrir_lote)",
		});
	});

	it("un comando fuera del alcance de su tipo se aparta con fuera_de_alcance; uno mal formado, con mal_formado y sus campos; la cola sigue", async () => {
		const deVentas = comando("prueba.atender_bulto", { bulto_id: uuidv7() });
		const queNoExiste = comando("nada.inventado", {});
		const malFormado = comando("prueba.registrar_bulto", { id: uuidv7(), lote_id: uuidv7(), piezas: "muchas" });
		const lote = uuidv7();
		const despues = comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-124" });
		const { cuerpo } = await subir([deVentas, queNoExiste, malFormado, despues]);
		expect(cuerpo.respuestas.map((r: { resultado: string; motivo: string | null }) => [r.resultado, r.motivo])).toEqual(
			[
				["apartado", "fuera_de_alcance"],
				["apartado", "fuera_de_alcance"],
				["apartado", "mal_formado"],
				["aplicado", null],
			],
		);
		expect(cuerpo.respuestas[2].campos).toEqual({ piezas: expect.any(String) });
		const [guardado] = await recibido(malFormado.clave_idempotencia);
		expect(guardado).toMatchObject({
			resultado: "apartado",
			motivo_apartado: "mal_formado",
			carga: {
				accion: "prueba.registrar_bulto",
				datos: malFormado.datos,
				ocurrido_en: malFormado.ocurrido_en,
				persona_id: lupita,
			},
		});
		expect(await recibido(queNoExiste.clave_idempotencia)).toEqual([
			expect.objectContaining({ resultado: "apartado", motivo_apartado: "fuera_de_alcance" }),
		]);
	});

	it("lo que es solo en línea (rotar la llave, lo del puente) no entra por la cola: fuera_de_alcance, y su carga se guarda sin el secreto", async () => {
		const antes = await servidor.base.dueno.query(
			"SELECT llave_hash, llave_rotada_en FROM dispositivos WHERE id = $1",
			[tablet()],
		);
		const rotar = comando(
			"admin.rotar_llave",
			{ secreto_nuevo: "secreto-que-nunca-se-guarda".padEnd(43, "q") },
			"2035-01-01T00:00:00Z",
		);
		const { cuerpo } = await subir([rotar]);
		expect(cuerpo.respuestas[0]).toMatchObject({ resultado: "apartado", motivo: "fuera_de_alcance" });
		const despues = await servidor.base.dueno.query(
			"SELECT llave_hash, llave_rotada_en FROM dispositivos WHERE id = $1",
			[tablet()],
		);
		expect(despues.rows).toEqual(antes.rows);
		const [guardado] = await recibido(rotar.clave_idempotencia);
		expect(guardado?.carga).toEqual({
			accion: "admin.rotar_llave",
			datos: {},
			ocurrido_en: "2035-01-01T00:00:00Z",
			persona_id: lupita,
		});
		expect(JSON.stringify(guardado)).not.toContain("secreto-que-nunca");
		// El puente no sincroniza: lo suyo es en línea.
		const delPuente = await subir([comando("admin.trabajos_impresion", {})], { llave: llaveDePrueba("otro_puente") });
		expect(delPuente.cuerpo.respuestas[0]).toMatchObject({ resultado: "apartado", motivo: "fuera_de_alcance" });
	});

	it("lo que no cuadra se aplica igual y contesta excepcion; la regla que no deja se aparta con su código", async () => {
		const lote = uuidv7();
		const bulto = uuidv7();
		const { cuerpo } = await subir([
			comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-125" }),
			comando("prueba.registrar_bulto", { id: bulto, lote_id: lote, piezas: 140 }),
		]);
		const excepcion = cuerpo.respuestas[1];
		expect(excepcion).toMatchObject({
			resultado: "excepcion",
			entidad: { tabla: "prueba_bultos", id: bulto },
			excepciones: [{ id: expect.any(String), codigo: "no_cuadra" }],
		});
		const [guardado] = await recibido(excepcion.clave_idempotencia);
		expect(guardado).toMatchObject({
			resultado: "excepcion",
			excepcion_id: excepcion.excepciones[0].id,
			carga: expect.objectContaining({ accion: "prueba.registrar_bulto" }),
		});
		await mandarAccion(servidor, "prueba.cerrar_lote", { datos: { lote_id: lote } });
		const cerrado = await subir([comando("prueba.registrar_bulto", { id: uuidv7(), lote_id: lote, piezas: 10 })]);
		expect(cerrado.cuerpo.respuestas[0]).toMatchObject({
			resultado: "apartado",
			motivo: "lote_cerrado",
			avisos: ["Ese lote ya se cerró."],
		});
	});

	it("una cancelación que llega tarde (lo atendido) responde excepcion con cancelacion_tardia, no apartado", async () => {
		const lote = uuidv7();
		const bulto = uuidv7();
		await subir([
			comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-126" }),
			comando("prueba.registrar_bulto", { id: bulto, lote_id: lote, piezas: 20 }),
		]);
		expect((await mandarAccion(servidor, "prueba.atender_bulto", { datos: { bulto_id: bulto } })).estado).toBe(200);
		const { cuerpo } = await subir([comando("prueba.cancelar_bulto", { bulto_id: bulto })]);
		expect(cuerpo.respuestas[0]).toMatchObject({
			resultado: "excepcion",
			excepciones: [{ codigo: "cancelacion_tardia" }],
		});
	});

	it("un comando que espera un documento se aparta con falta_documento y se aplica solo cuando ese documento llega", async () => {
		const lote = uuidv7();
		const primero = comando(
			"prueba.registrar_bulto",
			{ id: uuidv7(), lote_id: lote, piezas: 5 },
			"2026-11-10T18:00:00Z",
		);
		const segundo = comando(
			"prueba.registrar_bulto",
			{ id: uuidv7(), lote_id: lote, piezas: 6 },
			"2026-11-10T18:01:00Z",
		);
		const { cuerpo } = await subir([primero, segundo]);
		expect(cuerpo.respuestas).toEqual([
			expect.objectContaining({ resultado: "apartado", motivo: "falta_documento", espera_entidad_id: lote }),
			expect.objectContaining({ resultado: "apartado", motivo: "falta_documento", espera_entidad_id: lote }),
		]);
		expect(await recibido(primero.clave_idempotencia)).toEqual([
			expect.objectContaining({ espera_entidad_id: lote, reintentos: 0 }),
		]);
		// Llega el lote: los que lo esperaban se aplican, en el orden en que pasaron.
		await subir([comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-127" })]);
		for (const esperado of [primero, segundo]) {
			expect(await recibido(esperado.clave_idempotencia)).toEqual([
				expect.objectContaining({ resultado: "aplicado", reintentos: 1, entidad: "prueba_bultos" }),
			]);
		}
		const bultos = await servidor.base.dueno.query(
			"SELECT piezas FROM prueba_bultos WHERE lote_id = $1 ORDER BY piezas",
			[lote],
		);
		expect(bultos.rows).toEqual([{ piezas: 5 }, { piezas: 6 }]);
		// Si el aparato vuelve a mandar esa clave, recibe la respuesta nueva.
		const reenviado = await subir([primero]);
		expect(reenviado.cuerpo.respuestas[0]).toMatchObject({
			resultado: "repetido",
			datos: { mensaje: "Bulto registrado" },
		});
	});

	it("si el reintento solo falla por algo del servidor, la cola sigue y el apartado se vuelve a intentar al empezar la siguiente subida; aunque falle siempre, no traba lo que viene detrás", async () => {
		const lote = uuidv7();
		const espera = comando(
			"prueba.registrar_bulto",
			{ id: uuidv7(), lote_id: lote, piezas: 77 },
			"2026-11-10T18:02:00Z",
		);
		const abrir = comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-160" }, "2026-11-10T18:03:00Z");
		servidor.fallas.bitacoraUnaVez.add("Registró un bulto de 77 piezas");
		const primera = await subir([espera, abrir]);
		expect(primera.cuerpo.detenido).toBe(false);
		expect(primera.cuerpo.respuestas.map((r: { resultado: string }) => r.resultado)).toEqual(["apartado", "aplicado"]);
		expect(await recibido(espera.clave_idempotencia)).toEqual([expect.objectContaining({ resultado: "apartado" })]);
		// La siguiente subida, de lo que sea, lo destraba al empezar.
		await subir([comando("prueba.abrir_lote", { id: uuidv7(), nombre: "L-2026-161" })]);
		expect(await recibido(espera.clave_idempotencia)).toEqual([
			expect.objectContaining({ resultado: "aplicado", reintentos: 1 }),
		]);
		// Un apartado cuyo reintento falla siempre no detiene la cola.
		const otroLote = uuidv7();
		const siempreFalla = comando("prueba.registrar_bulto", { id: uuidv7(), lote_id: otroLote, piezas: 78 });
		const despues = comando("prueba.abrir_lote", { id: uuidv7(), nombre: "L-2026-162" });
		servidor.fallas.bitacoraUnaVez.add("Registró un bulto de 78 piezas");
		const tanda = [siempreFalla, comando("prueba.abrir_lote", { id: otroLote, nombre: "L-2026-163" }), despues];
		const conFalla = await subir(tanda);
		expect(conFalla.cuerpo).toMatchObject({ detenido: false });
		expect(conFalla.cuerpo.respuestas.map((r: { resultado: string }) => r.resultado)).toEqual([
			"apartado",
			"aplicado",
			"aplicado",
		]);
	});

	it("un apartado que al reintentarse se vuelve a apartar por otro motivo guarda el nuevo y deja de reintentarse solo", async () => {
		const lote = uuidv7();
		const espera = comando("prueba.registrar_bulto", { id: uuidv7(), lote_id: lote, piezas: 79 });
		servidor.fallas.bitacoraUnaVez.add("Registró un bulto de 79 piezas");
		await subir([espera, comando("prueba.abrir_lote", { id: lote, nombre: "L-2026-170" })]);
		await mandarAccion(servidor, "prueba.cerrar_lote", { datos: { lote_id: lote } });
		// La siguiente subida lo reintenta: ya no falta el lote, pero está cerrado.
		await subir([comando("prueba.abrir_lote", { id: uuidv7(), nombre: "L-2026-171" })]);
		const [cerrado] = await recibido(espera.clave_idempotencia);
		expect(cerrado).toMatchObject({ resultado: "apartado", motivo_apartado: "lote_cerrado", espera_entidad_id: null });
		const reintentos = cerrado?.reintentos;
		await subir([comando("prueba.abrir_lote", { id: uuidv7(), nombre: "L-2026-172" })]);
		expect((await recibido(espera.clave_idempotencia))[0]?.reintentos).toBe(reintentos);
	});

	it("si un comando falla por algo del servidor, la tanda se corta con detenido y responde solo lo ya hecho; al volver a mandar, nada se duplica", async () => {
		const lotes = [uuidv7(), uuidv7(), uuidv7()];
		const comandos = lotes.map((id, i) => comando("prueba.abrir_lote", { id, nombre: `L-2026-13${i}` }));
		servidor.fallas.bitacoraUnaVez.add("L-2026-131");
		const cortada = await subir(comandos);
		expect(cortada.estado).toBe(200);
		expect(cortada.cuerpo.detenido).toBe(true);
		expect(cortada.cuerpo.respuestas).toEqual([expect.objectContaining({ resultado: "aplicado" })]);
		expect(await recibido(comandos[1]?.clave_idempotencia ?? "")).toEqual([]);
		const otraVez = await subir(comandos);
		expect(otraVez.cuerpo.detenido).toBe(false);
		expect(otraVez.cuerpo.respuestas.map((r: { resultado: string }) => r.resultado)).toEqual([
			"repetido",
			"aplicado",
			"aplicado",
		]);
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM prueba_lotes WHERE id = ANY($1)", [
			lotes,
		]);
		expect(rows[0]?.n).toBe(3);
	});

	it("guarda la subida, lo que le queda por subir y el desfase de su reloj", async () => {
		const enviado = new Date(Date.now() - 15 * 60_000).toISOString();
		await subir([comando("prueba.abrir_lote", { id: uuidv7(), nombre: "L-2026-140" })], {
			enviado_en: enviado,
			pendientes_por_subir: 7,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT ultima_subida_en, pendientes_por_subir, desfase_reloj_seg FROM dispositivos_sync WHERE dispositivo_id = $1",
			[tablet()],
		);
		expect(rows[0]).toMatchObject({ ultima_subida_en: expect.any(Date), pendientes_por_subir: 6 });
		expect(Math.abs(Number(rows[0]?.desfase_reloj_seg) - 900)).toBeLessThan(5);
	});

	it("sin llave, 401; una tanda de más de sync.tanda_max_comandos, 400; el puente no sube lo de la tablet", async () => {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { "x-app-version": "1.0.0" },
			payload: {
				enviado_en: new Date().toISOString(),
				pendientes_por_subir: 1,
				comandos: [comando("prueba.abrir_lote", {})],
			},
		});
		expect(respuesta.statusCode).toBe(401);
		await servidor.base.dueno.query("UPDATE parametros SET valor_entero = 2 WHERE clave = 'sync.tanda_max_comandos'");
		const demasiados = await subir([1, 2, 3].map(() => comando("prueba.abrir_lote", { id: uuidv7(), nombre: "x" })));
		await servidor.base.dueno.query("UPDATE parametros SET valor_entero = 200 WHERE clave = 'sync.tanda_max_comandos'");
		expect(demasiados.estado).toBe(400);
		expect(demasiados.cuerpo).toMatchObject({ error: "validacion", campos: { comandos: expect.any(String) } });
		const delPuente = await subir([comando("prueba.abrir_lote", { id: uuidv7(), nombre: "x" })], {
			llave: llaveDePrueba("otro_puente"),
		});
		expect(delPuente.cuerpo.respuestas[0]).toMatchObject({ resultado: "apartado", motivo: "fuera_de_alcance" });
	});
});

describe("Administración del sistema reintenta o descarta un comando apartado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La tablet sube un comando y regresa el id de su renglón. */
	async function subirUno(accion: string, datos: unknown): Promise<string> {
		const subido = comando(accion, datos);
		await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
			payload: { enviado_en: new Date().toISOString(), pendientes_por_subir: 1, comandos: [subido] },
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM comandos_recibidos WHERE clave_idempotencia = $1",
			[subido.clave_idempotencia],
		);
		return String(rows[0]?.id);
	}

	it("reintentar corre la carga con su hora y su persona; si se aplica, la bitácora es la de la acción con quién lo reintentó; después, no_es_apartado", async () => {
		const lote = uuidv7();
		const bulto = uuidv7();
		const comandoId = await subirUno("prueba.registrar_bulto", { id: bulto, lote_id: lote, piezas: 3 });
		const sigue = await mandarAccion(
			servidor,
			"admin.reintentar_comando_apartado",
			{ datos: { comando_id: comandoId } },
			"admin",
		);
		expect(sigue.cuerpo).toMatchObject({
			resultado: { resultado: "apartado", motivo: "falta_documento", mensaje: "Sigue apartado: falta_documento" },
		});
		// El lote llega desde la web: el apartado no se reintenta solo (lo espera de su aparato).
		await mandarAccion(servidor, "prueba.abrir_lote", { datos: { id: lote, nombre: "L-2026-150" } });
		const aplicado = await mandarAccion(
			servidor,
			"admin.reintentar_comando_apartado",
			{ datos: { comando_id: comandoId } },
			"admin",
		);
		expect(aplicado.cuerpo).toMatchObject({ resultado: { resultado: "aplicado", mensaje: "Comando aplicado" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT resultado, reintentos, entidad_id FROM comandos_recibidos WHERE id = $1",
			[comandoId],
		);
		expect(rows[0]).toEqual({ resultado: "aplicado", reintentos: 2, entidad_id: bulto });
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, despues, comando_id, ocurrido_en FROM bitacora WHERE entidad_id = $1",
			[bulto],
		);
		const cuenta = await servidor.base.dueno.query(
			"SELECT coalesce(nombre, correo) AS nombre FROM usuarios WHERE id = $1",
			[cuentaDePrueba("admin")],
		);
		expect(bitacora.rows).toEqual([
			{
				descripcion: "Registró un bulto de 3 piezas",
				despues: { reintento: `reintentado por ${cuenta.rows[0]?.nombre}` },
				comando_id: comandoId,
				ocurrido_en: new Date("2026-11-10T18:30:00Z"),
			},
		]);
		const otraVez = await mandarAccion(
			servidor,
			"admin.reintentar_comando_apartado",
			{ datos: { comando_id: comandoId } },
			"admin",
		);
		expect(otraVez.cuerpo).toMatchObject({ codigo: "no_es_apartado" });
	});

	it("descartar es solo de la dueña, pide motivo y no aplica nada; un descartado ya no se reintenta ni se descarta", async () => {
		const comandoId = await subirUno("prueba.atender_bulto", { bulto_id: uuidv7() });
		const datos = { comando_id: comandoId, motivo: "Lo capturó Ventas a mano" };
		expect((await mandarAccion(servidor, "admin.descartar_comando_apartado", { datos }, "admin")).cuerpo).toMatchObject(
			{
				codigo: "solo_duena",
			},
		);
		expect(
			(await mandarAccion(servidor, "admin.descartar_comando_apartado", { datos: { ...datos, motivo: "x" } }, "duena"))
				.cuerpo,
		).toMatchObject({ error: "validacion" });
		const descartado = await mandarAccion(servidor, "admin.descartar_comando_apartado", { datos }, "duena");
		expect(descartado.cuerpo).toMatchObject({ resultado: { mensaje: "Comando descartado" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT resultado, descartado_por, motivo_descarte FROM comandos_recibidos WHERE id = $1",
			[comandoId],
		);
		expect(rows[0]).toEqual({
			resultado: "apartado",
			descartado_por: cuentaDePrueba("duena"),
			motivo_descarte: "Lo capturó Ventas a mano",
		});
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'admin.descartar_comando_apartado'",
		);
		expect(bitacora.rows).toEqual([
			{
				descripcion:
					"Descartó un comando apartado de Tablet del taller (prueba.atender_bulto): Lo capturó Ventas a mano",
			},
		]);
		for (const [accion, quien, conMotivo] of [
			["admin.reintentar_comando_apartado", "admin", { comando_id: comandoId }],
			["admin.descartar_comando_apartado", "duena", datos],
		] as const) {
			expect((await mandarAccion(servidor, accion, { datos: conMotivo }, quien)).cuerpo).toMatchObject({
				codigo: "ya_descartado",
			});
		}
	});
});
