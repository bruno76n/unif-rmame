/**
 * Producción de la muestra: sus siete flujos con sus tarifas, el flujo de cada prenda, las órdenes de temporada y de
 * reabasto con sus lotes, el corte de los que ya se cortaron y sus registros de la tablet, en el día que dice la muestra.
 * Fase 12 · docs/fases/12-produccion.md («Cómo se construye») y la muestra
 * (`docs/interfaz/muestra/sistema-alameda.html`: `FLUJOS`, `FLUJO_DE`, `PR_LOTES` y `PR_ORD`)
 *
 * Se carga con las mismas acciones del sistema: Tomás (Producción) arma los flujos, levanta las órdenes y cierra los
 * cortes; Rosa (Catálogo y Personal) le pone su flujo a cada prenda y las tarifas; la tablet del taller sube los
 * registros a nombre de cada persona, como lo haría su cola. Solo entran las órdenes de temporada y de reabasto: las de
 * un pedido nacen con Ventas (fase 16). Se cortan los lotes cuya tela hay en Bodega, con sus rollos (decisión 617).
 * La tablet del taller entra directo, como un aparato que ya estaba registrado. Si ya hay flujos de la muestra, no
 * hace nada.
 */

import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { dispositivos, dispositivosSync } from "../src/modulos/admin/tablas.ts";
import { ubicaciones } from "../src/modulos/inventario/tablas.ts";
import { flujos } from "../src/modulos/produccion/tablas.ts";
import type { AparatoQueLlama, CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../src/nucleo/acciones/corredor.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { enTransaccion } from "../src/nucleo/base/transacciones.ts";
import { ErrorDeApi } from "../src/nucleo/http/errores.ts";
import { cargarModulos, type RegistroDeModulos } from "../src/nucleo/modulos.ts";
import { aplicarComando, guardarComando } from "../src/nucleo/sincronizacion/comandos.ts";
import { productosPorClave } from "./compras-y-patronaje.ts";
import { enSesionDeCarga, type Hacer, idDe } from "./correr.ts";

/** Tomás (`cuentas.ts`), con Producción, en la sesión de esta carga. */
const tomas: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000008",
	sesionId: "01936f2e-0000-7000-8000-0000000000f4",
	esDuena: false,
	esSoporte: false,
	departamentos: ["produccion", "calidad", "mantenimiento"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Rosa (`cuentas.ts`), con Catálogo y Personal y el permiso de ver tarifas, en la sesión de esta carga. */
const rosa: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000006",
	sesionId: "01936f2e-0000-7000-8000-0000000000f5",
	esDuena: false,
	esSoporte: false,
	departamentos: ["compras", "catalogo", "patronaje", "ventas", "linea", "contaduria", "personal", "admin"],
	permisosFinos: ["ven_sueldos_y_tarifas"],
	confirmadoConGoogleEn: undefined,
};

/** La tablet del taller de la muestra. */
const tabletDelTaller = "01936f2e-0000-7000-8000-0000000000d1";

/** La gente del taller de la muestra, por su clave. */
const tallerDeLaMuestra: Record<string, string> = {
	BA: "Beto Aguilar",
	LR: "Lupita Ramos",
	AT: "Ana Torres",
	RO: "Rocío Medina",
	MC: "Mari Cruz",
	JU: "Juana Pérez",
	ES: "Elena Soto",
	PL: "Paty Lara",
	BR: "Blanca Ruiz",
	SG: "Sergio Gómez",
	DV: "Diana Vega",
};

/** Los flujos de la muestra: su nombre y sus operaciones, con quién las hace de base y su tarifa en pesos. */
// biome-ignore format: una tabla se lee mejor con un flujo por renglón
const flujosDeLaMuestra: Record<string, { nombre: string; operaciones: [string, string, number][] }> = {
	polo: { nombre: "Playera polo", operaciones: [["Corte", "BA", 0.9], ["Hombros", "LR", 1.2], ["Cuello", "AT", 2.4], ["Mangas", "RO", 1.8], ["Costados", "MC", 1.6], ["Ojal y botón", "JU", 1.5], ["Planchado", "SG", 1], ["Empaque", "DV", 0.5]] },
	camisa: { nombre: "Camisa y bata", operaciones: [["Corte", "BA", 1], ["Canesú y hombros", "LR", 2], ["Cuello", "AT", 3.2], ["Mangas y puños", "RO", 3], ["Costados", "MC", 1.8], ["Ojal y botón", "JU", 2.2], ["Planchado", "SG", 1.4], ["Empaque", "DV", 0.5]] },
	tejido: { nombre: "Suéter y chaleco", operaciones: [["Corte", "BA", 0.8], ["Hombros", "LR", 1.2], ["Mangas o sisas", "RO", 1.8], ["Costados", "MC", 1.6], ["Escudo", "BR", 1.4], ["Planchado", "SG", 1], ["Empaque", "DV", 0.5]] },
	sudadera: { nombre: "Sudadera y chamarra", operaciones: [["Corte", "BA", 0.9], ["Hombros", "LR", 1.2], ["Mangas", "RO", 1.8], ["Costados", "MC", 1.6], ["Puños y pretina", "ES", 2.2], ["Planchado", "SG", 1], ["Empaque", "DV", 0.5]] },
	pants: { nombre: "Pants y short", operaciones: [["Corte", "BA", 0.9], ["Entrepierna", "LR", 1.6], ["Costados", "MC", 1.6], ["Pretina y resorte", "ES", 2.4], ["Bastilla", "BR", 1.2], ["Planchado", "SG", 0.8], ["Empaque", "DV", 0.5]] },
	falda: { nombre: "Falda, jumper y mandil", operaciones: [["Corte", "BA", 1.2], ["Tablones", "PL", 3.5], ["Costados", "MC", 1.6], ["Cierre", "PL", 2], ["Pretina o vista", "ES", 2.4], ["Bastilla", "BR", 1.4], ["Planchado", "SG", 1.6], ["Empaque", "DV", 0.5]] },
	pantalon: { nombre: "Pantalón", operaciones: [["Corte", "BA", 1], ["Bolsas", "PL", 3], ["Cierre y bragueta", "PL", 2.8], ["Costados", "MC", 1.8], ["Pretina", "ES", 2.6], ["Bastilla", "BR", 1.2], ["Planchado", "SG", 1.4], ["Empaque", "DV", 0.5]] },
};

/** El flujo de cada prenda de la muestra. */
// biome-ignore format: una tabla se lee mejor por grupos
const flujoDe: Record<string, string> = {
	P01: "polo", P02: "polo", P03: "polo", P04: "polo", P05: "polo", P07: "camisa", P08: "camisa", P09: "camisa", P10: "camisa",
	P11: "tejido", P12: "tejido", P13: "tejido", P15: "tejido", P16: "tejido", P17: "sudadera", P21: "sudadera",
	P18: "pants", P19: "pants", P20: "pants", P22: "pants", P23: "falda", P24: "falda", P25: "falda", P26: "falda",
	P27: "pantalon", P28: "pantalon",
};

/** Un lote de la muestra que no es de un pedido: para quién, su orden y, si ya se cortó, su avance. */
interface LoteDeLaMuestra {
	prenda: string;
	piezas: number;
	/** Bodega (temporada) o la tienda que lo espera. */
	para: "BOD" | "T1" | "T2";
	entrega: string;
	/** El día y el motivo de su orden. */
	orden: [string, string];
	/** Si ya se cortó: el día, lo hecho y la merma de cada operación (la primera es el corte) y el día en que llegó. */
	corte?: { dia: string; hechas: number[]; merma: number[]; hasta: string };
}

/** Los lotes de temporada y de reabasto de la muestra, en el orden de sus órdenes. */
// biome-ignore format: una tabla se lee mejor con un lote por renglón
const lotesDeLaMuestra: readonly LoteDeLaMuestra[] = [
	{ prenda: "P18", piezas: 120, para: "T2", entrega: "2026-10-15", orden: ["2026-09-30", "Bodega sugirió: Tienda 2 con 4 tallas en cero"],
		corte: { dia: "2026-10-01", hechas: [120, 120, 120, 118, 118, 118, 118], merma: [0, 0, 1, 1, 0, 0, 0], hasta: "2026-10-11" } },
	{ prenda: "P01", piezas: 300, para: "BOD", entrega: "2026-11-20", orden: ["2026-10-03", "Plan de regreso a clases 2027, primera tanda"],
		corte: { dia: "2026-10-05", hechas: [300, 300, 260, 220, 180, 120, 60, 40], merma: [0, 0, 2, 0, 1, 3, 0, 0], hasta: "2026-10-11" } },
	{ prenda: "P23", piezas: 190, para: "BOD", entrega: "2026-11-20", orden: ["2026-10-03", "Plan de regreso a clases 2027, primera tanda"] },
	{ prenda: "P17", piezas: 112, para: "BOD", entrega: "2026-11-27", orden: ["2026-10-03", "Plan de regreso a clases 2027, primera tanda"] },
	{ prenda: "P01", piezas: 90, para: "T1", entrega: "2026-10-28", orden: ["2026-10-09", "Bodega sugirió: Tienda 1 con polo lisa bajo mínimo"] },
	{ prenda: "P24", piezas: 110, para: "BOD", entrega: "2026-11-20", orden: ["2026-10-09", "Plan de regreso a clases 2027, primera tanda"] },
	{ prenda: "P02", piezas: 70, para: "BOD", entrega: "2026-11-20", orden: ["2026-10-09", "Plan de regreso a clases 2027, primera tanda"] },
	{ prenda: "P19", piezas: 44, para: "BOD", entrega: "2026-11-27", orden: ["2026-10-09", "Plan de regreso a clases 2027, primera tanda"] },
	{ prenda: "P04", piezas: 150, para: "BOD", entrega: "2026-11-27", orden: ["2026-10-09", "Modelo nuevo de Secundaria Técnica 12"] },
	{ prenda: "P18", piezas: 170, para: "T2", entrega: "2026-10-31", orden: ["2026-10-10", "Bodega sugirió: Tienda 2 sin pants talla 8 a 12"] },
	{ prenda: "P13", piezas: 120, para: "BOD", entrega: "2026-11-27", orden: ["2026-10-10", "Modelo nuevo de Secundaria Técnica 12"] },
	{ prenda: "P21", piezas: 60, para: "BOD", entrega: "2026-11-27", orden: ["2026-10-10", "Modelo nuevo de Gabriela Mistral"] },
];

/** Una hora de un día de la muestra, en hora de México (UTC−6). */
const aLas = (dia: string, hora: number) =>
	Temporal.PlainDate.from(dia)
		.toZonedDateTime({ timeZone: "-06:00", plainTime: { hour: hora } })
		.toInstant();

/**
 * Reparte las piezas de un lote entre sus tallas como la muestra: más en el centro, y lo que sobra del redondeo desde
 * el centro hacia afuera.
 * @param cuantas Cuántas tallas.
 * @param total Las piezas del lote.
 */
export function repartoDeTallas(cuantas: number, total: number): number[] {
	const centro = (cuantas - 1) / 2;
	const pesos = Array.from({ length: cuantas }, (_, i) => 1.6 - Math.abs(i - centro) / Math.max(1, centro));
	const suma = pesos.reduce((a, b) => a + b, 0);
	const piezas = pesos.map((peso) => Math.floor((total * peso) / suma));
	let resto = total - piezas.reduce((a, b) => a + b, 0);
	for (let i = 0; resto > 0; i = (i + 1) % cuantas, resto--) {
		const talla = Math.round(centro + (i % 2 ? -1 : 1) * Math.ceil(i / 2)) % cuantas;
		piezas[talla] = (piezas[talla] ?? 0) + 1;
	}
	return piezas;
}

/**
 * Lo bueno de cada operación con su merma, sin pasar nunca de lo bueno de la anterior: así lo pide el tope del bulto.
 * @param hechas Lo hecho de cada operación, como lo cuenta la muestra; la primera es el corte.
 * @param merma Lo dañado de cada operación.
 */
export function buenasPorOperacion(hechas: readonly number[], merma: readonly number[]): number[] {
	const buenas: number[] = [];
	for (const [i, hecho] of hechas.entries()) {
		const anterior = buenas[i - 1];
		buenas.push(anterior === undefined ? hecho : Math.min(hecho, anterior - (merma[i] ?? 0)));
	}
	return buenas;
}

/**
 * Carga Producción de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarProduccionDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base
		.select({ id: flujos.id })
		.from(flujos)
		.where(eq(flujos.nombre, flujosDeLaMuestra.polo?.nombre ?? ""));
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	const personas = await personasDelTaller(base);
	const persona = (clave: string) => personas.get(tallerDeLaMuestra[clave] ?? "") ?? "";
	const flujoIds = new Map<string, string>();
	await enSesionDeCarga(base, registro, tomas, async (hacer) => {
		for (const [clave, flujo] of Object.entries(flujosDeLaMuestra)) {
			flujoIds.set(clave, await armarFlujo(base, hacer, flujo, persona));
		}
	});
	const productoIds = await productosPorClave(base);
	await enSesionDeCarga(base, registro, rosa, async (hacer) => {
		await ponerTarifas(base, hacer, flujoIds);
		for (const [prenda, clave] of Object.entries(flujoDe)) {
			const productoId = productoIds.get(prenda);
			if (productoId === undefined) continue;
			await hacer(
				"catalogo.aplicar_cambios_producto",
				{ producto_id: productoId, flujo_id: flujoIds.get(clave) },
				await versionDe(base, "productos", productoId),
				aLas("2026-09-01", 10),
			);
		}
	});
	const cortados: { lote: LoteDeLaMuestra; loteId: string }[] = [];
	// Tomás vuelve en otra sesión, ya con las prendas y las tarifas listas.
	await enSesionDeCarga(
		base,
		registro,
		{ ...tomas, sesionId: "01936f2e-0000-7000-8000-0000000000f6" },
		async (hacer) => {
			for (const lote of lotesDeLaMuestra) {
				const productoId = productoIds.get(lote.prenda) ?? "";
				const variantes = await variantesNormales(base, productoId);
				const piezas = repartoDeTallas(variantes.length, lote.piezas);
				const tallas = variantes.map((variante_id, i) => ({ variante_id, piezas: piezas[i] ?? 0 }));
				const [destino] = await base
					.select({ id: ubicaciones.id })
					.from(ubicaciones)
					.where(eq(ubicaciones.codigo, lote.para));
				const orden = await hacer(
					"produccion.crear_orden",
					{
						ubicacion_destino_id: destino?.id,
						producto_id: productoId,
						tallas,
						fecha_entrega: lote.entrega,
						motivo: lote.orden[1],
					},
					undefined,
					aLas(lote.orden[0], 10),
				);
				const loteId = idDe(orden, "lote_id");
				if (lote.corte === undefined) continue;
				await cortar(base, hacer, { loteId, productoId, dia: lote.corte.dia, tallas, cortador: persona("BA") });
				cortados.push({ lote, loteId });
			}
		},
	);
	await registrarTablet(base);
	for (const { lote, loteId } of cortados) await subirRegistros(base, registro, lote, loteId);
}

/** Las personas del taller por su nombre. */
async function personasDelTaller(base: Base): Promise<Map<string, string>> {
	const { rows } = await base.execute(sql`SELECT id, nombre FROM personas WHERE area = 'taller'`);
	return new Map(
		z
			.array(z.object({ id: z.uuid(), nombre: z.string() }))
			.parse(rows)
			.map((p) => [p.nombre, p.id]),
	);
}

/** La versión de un renglón de una tabla de la muestra. */
async function versionDe(base: Base, tabla: "productos" | "lotes" | "flujos", id: string): Promise<number> {
	const { rows } = await base.execute(sql`SELECT version::int AS v FROM ${sql.identifier(tabla)} WHERE id = ${id}`);
	return z.object({ v: z.number() }).parse(rows[0]).v;
}

/**
 * Arma un flujo de la muestra: parte de «Una sola operación» con quien corta y quien empaca, mete las demás antes de
 * la última, en su orden, y quita la que trae de más.
 * @returns El id del flujo.
 */
async function armarFlujo(
	base: Base,
	hacer: Hacer,
	flujo: { nombre: string; operaciones: [string, string, number][] },
	persona: (clave: string) => string,
): Promise<string> {
	const [corte] = flujo.operaciones;
	const ultima = flujo.operaciones.at(-1);
	if (corte === undefined || ultima === undefined) throw new Error(`${flujo.nombre} no tiene operaciones`);
	const creado = z
		.object({
			flujo_id: z.uuid(),
			operaciones: z.array(z.object({ flujo_operacion_id: z.uuid(), nombre: z.string() })),
		})
		.parse(
			await hacer(
				"produccion.crear_flujo",
				{
					nombre: flujo.nombre,
					parte_de: "una_sola_operacion",
					persona_corte_id: persona(corte[1]),
					persona_base_id: persona(ultima[1]),
				},
				undefined,
				aLas("2026-09-01", 9),
			),
		);
	const delParametro = creado.operaciones.slice(1);
	const final = delParametro.find((operacion) => operacion.nombre === ultima[0]);
	if (final === undefined) throw new Error(`«Una sola operación» no termina en ${ultima[0]}`);
	for (const [nombre, quien] of flujo.operaciones.slice(1, -1)) {
		await hacer(
			"produccion.agregar_operacion_flujo",
			{
				flujo_id: creado.flujo_id,
				operacion: nombre,
				persona_base_id: persona(quien),
				va_antes_de_id: final.flujo_operacion_id,
			},
			await versionDe(base, "flujos", creado.flujo_id),
			aLas("2026-09-01", 9),
		);
	}
	for (const sobra of delParametro.filter((operacion) => operacion !== final)) {
		await hacer(
			"produccion.quitar_operacion_flujo",
			{ flujo_operacion_id: sobra.flujo_operacion_id },
			await versionDe(base, "flujos", creado.flujo_id),
			aLas("2026-09-01", 9),
		);
	}
	return creado.flujo_id;
}

/** Las operaciones vigentes de un flujo, en su orden. */
async function operacionesDe(base: Base, flujoId: string) {
	const { rows } = await base.execute(sql`
		SELECT f.id, o.nombre, f.persona_base_id FROM flujo_operaciones f JOIN operaciones o ON o.id = f.operacion_id
		WHERE f.flujo_id = ${flujoId} AND f.baja_en IS NULL ORDER BY f.orden`);
	return z.array(z.object({ id: z.uuid(), nombre: z.string(), persona_base_id: z.uuid() })).parse(rows);
}

/** Pone a cada operación de cada flujo su tarifa de la muestra, desde el primero de septiembre. */
async function ponerTarifas(base: Base, hacer: Hacer, flujoIds: ReadonlyMap<string, string>): Promise<void> {
	for (const [clave, flujo] of Object.entries(flujosDeLaMuestra)) {
		const operaciones = await operacionesDe(base, flujoIds.get(clave) ?? "");
		for (const [i, operacion] of operaciones.entries()) {
			const pesos = flujo.operaciones[i]?.[2] ?? 0;
			await hacer(
				"personal.poner_tarifa_operacion",
				{ flujo_operacion_id: operacion.id, tarifa_centavos: Math.round(pesos * 100) },
				undefined,
				aLas("2026-09-01", 11),
			);
		}
	}
}

/** Las tallas normales de una prenda, en su orden: las que reparte la muestra. */
async function variantesNormales(base: Base, productoId: string): Promise<string[]> {
	const { rows } = await base.execute(sql`
		SELECT v.id FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
		WHERE v.producto_id = ${productoId} AND NOT v.es_pedido_especial AND v.baja_en IS NULL ORDER BY g.orden, t.orden`);
	return z
		.array(z.object({ id: z.uuid() }))
		.parse(rows)
		.map((fila) => fila.id);
}

/**
 * Cierra el corte de un lote con la tela de su receta que hay en Bodega, en el orden de sus folios. Si sobra un rollo
 * al final, la acción lo dice y se vuelve a cerrar sin él.
 */
async function cortar(
	base: Base,
	hacer: Hacer,
	corte: {
		loteId: string;
		productoId: string;
		dia: string;
		tallas: { variante_id: string; piezas: number }[];
		cortador: string;
	},
): Promise<void> {
	const { rows } = await base.execute(sql`
		SELECT r.version_vigente_id AS version, l.material_id
		FROM recetas r JOIN receta_lineas l ON l.receta_version_id = r.version_vigente_id
		JOIN materiales m ON m.id = l.material_id AND m.tipo = 'tela' WHERE r.producto_id = ${corte.productoId}`);
	const receta = z.array(z.object({ version: z.uuid(), material_id: z.uuid() })).parse(rows);
	const telas = [];
	for (const { material_id } of receta) {
		const { rows: suyos } = await base.execute(sql`
			SELECT e.rollo_id FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.codigo = 'BOD'
			JOIN rollos r ON r.id = e.rollo_id WHERE e.material_id = ${material_id} AND e.cantidad > 0 ORDER BY r.folio`);
		const rollos = z.array(z.object({ rollo_id: z.uuid() })).parse(suyos);
		telas.push({ material_id, rollos });
	}
	for (;;) {
		try {
			await hacer(
				"produccion.cerrar_corte",
				{
					lote_id: corte.loteId,
					receta_version_id: receta[0]?.version,
					telas,
					tallas: corte.tallas.filter((talla) => talla.piezas > 0),
					corto_persona_id: corte.cortador,
				},
				await versionDe(base, "lotes", corte.loteId),
				aLas(corte.dia, 12),
			);
			return;
		} catch (error) {
			const deMas = telas.find((tela) => tela.rollos.length > 1);
			if (!(error instanceof ErrorDeApi && error.codigo === "rollo_sin_usar") || deMas === undefined) throw error;
			for (const tela of telas) if (tela.rollos.length > 1) tela.rollos.pop();
		}
	}
}

/** Da de alta la tablet del taller de la muestra, como un aparato ya registrado, con una llave que nadie tiene. */
async function registrarTablet(base: Base): Promise<void> {
	const [taller] = await base.select({ id: ubicaciones.id }).from(ubicaciones).where(eq(ubicaciones.codigo, "TAL"));
	await base.insert(dispositivos).values({
		id: tabletDelTaller,
		folio: "DV-0001",
		nombre: "Tablet del taller",
		tipo: "tablet_taller",
		ubicacionId: taller?.id ?? null,
		llaveId: randomBytes(6).toString("hex"),
		llaveHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
	});
	await base
		.insert(dispositivosSync)
		.values({ id: tabletDelTaller, dispositivoId: tabletDelTaller, versionApp: "1.0.0" });
}

/**
 * La tablet sube los registros de un lote cortado como su cola: por operación, a nombre de quien la hace de base, en
 * los días entre el corte y el día que dice la muestra; lo bueno y lo dañado de cada operación se reparten bulto por
 * bulto sin pasar de lo que hizo la anterior en ese bulto.
 */
async function subirRegistros(
	base: Base,
	registro: RegistroDeModulos,
	lote: LoteDeLaMuestra,
	loteId: string,
): Promise<void> {
	const { corte } = lote;
	if (corte === undefined) return;
	const { rows } = await base.execute(sql`SELECT id, piezas FROM bultos WHERE lote_id = ${loteId} ORDER BY numero`);
	const bultos = z.array(z.object({ id: z.uuid(), piezas: z.number() })).parse(rows);
	const { rows: delLote } = await base.execute(sql`SELECT flujo_id FROM lotes WHERE id = ${loteId}`);
	const operaciones = await operacionesDe(base, z.object({ flujo_id: z.uuid() }).parse(delLote[0]).flujo_id);
	const buenas = buenasPorOperacion(corte.hechas, corte.merma);
	const dias = Temporal.PlainDate.from(corte.dia).until(corte.hasta).days;
	let anteriores = bultos.map((bulto) => bulto.piezas);
	for (const [i, operacion] of operaciones.entries()) {
		if (i === 0) continue;
		const dia = Temporal.PlainDate.from(corte.dia)
			.add({ days: Math.ceil((i * dias) / (operaciones.length - 1)) })
			.toString();
		let faltanBuenas = buenas[i] ?? 0;
		let faltanDanadas = corte.merma[i] ?? 0;
		const hechas: number[] = [];
		for (const [j, bulto] of bultos.entries()) {
			const llegaron = anteriores[j] ?? 0;
			const danadas = Math.min(faltanDanadas, llegaron);
			const buenasDelBulto = Math.min(faltanBuenas, llegaron - danadas);
			faltanDanadas -= danadas;
			faltanBuenas -= buenasDelBulto;
			hechas.push(buenasDelBulto);
			if (buenasDelBulto + danadas === 0) continue;
			await subirComando(base, registro, operacion.persona_base_id, {
				accion: "produccion.registrar_operacion",
				datos: {
					id: uuidv7(),
					bulto_id: bulto.id,
					flujo_operacion_id: operacion.id,
					piezas_buenas: buenasDelBulto,
					piezas_danadas: danadas,
					sin_internet: false,
				},
				ocurrido_en: aLas(dia, 16).add({ minutes: j }).toString(),
				persona_id: operacion.persona_base_id,
			});
		}
		anteriores = hechas;
	}
}

/**
 * Un comando de la tablet, en su transacción: se aplica a nombre de su persona con la hora en que pasó y se guarda en
 * `comandos_recibidos`, como en la subida. Uno que no se aplica es un error de la muestra.
 */
async function subirComando(
	base: Base,
	registro: RegistroDeModulos,
	personaId: string,
	carga: { accion: string; datos: unknown; ocurrido_en: string; persona_id: string },
): Promise<void> {
	const aparato: AparatoQueLlama = {
		tipo: "aparato",
		dispositivoId: tabletDelTaller,
		tipoDeAparato: "tablet",
		personaId,
	};
	const comando = { id: uuidv7(), clave: uuidv7() };
	const dependencias = {
		registro,
		servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: escribirBitacoraConAdmin },
	};
	await enTransaccion(base, async (transaccion) => {
		const hecho = await aplicarComando(dependencias, transaccion, aparato, carga, comando);
		if (hecho.respuesta.resultado === "apartado") {
			throw new Error(`la tablet no pudo registrar: ${hecho.motivo} ${hecho.respuesta.avisos.join(" ")}`);
		}
		await guardarComando(transaccion, { ...comando, aparato, carga, hecho, revocado: false });
	});
}
