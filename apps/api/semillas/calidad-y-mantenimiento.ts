/**
 * Calidad y Mantenimiento de la muestra: el catálogo de defectos, los técnicos, las doce máquinas con su tipo, su área y
 * quién la trae, sus fallas y sus servicios, en el día que dice la muestra.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Cómo se construye») y la muestra
 * (`docs/interfaz/muestra/sistema-alameda.html`: `DEFECTOS`, `MAQ`, `MAQ_DAT`, `TECNICOS`, `MT_FALLAS` y `MT_SERV`)
 *
 * Se carga con las mismas acciones del sistema: Tomás (Producción, Calidad y Mantenimiento) agrega los defectos, da de
 * alta las máquinas, manda las fallas a reparación y registra los servicios; las fallas las reporta la tablet del taller
 * a nombre de quien la trae, como su cola. Los técnicos entran directo: no tienen acción de alta y el primer servicio
 * suelto de la muestra es anterior a cualquier reparación. Los motivos que la siembra no tiene («No calienta», «Ojal
 * disparejo») entran como «Otra cosa». Las revisiones y los reclamos de la muestra son de lotes viejos que la carga de
 * Producción no tiene: no se cargan (decisión 631). Si ya hay máquinas, no hace nada.
 */

import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { listas, listaValores } from "../src/modulos/admin/tablas.ts";
import { fallas, maquinas, tecnicos } from "../src/modulos/mantenimiento/tablas.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { cargarModulos } from "../src/nucleo/modulos.ts";
import { enSesionDeCarga, type Hacer, idDe } from "./correr.ts";
import { personasDelTaller, subirComando, tallerDeLaMuestra, tomas } from "./produccion.ts";

/** Los defectos de la muestra con las operaciones que suelen causarlos. */
// biome-ignore format: una tabla se lee mejor con un defecto por renglón
const defectosDeLaMuestra: readonly [string, string[]][] = [
	["Costura abierta", ["Costados", "Hombros", "Entrepierna", "Canesú y hombros"]],
	["Puntada saltada", ["Costados", "Mangas", "Mangas y puños", "Hombros"]],
	["Hilos sin cortar", ["Planchado", "Empaque"]],
	["Ojal mal hecho", ["Ojal y botón"]],
	["Botón flojo o chueco", ["Ojal y botón"]],
	["Cuello desigual", ["Cuello"]],
	["Escudo chueco", ["Escudo", "Pegado de escudo"]],
	["Pretina o resorte mal puesto", ["Pretina y resorte", "Pretina", "Puños y pretina", "Pretina o vista"]],
	["Bastilla dispareja", ["Bastilla"]],
	["Fuera de medida", ["Corte"]],
	["Falla en la tela", ["Corte"]],
	["Mancha", ["Planchado", "Empaque"]],
];

/** Los técnicos de la muestra. */
const tecnicosDeLaMuestra = [
	"Servicio Industrial del Bajío",
	"Técnica de Costura Juárez",
	"Refacciones Ochoa (taller)",
];

/** Las máquinas de la muestra: su folio en la muestra, nombre, quién la trae, tipo, marca, modelo, serie y área. */
// biome-ignore format: una tabla se lee mejor con una máquina por renglón
const maquinasDeLaMuestra: readonly [string, string, string, string, string, string, string, string][] = [
	["R-03", "Recta 3", "LR", "Recta", "Juki", "DDL-8700", "J8700-41822", "Costura"],
	["R-05", "Recta 5", "AT", "Recta", "Juki", "DDL-8700", "J8700-41907", "Costura"],
	["R-07", "Recta 7", "RO", "Recta", "Brother", "S-7100A", "B71-220415", "Costura"],
	["O-01", "Overlock 1", "MC", "Overlock", "Siruba", "757K", "S757-10294", "Costura"],
	["O-02", "Overlock 2", "PL", "Overlock", "Siruba", "757K", "S757-10311", "Costura"],
	["C-03", "Collareta 3", "ES", "Collareta", "Pegasus", "W664", "PW6-77120", "Costura"],
	["C-04", "Collareta 4", "ES", "Collareta", "Pegasus", "W664", "PW6-77345", "Costura"],
	["OJ-1", "Ojaladora", "JU", "Ojaladora", "Juki", "LBH-1790", "JL17-00982", "Ojal y botón"],
	["BT-1", "Botonera", "JU", "Botonera", "Juki", "LK-1903", "JK19-01177", "Ojal y botón"],
	["RM-1", "Recubridora", "BR", "Recubridora", "Kansai", "DFB-1404", "KD14-55021", "Costura"],
	["PL-1", "Plancha 1", "SG", "Plancha de vapor", "Silter", "SPR-2000", "SL20-3381", "Planchado"],
	["CT-1", "Cortadora", "BA", "Cortadora de tela", "Eastman", "Brute 627", "EB627-9910", "Corte"],
];

