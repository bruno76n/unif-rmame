/**
 * Prueba del trabajo «Vigilar lotes atorados»: el lote sin avance en los días de trabajo avisa a la dueña una vez
 * hasta que algo cambia; «Sin datos de la tablet» no es atorado; fuera de los días de trabajo no corre; una máquina
 * parada atora los lotes de la operación de quien la trae.
 * Fase 12 · docs/fases/12-produccion.md («Criterios de terminado»)
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba, motivoDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { type LoteCortado, loteCortado, subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { vigilarLotesAtorados } from "./vigilar-lotes-atorados.ts";

describe("Un lote atorado avisa una vez hasta que algo cambia", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	let dependencias: DependenciasDelTrabajador;
	/** El lote que avanza cada día: con él, la tablet sí subió algo esos días. */
	let activo: LoteCortado;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant(),
		};
		await diasDeTrabajo("1,2,3,4,5,6,7");
		activo = await loteCortado(servidor, siembra);
		for (const dias of [5, 4, 3, 2, 1]) {
			expect(await registrar(activo, 1, haceDias(dias))).toMatchObject({ resultado: "aplicado" });
		}
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Cambia `general.dias_de_trabajo`. */
	async function diasDeTrabajo(dias: string) {
		await servidor.base.dueno.query("UPDATE parametros SET valor_texto = $1 WHERE clave = 'general.dias_de_trabajo'", [
			dias,
		]);
	}

	/** El momento de hace unos días, a esta hora. */
	function haceDias(dias: number): string {
		return new Date(Date.now() - dias * 86_400_000).toISOString();
	}

	/** La tablet registra una pieza en el primer bulto, en la primera operación después del corte. */
	function registrar(lote: LoteCortado, buenas: number, hora?: string) {
		return subirDeLaTablet(
			servidor,
			"produccion.registrar_operacion",
			{
				id: uuidv7(),
				bulto_id: lote.bultos[0]?.id,
				flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
				piezas_buenas: buenas,
				piezas_danadas: 0,
				sin_internet: hora !== undefined,
			},
			lote.personaId,
			hora,
		);
	}

	/** Un lote cortado hace unos días, sin registros de la tablet. */
	async function loteCortadoHace(dias: number): Promise<LoteCortado> {
		const lote = await loteCortado(servidor, siembra);
		await servidor.base.dueno.query("UPDATE lotes SET cortado_en = now() - make_interval(days => $2) WHERE id = $1", [
			lote.loteId,
			dias,
		]);
		return lote;
	}

	/** Corre el trabajo, como una vuelta del reloj. */
	async function correr(): Promise<void> {
		await correrTrabajo(dependencias, vigilarLotesAtorados, {});
	}

	/** Los avisos `lote_atorado` de un lote, con su cuenta, y cuántos `lote.atorado` guardó. */
	async function avisosDe(loteId: string) {
		const { rows: avisos } = await servidor.base.dueno.query(
			"SELECT texto FROM avisos WHERE tipo = 'lote_atorado' AND entidad_id = $1 ORDER BY creado_en",
			[loteId],
		);
		const { rows: eventos } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM eventos WHERE tipo = 'lote.atorado' AND entidad_id = $1",
			[loteId],
		);
		return { textos: avisos.map((aviso) => String(aviso.texto)), eventos: Number(eventos[0]?.n) };
	}

	it("el lote sin avance avisa a la dueña una vez; un registro que llega sin destrabarlo avisa otra vez; uno de hoy lo destraba", async () => {
		const lote = await loteCortadoHace(6);
		await correr();
		const operacion = lote.prenda.flujo.operaciones[1]?.nombre;
		const texto = new RegExp(`^${lote.folio} atorado en ${operacion} desde hace \\d+ días de trabajo$`);
		expect(await avisosDe(lote.loteId)).toEqual({ textos: [expect.stringMatching(texto)], eventos: 1 });
		expect(await avisosDe(activo.loteId)).toEqual({ textos: [], eventos: 0 });
		// Otra vuelta sin nada nuevo: no avisa dos veces.
		await correr();
		expect((await avisosDe(lote.loteId)).eventos).toBe(1);
		// La dueña lo lee (un aviso sin leer no se repite) y llega un registro hecho hace cuatro días sin internet: sigue
		// atorado, pero algo cambió.
		await servidor.base.dueno.query("UPDATE avisos SET leido_en = now() WHERE entidad_id = $1", [lote.loteId]);
		expect(await registrar(lote, 1, haceDias(4))).toMatchObject({ resultado: "aplicado" });
		await correr();
		expect(await avisosDe(lote.loteId)).toEqual({
			textos: [expect.stringMatching(texto), expect.stringMatching(texto)],
			eventos: 2,
		});
		// Uno de hoy lo destraba: no hay aviso nuevo.
		expect(await registrar(lote, 1)).toMatchObject({ resultado: "aplicado" });
		await correr();
		expect((await avisosDe(lote.loteId)).eventos).toBe(2);
	});

	it("«Sin datos de la tablet» no cuenta como atorado", async () => {
		const lote = await loteCortadoHace(6);
		await servidor.base.dueno.query("UPDATE dispositivos_sync SET ultima_subida_en = now() - interval '10 days'");
		await correr();
		expect(await avisosDe(lote.loteId)).toEqual({ textos: [], eventos: 0 });
		await servidor.base.dueno.query("UPDATE dispositivos_sync SET ultima_subida_en = now()");
		await correr();
		expect((await avisosDe(lote.loteId)).eventos).toBe(1);
	});

	it("corre solo en los días de general.dias_de_trabajo", async () => {
		const lote = await loteCortadoHace(6);
		const hoy = diaDeNegocio(Temporal.Now.instant()).dayOfWeek;
		await diasDeTrabajo([1, 2, 3, 4, 5, 6, 7].filter((dia) => dia !== hoy).join(","));
		await correr();
		expect(await avisosDe(lote.loteId)).toEqual({ textos: [], eventos: 0 });
		await diasDeTrabajo("1,2,3,4,5,6,7");
		await correr();
		expect((await avisosDe(lote.loteId)).eventos).toBe(1);
	});

	it("una falla que detuvo la máquina atora los lotes de la operación de quien la trae, y resolverla quita el atorado", async () => {
		// Un lote recién cortado: no está atorado por falta de avance.
		const lote = await loteCortado(servidor, siembra);
		// La máquina la trae otra persona: no atora este lote.
		const otra = await nuevaPersona(servidor.base.dueno, "taller");
		const maquina = await maquinaDePrueba(servidor, otra);
		const reportada = await mandarAccion(
			servidor,
			"mantenimiento.reportar_falla",
			{ datos: { maquina_id: maquina.id, motivo_falla_id: await motivoDePrueba(servidor, "No prende") } },
			"mantenimiento",
		);
		const { falla_id, folio } = z.object({ falla_id: z.uuid(), folio: z.string() }).parse(reportada.cuerpo.resultado);
		await correr();
		expect((await avisosDe(lote.loteId)).eventos).toBe(0);
		// Ahora la trae quien hace de base la operación del lote: el atorado sigue a quien la trae.
		const { rows: deLaMaquina } = await servidor.base.dueno.query(
			"SELECT version::int AS v FROM maquinas WHERE id = $1",
			[maquina.id],
		);
		await mandarAccion(
			servidor,
			"mantenimiento.cambiar_asignacion_maquina",
			{ datos: { maquina_id: maquina.id, persona_id: lote.personaId }, version: deLaMaquina[0]?.v },
			"mantenimiento",
		);
		await correr();
		const operacion = lote.prenda.flujo.operaciones[1]?.nombre;
		expect(await avisosDe(lote.loteId)).toEqual({
			textos: [`${lote.folio} atorado en ${operacion}: ${maquina.nombre} parada (${folio})`],
			eventos: 1,
		});
		// Resuelta la falla, ya no está atorado: un registro nuevo (que reinicia el aviso) no lo vuelve a avisar.
		const { rows: tecnico } = await servidor.base.dueno.query(
			"INSERT INTO tecnicos (id, nombre) VALUES (gen_random_uuid(), $1) RETURNING id",
			[`Técnico ${falla_id.slice(-6)}`],
		);
		const { rows: version } = await servidor.base.dueno.query("SELECT version::int AS v FROM fallas WHERE id = $1", [
			falla_id,
		]);
		const resuelta = await mandarAccion(
			servidor,
			"mantenimiento.registrar_servicio",
			{
				datos: {
					falla_id,
					tecnico_id: tecnico[0]?.id,
					que_se_hizo: "Cambio de motor",
					costo_centavos: 0,
					horas_paro: 4,
				},
				version: version[0]?.v,
			},
			"mantenimiento",
		);
		expect(resuelta.estado).toBe(200);
		expect(await registrar(lote, 1)).toMatchObject({ resultado: "aplicado" });
		await correr();
		expect((await avisosDe(lote.loteId)).eventos).toBe(1);
	});
});