/** Un servicio de la muestra: la máquina, el técnico, el día, qué se hizo, el costo en pesos y las horas de paro. */
interface ServicioDeLaMuestra {
	maquina: string;
	tecnico: string;
	dia: string;
	queSeHizo: string;
	pesos: number;
	horas: number;
}

/** Los servicios sueltos de la muestra, en su orden. */
// biome-ignore format: una tabla se lee mejor con un servicio por renglón
const sueltosDeLaMuestra: readonly ServicioDeLaMuestra[] = [
	{ maquina: "RM-1", tecnico: "Servicio Industrial del Bajío", dia: "2026-04-08", queSeHizo: "Cambio de agujas y placa", pesos: 700, horas: 5 },
	{ maquina: "R-03", tecnico: "Técnica de Costura Juárez", dia: "2026-05-14", queSeHizo: "Ajuste de transporte", pesos: 550, horas: 4 },
	{ maquina: "OJ-1", tecnico: "Técnica de Costura Juárez", dia: "2026-06-10", queSeHizo: "Cambio de tarjeta de control", pesos: 2400, horas: 20 },
	{ maquina: "C-03", tecnico: "Servicio Industrial del Bajío", dia: "2026-07-22", queSeHizo: "Cambio de looper", pesos: 900, horas: 11 },
];

/** Una falla de la muestra: la máquina, el día, qué le pasa, si se queda parada y, si ya avanzó, su reparación. */
interface FallaDeLaMuestra {
	maquina: string;
	dia: string;
	motivo: string;
	parada: boolean;
	reparacion?: { tecnico: string; nota?: string; servicio?: Omit<ServicioDeLaMuestra, "maquina" | "tecnico"> };
}

/** Las fallas de la muestra, en su orden. */
// biome-ignore format: una tabla se lee mejor con una falla por renglón
const fallasDeLaMuestra: readonly FallaDeLaMuestra[] = [
	{ maquina: "CT-1", dia: "2026-09-05", motivo: "Hace ruido", parada: false,
		reparacion: { tecnico: "Refacciones Ochoa (taller)", servicio: { dia: "2026-09-06", queSeHizo: "Cambio de banda y afilado", pesos: 480, horas: 3 } } },
	{ maquina: "OJ-1", dia: "2026-09-15", motivo: "Otra cosa", parada: true,
		reparacion: { tecnico: "Técnica de Costura Juárez", servicio: { dia: "2026-09-17", queSeHizo: "Ajuste de cuchilla y lubricación", pesos: 650, horas: 14 } } },
	{ maquina: "PL-1", dia: "2026-09-24", motivo: "Otra cosa", parada: true,
		reparacion: { tecnico: "Servicio Industrial del Bajío", servicio: { dia: "2026-09-25", queSeHizo: "Cambio de resistencia", pesos: 1200, horas: 9 } } },
	{ maquina: "O-01", dia: "2026-10-02", motivo: "Salta puntada", parada: true,
		reparacion: { tecnico: "Técnica de Costura Juárez", servicio: { dia: "2026-10-03", queSeHizo: "Ajuste de tiempo y cambio de garfio", pesos: 850, horas: 6 } } },
	{ maquina: "C-03", dia: "2026-10-08", motivo: "No prende", parada: true,
		reparacion: { tecnico: "Servicio Industrial del Bajío", nota: "Revisaron el motor el 9 oct; esperan la refacción para el 13 oct" } },
	{ maquina: "R-07", dia: "2026-10-11", motivo: "Rompe el hilo", parada: false },
];

/** Una hora de un día de la muestra, en hora de México (UTC−6). */
const aLas = (dia: string, hora: number) =>
	Temporal.PlainDate.from(dia)
		.toZonedDateTime({ timeZone: "-06:00", plainTime: { hour: hora } })
		.toInstant();

/**
 * Carga Calidad y Mantenimiento de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarCalidadYMantenimientoDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base.select({ id: maquinas.id }).from(maquinas).limit(1);
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	const personas = await personasDelTaller(base);
	const persona = (clave: string) => personas.get(tallerDeLaMuestra[clave] ?? "") ?? "";
	const tecnicoIds = new Map<string, string>();
	for (const nombre of tecnicosDeLaMuestra) {
		const id = uuidv7();
		await base.insert(tecnicos).values({ id, nombre });
		tecnicoIds.set(nombre, id);
	}
	const sesion = { ...tomas, sesionId: "01936f2e-0000-7000-8000-0000000000f7" };
	const maquinaIds = new Map<string, string>();
	await enSesionDeCarga(base, registro, sesion, async (hacer) => {
		await cargarDefectos(base, hacer);
		for (const [clave, nombre, quien, tipo, marca, modelo, serie, area] of maquinasDeLaMuestra) {
			const alta = await hacer(
				"mantenimiento.alta_maquina",
				{
					nombre,
					tipo_nuevo: tipo,
					area_id: await areaId(base, area),
					marca,
					modelo,
					serie,
					persona_id: persona(quien),
				},
				undefined,
				aLas("2026-03-02", 9),
			);
			maquinaIds.set(clave, idDe(alta, "maquina_id"));
		}
		for (const suelto of sueltosDeLaMuestra) {
			const maquinaId = maquinaIds.get(suelto.maquina) ?? "";
			await hacer(
				"mantenimiento.registrar_servicio",
				{
					maquina_id: maquinaId,
					tecnico_id: tecnicoIds.get(suelto.tecnico),
					que_se_hizo: suelto.queSeHizo,
					costo_centavos: suelto.pesos * 100,
					horas_paro: suelto.horas,
				},
				await versionDe(base, "maquinas", maquinaId),
				aLas(suelto.dia, 13),
			);
		}
	});
	// Cada falla la reporta la tablet a nombre de quien trae la máquina; Mantenimiento la manda y la resuelve.
	for (const falla of fallasDeLaMuestra) {
		const maquinaId = maquinaIds.get(falla.maquina) ?? "";
		const quien = maquinasDeLaMuestra.find((maquina) => maquina[0] === falla.maquina)?.[2] ?? "";
		const fallaId = uuidv7();
		await subirComando(base, registro, persona(quien), {
			accion: "mantenimiento.reportar_falla",
			datos: {
				id: fallaId,
				maquina_id: maquinaId,
				motivo_falla_id: await motivoId(base, falla.motivo),
				sin_internet: false,
			},
			ocurrido_en: aLas(falla.dia, 10).toString(),
			persona_id: persona(quien),
		});
		const { reparacion } = falla;
		if (reparacion === undefined) continue;
		await enSesionDeCarga(base, registro, { ...sesion, sesionId: uuidv7() }, async (hacer) => {
			await hacer(
				"mantenimiento.mandar_a_reparacion",
				{ falla_id: fallaId, tecnico_id: tecnicoIds.get(reparacion.tecnico), se_queda_parada: falla.parada },
				await versionDe(base, "fallas", fallaId),
				aLas(falla.dia, 12),
			);
			if (reparacion.nota !== undefined) {
				await hacer(
					"mantenimiento.guardar_nota_seguimiento",
					{ falla_id: fallaId, nota: reparacion.nota },
					await versionDe(base, "fallas", fallaId),
					aLas(falla.dia, 17),
				);
			}
			if (reparacion.servicio !== undefined) {
				await hacer(
					"mantenimiento.registrar_servicio",
					{
						falla_id: fallaId,
						tecnico_id: tecnicoIds.get(reparacion.tecnico),
						que_se_hizo: reparacion.servicio.queSeHizo,
						costo_centavos: reparacion.servicio.pesos * 100,
						horas_paro: reparacion.servicio.horas,
					},
					await versionDe(base, "fallas", fallaId),
					aLas(reparacion.servicio.dia, 13),
				);
			}
		});
	}
}

/** Tomás agrega los defectos de la muestra con las operaciones que ya están en los flujos. */
async function cargarDefectos(base: Base, hacer: Hacer): Promise<void> {
	const { rows } = await base.execute(sql`SELECT id, nombre FROM operaciones WHERE baja_en IS NULL`);
	const operaciones = new Map(
		z
			.array(z.object({ id: z.uuid(), nombre: z.string() }))
			.parse(rows)
			.map((operacion) => [operacion.nombre, operacion.id]),
	);
	for (const [nombre, deOperaciones] of defectosDeLaMuestra) {
		const operacionIds = deOperaciones.flatMap((operacion) => operaciones.get(operacion) ?? []);
		if (operacionIds.length === 0) continue;
		await hacer("calidad.agregar_defecto", { nombre, operacion_ids: operacionIds }, undefined, aLas("2026-03-02", 8));
	}
}

/** Un área de la lista «Áreas del taller», por su nombre. */
async function areaId(base: Base, nombre: string): Promise<string> {
	const [area] = await base
		.select({ id: listaValores.id })
		.from(listaValores)
		.innerJoin(listas, eq(listas.id, listaValores.listaId))
		.where(sql`${listas.clave} = 'areas_taller' AND ${listaValores.nombre} = ${nombre}`);
	if (area === undefined) throw new Error(`no está el área ${nombre}`);
	return area.id;
}

/** Un motivo de falla de la siembra, por su nombre. */
async function motivoId(base: Base, nombre: string): Promise<string> {
	const { rows } = await base.execute(sql`SELECT id FROM motivos_falla WHERE nombre = ${nombre}`);
	return z.object({ id: z.uuid() }).parse(rows[0]).id;
}

/** La versión de un renglón. */
async function versionDe(base: Base, tabla: "maquinas" | "fallas", id: string): Promise<number> {
	const fila =
		tabla === "maquinas"
			? (await base.select({ v: maquinas.version }).from(maquinas).where(eq(maquinas.id, id)))[0]
			: (await base.select({ v: fallas.version }).from(fallas).where(eq(fallas.id, id)))[0];
	return Number(fila?.v);
}
