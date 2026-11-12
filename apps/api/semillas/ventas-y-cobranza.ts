/**
 * Ventas y cobranza de la muestra: los seis clientes con su lista, su crédito y su semáforo; sus pedidos (los
 * entregados, los abiertos con sus versiones y los borradores), los anticipos, las notas de entrega de lo que ya se
 * entregó y los pagos a esas notas, en el día que dice la muestra.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Cómo se construye») y la muestra
 * (`docs/interfaz/muestra/sistema-alameda.html`: `CLIENTES`, `PRODUCTOS`, `CX_CRED`, `PEDIDOS`, `NOTAS` y `CX_PAG`)
 *
 * Se carga con las mismas acciones del sistema: Rosa (Ventas, Catálogo y Contaduría) da de alta a los clientes, sus
 * precios, su crédito, los pedidos, las notas y los pagos; Javier (Aduana) despacha las notas. Lo que el sistema no
 * puede hacer con la muestra se ajusta (decisión 695): lo que salió de los lotes viejos de cada nota entra listo en
 * aduana como carga inicial; la muestra no tiene la dirección ni el teléfono de los clientes; el pantalón azul marino
 * se abre a externos (la muestra lo vende a un mayorista); los abiertos se mandan a producción con lo que les falta y
 * sus lotes quedan por cortar; los pagos a la cuenta de un tercero llegan con la fase 17. Los folios siguen al
 * contador. Si ya hay clientes, no hace nada.
 */

import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { escuelas, tallas, variantes } from "../src/modulos/catalogo/tablas.ts";
import { escribirMovimiento } from "../src/modulos/inventario/dominio/escribir-movimiento.ts";
import { crearReserva } from "../src/modulos/inventario/dominio/reservas.ts";
import { crearTraspaso } from "../src/modulos/inventario/dominio/traspasos.ts";
import { traspasos, ubicaciones } from "../src/modulos/inventario/tablas.ts";
import { clientes, notasEntrega } from "../src/modulos/ventas/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import { crearContexto } from "../src/nucleo/acciones/corredor.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { enTransaccion } from "../src/nucleo/base/transacciones.ts";
import { cargarModulos, type RegistroDeModulos } from "../src/nucleo/modulos.ts";
import { escuelasDeLaMuestra } from "./catalogo.ts";
import { productosPorClave } from "./compras-y-patronaje.ts";
import { enSesionDeCarga, type Hacer, idDe } from "./correr.ts";

/** Rosa (`cuentas.ts`), con Ventas, Catálogo y Contaduría, en la sesión de esta carga. */
const rosa: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000006",
	sesionId: "01936f2e-0000-7000-8000-0000000000fa",
	esDuena: false,
	esSoporte: false,
	departamentos: ["compras", "catalogo", "patronaje", "ventas", "linea", "contaduria", "personal", "admin"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Javier (`cuentas.ts`), con Aduana y Bodega, en la sesión de esta carga. */
const javier: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000007",
	sesionId: "01936f2e-0000-7000-8000-0000000000fb",
	esDuena: false,
	esSoporte: false,
	departamentos: ["aduana", "bodega"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Un cliente de la muestra: su clave, su nombre, su tipo, su municipio, su límite en pesos y sus días de crédito. */
interface ClienteDeLaMuestra {
	clave: string;
	nombre: string;
	tipo: "escuela" | "mayorista";
	municipio: string;
	limitePesos: number;
	dias: number;
	semaforo: "al_corriente" | "cerca_del_limite" | "detenido";
	/** El % sobre mostrador de su lista, si lo tiene. */
	porcentaje?: number;
}

/** Los clientes de la muestra, en su orden. */
const clientesDeLaMuestra: readonly ClienteDeLaMuestra[] = [
	{
		clave: "cm",
		nombre: "Colegio Morelos",
		tipo: "escuela",
		municipio: "Yurécuaro",
		limitePesos: 150_000,
		dias: 30,
		semaforo: "al_corriente",
	},
	{
		clave: "jp",
		nombre: "Instituto Juan Pablo II",
		tipo: "escuela",
		municipio: "La Piedad",
		limitePesos: 120_000,
		dias: 30,
		semaforo: "cerca_del_limite",
	},
	{
		clave: "st",
		nombre: "Secundaria Técnica 12",
		tipo: "escuela",
		municipio: "Zamora",
		limitePesos: 100_000,
		dias: 30,
		semaforo: "al_corriente",
	},
	{
		clave: "dz",
		nombre: "Distribuidora Escolar Zamora",
		tipo: "mayorista",
		municipio: "Zamora",
		limitePesos: 200_000,
		dias: 15,
		semaforo: "al_corriente",
		porcentaje: 12,
	},
	{
		clave: "gm",
		nombre: "Jardín de Niños Gabriela Mistral",
		tipo: "escuela",
		municipio: "Numarán",
		limitePesos: 30_000,
		dias: 30,
		semaforo: "al_corriente",
	},
	{
		clave: "eb",
		nombre: "Uniformes El Bajío",
		tipo: "mayorista",
		municipio: "Pénjamo",
		limitePesos: 80_000,
		dias: 30,
		semaforo: "detenido",
		porcentaje: 15,
	},
];

/** Los precios de la lista de cada cliente en la muestra: producto, cliente y pesos. */
const preciosDeClientes: readonly [string, string, number][] = [
	["P01", "dz", 140],
	["P01", "eb", 145],
	["P02", "cm", 215],
	["P03", "jp", 210],
	["P08", "st", 260],
	["P11", "cm", 395],
	["P12", "cm", 340],
	["P13", "st", 385],
	["P17", "dz", 295],
	["P18", "dz", 375],
	["P18", "eb", 380],
	["P19", "jp", 690],
	["P20", "gm", 420],
	["P23", "cm", 520],
	["P24", "jp", 310],
	["P25", "gm", 185],
	["P27", "st", 330],
];

/** Un renglón de un pedido de la muestra: el producto, las piezas por talla y, si se dio, el precio en pesos. */
type RenglonDeLaMuestra = [string, Record<string, number>, number?];

/** Un pedido de la muestra. */
interface PedidoDeLaMuestra {
	folio: string;
	cliente: string;
	renglones: RenglonDeLaMuestra[];
	entrega: string;
	pago: "anticipo" | "contado" | "credito";
	creada: string;
	/** El día en que se confirmó; sin él, es un borrador. */
	confirmado?: string;
	/** Una versión 2: el día y, por producto y talla, las piezas con que se confirmó antes de cambiar. */
	version?: { dia: string; antes: [string, string, number][] };
	/** El anticipo, como la parte del total que pagó, el día y la referencia. */
	anticipo?: { parte: number; dia: string; medio: "efectivo" | "cuenta_fabrica"; referencia: string };
	/** Si sigue abierto: el día y la hora en que se manda a producción lo que le falta, una o más veces. */
	mandar?: [string, number][];
}

/** Los pedidos de la muestra, en el orden en que se confirmaron. */
// biome-ignore format: un pedido por renglón se lee mejor
const pedidosDeLaMuestra: readonly PedidoDeLaMuestra[] = [
	{ folio: "PE-0108", cliente: "eb", renglones: [["P01", { 6: 14, 8: 18, 10: 22, 12: 22, 14: 18, 16: 16 }, 140], ["P18", { 6: 12, 8: 16, 10: 20, 12: 20, 14: 18, 16: 14 }, 370]], entrega: "2026-07-30", pago: "credito", creada: "2026-07-08", confirmado: "2026-07-08" },
	{ folio: "PE-0114", cliente: "eb", renglones: [["P01", { 6: 15, 8: 19, 10: 23, 12: 23, 14: 19, 16: 16 }, 140], ["P18", { 6: 16, 8: 21, 10: 25, 12: 26, 14: 23, 16: 19 }, 370]], entrega: "2026-08-14", pago: "credito", creada: "2026-07-22", confirmado: "2026-07-22" },
	{ folio: "PE-0124", cliente: "cm", renglones: [["P11", { 8: 10, 10: 12, 12: 14, 14: 12, 16: 12 }], ["P12", { 6: 10, 8: 12, 10: 14, 12: 14, 14: 10 }, 330]], entrega: "2026-09-08", pago: "credito", creada: "2026-08-14", confirmado: "2026-08-14" },
	{ folio: "PE-0126", cliente: "jp", renglones: [["P19", { 8: 8, 10: 12, 12: 14, 14: 14, 16: 12 }], ["P03", { 6: 16, 8: 26, 10: 32, 12: 36, 14: 32, 16: 26, CH: 18 }, 200]], entrega: "2026-09-05", pago: "credito", creada: "2026-08-16", confirmado: "2026-08-16" },
	{ folio: "PE-0130", cliente: "st", renglones: [["P08", { 12: 40, 14: 50, 16: 50, 18: 40 }]], entrega: "2026-09-20", pago: "credito", creada: "2026-08-28", confirmado: "2026-08-28" },
	{ folio: "PE-0133", cliente: "eb", renglones: [["P01", { 6: 40, 8: 50, 10: 60, 12: 60, 14: 50, 16: 40 }], ["P18", { 6: 25, 8: 35, 10: 40, 12: 40, 14: 35, 16: 25 }]], entrega: "2026-09-18", pago: "credito", creada: "2026-09-01", confirmado: "2026-09-01" },
	{ folio: "PE-0131", cliente: "dz", renglones: [["P17", { 8: 40, 10: 55, 12: 60, 14: 55, 16: 40 }]], entrega: "2026-09-26", pago: "credito", creada: "2026-09-01", confirmado: "2026-09-01" },
	{ folio: "PE-0138", cliente: "cm", renglones: [["P11", { 8: 10, 10: 15, 12: 15, 14: 10, 16: 10 }]], entrega: "2026-09-27", pago: "credito", creada: "2026-09-09", confirmado: "2026-09-09" },
	{ folio: "PE-0141", cliente: "dz", renglones: [["P01", { 6: 50, 8: 70, 10: 80, 12: 80, 14: 70, 16: 50 }]], entrega: "2026-09-29", pago: "credito", creada: "2026-09-12", confirmado: "2026-09-12" },
	{ folio: "PE-0142", cliente: "cm", renglones: [["P23", { 4: 10, 6: 30, 8: 40, 10: 40, 12: 35, 14: 25 }], ["P12", { 6: 20, 8: 30, 10: 30, 12: 30, 14: 20 }]], entrega: "2026-10-24", pago: "anticipo", creada: "2026-09-22", confirmado: "2026-09-22", version: { dia: "2026-10-02", antes: [["P23", "12", 30], ["P23", "14", 20]] }, anticipo: { parte: 0.5, dia: "2026-10-09", medio: "cuenta_fabrica", referencia: "SPEI 7781" }, mandar: [["2026-10-02", 9], ["2026-10-02", 11]] },
	{ folio: "PE-0143", cliente: "dz", renglones: [["P17", { 8: 40, 10: 55, 12: 60, 14: 55, 16: 40 }]], entrega: "2026-10-09", pago: "credito", creada: "2026-09-24", confirmado: "2026-09-24", mandar: [["2026-09-26", 9]] },
	{ folio: "PE-0144", cliente: "cm", renglones: [["P02", { 6: 15, 8: 20, 10: 20, 12: 20, 14: 15 }]], entrega: "2026-10-14", pago: "anticipo", creada: "2026-09-26", confirmado: "2026-09-26", anticipo: { parte: 0.5, dia: "2026-10-08", medio: "efectivo", referencia: "Recibo 2210" }, mandar: [["2026-10-04", 9]] },
	{ folio: "PE-0145", cliente: "jp", renglones: [["P03", { 8: 20, 10: 25, 12: 25, 14: 25, 16: 25 }], ["P19", { 8: 10, 10: 15, 12: 20, 14: 20, 16: 15 }]], entrega: "2026-10-12", pago: "credito", creada: "2026-09-28", confirmado: "2026-09-28", mandar: [["2026-10-10", 17]] },
	{ folio: "PE-0146", cliente: "st", renglones: [["P08", { 12: 40, 14: 50, 16: 40, 18: 30 }], ["P27", { 28: 20, 30: 25, 32: 40, 34: 35, 36: 25 }]], entrega: "2026-10-30", pago: "anticipo", creada: "2026-10-06", confirmado: "2026-10-07", version: { dia: "2026-10-10", antes: [["P08", "14", 40], ["P27", "30", 30]] }, mandar: [["2026-10-08", 9]] },
	{ folio: "PE-0147", cliente: "jp", renglones: [["P24", { 6: 6, 8: 8, 10: 10, 12: 8, 14: 8 }]], entrega: "2026-11-06", pago: "anticipo", creada: "2026-10-07" },
	{ folio: "PE-0149", cliente: "dz", renglones: [["P28", { 28: 30, 30: 40, 32: 50, 34: 40, 36: 30 }]], entrega: "2026-11-03", pago: "credito", creada: "2026-10-08", confirmado: "2026-10-08", mandar: [["2026-10-08", 13]] },
	{ folio: "PE-0148", cliente: "gm", renglones: [["P25", { 3: 20, 4: 30, 6: 40 }]], entrega: "2026-11-13", pago: "contado", creada: "2026-10-08" },
];

/** Una nota de entrega de la muestra: su pedido, lo que llevó (todo el pedido si no se dice) y su entrega. */
interface NotaDeLaMuestra {
	folio: string;
	pedido: string;
	renglones?: RenglonDeLaMuestra[];
	creada: string;
	entregada: string;
	recibio: string;
}

/** Las notas de la muestra, todas entregadas, en el orden en que se armaron. */
// biome-ignore format: una nota por renglón se lee mejor
const notasDeLaMuestra: readonly NotaDeLaMuestra[] = [
	{ folio: "NV-0117", pedido: "PE-0108", creada: "2026-07-29", entregada: "2026-07-30", recibio: "Arturo Méndez" },
	{ folio: "NV-0121", pedido: "PE-0114", creada: "2026-08-13", entregada: "2026-08-14", recibio: "Arturo Méndez" },
	{ folio: "NV-0131", pedido: "PE-0126", creada: "2026-09-04", entregada: "2026-09-05", recibio: "Lucía Herrera" },
	{ folio: "NV-0129", pedido: "PE-0124", creada: "2026-09-04", entregada: "2026-09-08", recibio: "Profra. Elena Castillo" },
	{ folio: "NV-0133", pedido: "PE-0133", creada: "2026-09-17", entregada: "2026-09-18", recibio: "Arturo Méndez" },
	{ folio: "NV-0134", pedido: "PE-0130", creada: "2026-09-19", entregada: "2026-09-20", recibio: "Ing. Raúl Ortega" },
	{ folio: "NV-0136", pedido: "PE-0131", creada: "2026-09-25", entregada: "2026-09-26", recibio: "Jorge Salgado" },
	{ folio: "NV-0138", pedido: "PE-0138", creada: "2026-09-26", entregada: "2026-09-27", recibio: "Profra. Elena Castillo" },
	{ folio: "NV-0141", pedido: "PE-0141", creada: "2026-09-28", entregada: "2026-09-29", recibio: "Jorge Salgado" },
	{ folio: "NV-0142", pedido: "PE-0145", renglones: [["P03", { 8: 20, 10: 25, 12: 25 }]], creada: "2026-10-09", entregada: "2026-10-10", recibio: "Lucía Herrera" },
];

/** Los pagos de la muestra a la cuenta de la fábrica: la nota, el día, los pesos y la referencia. */
const pagosDeLaMuestra: readonly [string, string, number, string][] = [
	// La muestra dice lo que pagó la NV-0117, sin su día ni su referencia: a 30 días de su entrega (decisión 695).
	["NV-0117", "2026-08-29", 34_000, "Pago de la NV-0117"],
	["NV-0133", "2026-09-28", 59_750, "SPEI 4402"],
	["NV-0138", "2026-09-30", 11_850, "SPEI 5108"],
	["NV-0141", "2026-10-05", 56_000, "SPEI 6619"],
];

/** Una hora de un día de la muestra, en hora de México (UTC−6). */
const aLas = (dia: string, hora: number) =>
	Temporal.PlainDate.from(dia)
		.toZonedDateTime({ timeZone: "-06:00", plainTime: { hour: hora } })
		.toInstant();

/** Lo que una carga necesita para hablar de la muestra con los ids del sistema. */
interface Ids {
	productos: Map<string, string>;
	clientes: Map<string, string>;
	pedidos: Map<string, string>;
	variante: (producto: string, talla: string) => Promise<string>;
}

/**
 * Carga Ventas y cobranza de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarVentasYCobranzaDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base.select({ id: clientes.id }).from(clientes).limit(1);
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	const cache = new Map<string, string>();
	const ids: Ids = {
		productos: await productosPorClave(base),
		clientes: new Map(),
		pedidos: new Map(),
		variante: async (producto, talla) => {
			const clave = `${producto}:${talla}`;
			const ya = cache.get(clave);
			if (ya !== undefined) return ya;
			const [encontrada] = await base
				.select({ id: variantes.id })
				.from(variantes)
				.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
				.where(and(eq(variantes.productoId, ids.productos.get(producto) ?? ""), eq(tallas.nombre, talla)));
			if (encontrada === undefined) throw new Error(`no está la talla ${talla} de ${producto}`);
			cache.set(clave, encontrada.id);
			return encontrada.id;
		},
	};
	await enSesionDeCarga(base, registro, rosa, async (hacer) => {
		await enSesionDeCarga(base, registro, javier, async (despacha) => {
			await cargarClientes(base, hacer, ids);
			// Lo demás, en el orden de los días de la muestra.
			const agenda = [...pasosDePedidos(base, hacer, ids), ...pasosDeNotas(base, registro, ids, { hacer, despacha })];
			agenda.sort((uno, otro) => Temporal.Instant.compare(uno.cuando, otro.cuando));
			for (const paso of agenda) {
				try {
					await paso.hacer();
				} catch (error) {
					throw new Error(`la carga se detuvo en ${paso.que} (${paso.cuando.toString()})`, { cause: error });
				}
			}
			// El semáforo lo pone Contaduría al final, con lo que debe cada cliente.
			for (const cliente of clientesDeLaMuestra) {
				if (cliente.semaforo === "al_corriente") continue;
				const clienteId = ids.clientes.get(cliente.clave) ?? "";
				await hacer(
					"contaduria.cambiar_semaforo_credito",
					{ cliente_id: clienteId, semaforo: cliente.semaforo },
					await versionDelCredito(base, clienteId),
					aLas("2026-10-10", 9),
				);
			}
		});
	});
}

/** La versión del crédito de un cliente. */
async function versionDelCredito(base: Base, clienteId: string): Promise<number> {
	const filas = await base.execute(sql`SELECT version::int AS v FROM credito_clientes WHERE cliente_id = ${clienteId}`);
	return z.number().parse(filas.rows[0]?.v);
}

/** La versión de una fila de una tabla, por su id. */
async function versionDe(base: Base, tabla: "productos" | "pedidos" | "notas_entrega" | "traspasos", id: string) {
	const filas = await base.execute(sql`SELECT version::int AS v FROM ${sql.identifier(tabla)} WHERE id = ${id}`);
	return z.number().parse(filas.rows[0]?.v);
}

/** Los clientes con su lista, su %, sus precios y su crédito (el semáforo va al final). */
async function cargarClientes(base: Base, hacer: Hacer, ids: Ids): Promise<void> {
	const listas = new Map<string, string>();
	for (const [i, cliente] of clientesDeLaMuestra.entries()) {
		const escuela =
			cliente.tipo === "escuela"
				? await base
						.select({ id: escuelas.id })
						.from(escuelas)
						.where(eq(escuelas.nombre, escuelasDeLaMuestra[cliente.clave]?.nombre ?? cliente.nombre))
				: [];
		const alta = await hacer(
			"ventas.crear_cliente",
			{
				nombre: cliente.nombre,
				tipo: cliente.tipo,
				...(escuela[0] === undefined ? {} : { escuela_id: escuela[0].id }),
				municipio: cliente.municipio,
				direccion_entrega: `Domicilio conocido, ${cliente.municipio}`,
				telefono: `45200000${String(i + 1).padStart(2, "0")}`,
			},
			undefined,
			aLas("2026-07-01", 9),
		);
		const clienteId = idDe(alta, "cliente_id");
		ids.clientes.set(cliente.clave, clienteId);
		listas.set(cliente.clave, idDe(alta, "lista_id"));
		if (cliente.porcentaje !== undefined) {
			await hacer(
				"catalogo.cambiar_porcentajes_cliente",
				{ lista_id: idDe(alta, "lista_id"), pct_basicos: cliente.porcentaje, pct_especiales: cliente.porcentaje },
				await versionDeLista(base, idDe(alta, "lista_id")),
				aLas("2026-07-01", 9),
			);
		}
		await hacer(
			"contaduria.cambiar_limite_credito",
			{ cliente_id: clienteId, limite_centavos: cliente.limitePesos * 100 },
			await versionDelCredito(base, clienteId),
			aLas("2026-07-01", 10),
		);
		await hacer(
			"contaduria.cambiar_dias_credito",
			{ cliente_id: clienteId, dias_credito: cliente.dias },
			await versionDelCredito(base, clienteId),
			aLas("2026-07-01", 10),
		);
	}
	// El pantalón azul marino se vende a externos: la muestra se lo vende a un mayorista.
	const pantalon = ids.productos.get("P28") ?? "";
	await hacer(
		"catalogo.aplicar_cambios_producto",
		{ producto_id: pantalon, canales: { externos: true } },
		await versionDe(base, "productos", pantalon),
		aLas("2026-07-01", 11),
	);
	for (const [producto, cliente, pesos] of preciosDeClientes) {
		const productoId = ids.productos.get(producto) ?? "";
		await hacer(
			"catalogo.aplicar_cambios_producto",
			{
				producto_id: productoId,
				precios: [{ lista_id: listas.get(cliente), variante_id: null, precio_centavos: pesos * 100 }],
			},
			await versionDe(base, "productos", productoId),
			aLas("2026-07-01", 11),
		);
	}
}

/** La versión de una lista de precios. */
async function versionDeLista(base: Base, listaId: string): Promise<number> {
	const filas = await base.execute(sql`SELECT version::int AS v FROM listas_precios WHERE id = ${listaId}`);
	return z.number().parse(filas.rows[0]?.v);
}

/** Los renglones de un pedido con sus variantes; con `antes`, las piezas con que se confirmó antes de su versión 2. */
async function renglonesDe(ids: Ids, pedido: PedidoDeLaMuestra, antes: readonly [string, string, number][] = []) {
	const renglones: { variante_id: string; cantidad: number; precio_dado_centavos?: number }[] = [];
	for (const [producto, porTalla, pesos] of pedido.renglones) {
		for (const [talla, piezas] of Object.entries(porTalla)) {
			const previa = antes.find(([suyo, suya]) => suyo === producto && suya === talla);
			renglones.push({
				variante_id: await ids.variante(producto, talla),
				cantidad: previa?.[2] ?? piezas,
				...(pesos === undefined ? {} : { precio_dado_centavos: pesos * 100 }),
			});
		}
	}
	return renglones;
}

/** Un paso de la carga: cuándo pasó en la muestra y qué se hace. */
interface Paso {
	cuando: Temporal.Instant;
	/** Qué es, para decirlo si falla. */
	que: string;
	hacer: () => Promise<void>;
}

/**
 * Los pasos de los pedidos: confirmarlos (o guardar el borrador), sus versiones, sus anticipos y mandar a producción
 * lo que les falta, cada uno en su día. Así PE-0146 se manda antes de su versión 2 y queda su cambio por aplicar, y
 * PE-0142 se manda otra vez con las piezas que subió su versión.
 */
function pasosDePedidos(base: Base, hacer: Hacer, ids: Ids): Paso[] {
	const pasos: Paso[] = [];
	for (const pedido of pedidosDeLaMuestra) {
		const clienteId = () => ids.clientes.get(pedido.cliente) ?? "";
		const pedidoId = () => ids.pedidos.get(pedido.folio) ?? "";
		const datos = async (antes?: readonly [string, string, number][]) => ({
			cliente_id: clienteId(),
			fecha_entrega: pedido.entrega,
			forma_pago: pedido.pago,
			renglones: await renglonesDe(ids, pedido, antes),
		});
		pasos.push({
			que: `confirmar ${pedido.folio}`,
			cuando: aLas(pedido.confirmado ?? pedido.creada, 10),
			hacer: async () => {
				const guardado =
					pedido.confirmado === undefined
						? await hacer("ventas.guardar_borrador_pedido", await datos(), undefined, aLas(pedido.creada, 10))
						: await hacer(
								"ventas.confirmar_pedido",
								await datos(pedido.version?.antes),
								undefined,
								aLas(pedido.confirmado, 10),
							);
				ids.pedidos.set(pedido.folio, idDe(guardado, "pedido_id"));
			},
		});
		const { version, anticipo } = pedido;
		if (version !== undefined) {
			pasos.push({
				que: `la versión 2 de ${pedido.folio}`,
				cuando: aLas(version.dia, 10),
				hacer: async () => {
					await hacer(
						"ventas.guardar_version_pedido",
						{ ...(await datos()), pedido_id: pedidoId() },
						await versionDe(base, "pedidos", pedidoId()),
						aLas(version.dia, 10),
					);
				},
			});
		}
		if (anticipo !== undefined) {
			pasos.push({
				que: `el anticipo de ${pedido.folio}`,
				cuando: aLas(anticipo.dia, 12),
				hacer: async () => {
					const total = await totalDelPedido(base, pedidoId());
					await hacer(
						"contaduria.registrar_pago_recibido",
						{
							cliente_id: clienteId(),
							pedido_id: pedidoId(),
							monto_centavos: Math.round((total * anticipo.parte) / 100) * 100,
							medio: anticipo.medio,
							...(anticipo.medio === "efectivo" ? {} : { referencia: anticipo.referencia }),
						},
						undefined,
						aLas(anticipo.dia, 12),
					);
				},
			});
		}
		for (const [dia, hora] of pedido.mandar ?? []) {
			pasos.push({
				que: `mandar ${pedido.folio} a producción`,
				cuando: aLas(dia, hora),
				hacer: async () => {
					await hacer(
						"ventas.mandar_a_produccion",
						{ pedido_id: pedidoId() },
						await versionDe(base, "pedidos", pedidoId()),
						aLas(dia, hora),
					);
				},
			});
		}
	}
	return pasos;
}

/** Los pasos de las notas (armarla, despacharla y entregarla) y de los pagos a ellas, cada uno en su día. */
function pasosDeNotas(
	base: Base,
	registro: RegistroDeModulos,
	ids: Ids,
	quien: { hacer: Hacer; despacha: Hacer },
): Paso[] {
	const notaIds = new Map<string, string>();
	return [
		...notasDeLaMuestra.map((nota) => ({
			que: `la ${nota.folio}`,
			cuando: aLas(nota.creada, 8),
			hacer: async () => {
				notaIds.set(nota.folio, await entregarNota(base, registro, ids, nota, quien));
			},
		})),
		...pagosDeLaMuestra.map(([folio, dia, pesos, referencia]) => ({
			que: `el pago de la ${folio}`,
			cuando: aLas(dia, 12),
			hacer: async () => {
				const notaId = notaIds.get(folio) ?? "";
				const [nota] = await base
					.select({ clienteId: notasEntrega.clienteId })
					.from(notasEntrega)
					.where(eq(notasEntrega.id, notaId));
				await quien.hacer(
					"contaduria.registrar_pago_recibido",
					{
						cliente_id: nota?.clienteId,
						nota_entrega_id: notaId,
						monto_centavos: pesos * 100,
						medio: "cuenta_fabrica",
						referencia,
					},
					undefined,
					aLas(dia, 12),
				);
			},
		})),
	];
}

/** El total de un pedido con sus renglones vigentes, en centavos. */
async function totalDelPedido(base: Base, pedidoId: string): Promise<number> {
	const filas = await base.execute(
		sql`SELECT sum(cantidad * precio_unitario_centavos)::int AS t FROM pedido_renglones
			WHERE pedido_id = ${pedidoId} AND hasta_version IS NULL`,
	);
	return z.number().parse(filas.rows[0]?.t);
}

/**
 * Una nota de la muestra, ya entregada: lo que llevó entra listo en aduana para su pedido como carga inicial (el lote
 * viejo de donde salió no está), Rosa la arma en su día, Javier la despacha y Rosa confirma la entrega con quién firmó.
 * @returns La nota.
 */
async function entregarNota(
	base: Base,
	registro: RegistroDeModulos,
	ids: Ids,
	nota: NotaDeLaMuestra,
	quien: { hacer: Hacer; despacha: Hacer },
): Promise<string> {
	const pedido = pedidosDeLaMuestra.find((suyo) => suyo.folio === nota.pedido);
	if (pedido === undefined) throw new Error(`no está el pedido ${nota.pedido}`);
	const pedidoId = ids.pedidos.get(pedido.folio) ?? "";
	const lleva = await renglonesDe(ids, { ...pedido, renglones: nota.renglones ?? pedido.renglones });
	const armadaEn = aLas(nota.creada, 9);
	await ponerListoEnAduana(base, registro, pedidoId, lleva, armadaEn);
	const { hacer, despacha } = quien;
	const armada = await hacer(
		"ventas.armar_nota_entrega",
		{
			pedido_id: pedidoId,
			renglones: lleva.map((renglon) => ({ variante_id: renglon.variante_id, cantidad: renglon.cantidad })),
		},
		await versionDe(base, "pedidos", pedidoId),
		aLas(nota.creada, 11),
	);
	const notaId = idDe(armada, "nota_id");
	{
		const suyos = await base.select({ id: traspasos.id }).from(traspasos).where(eq(traspasos.notaEntregaId, notaId));
		const conVersion = [];
		for (const suyo of suyos)
			conVersion.push({ traspaso_id: suyo.id, version: await versionDe(base, "traspasos", suyo.id) });
		await despacha("inventario.despachar", { traspasos: conVersion }, undefined, aLas(nota.entregada, 8));
	}
	await hacer(
		"ventas.confirmar_entrega",
		{ nota_id: notaId, recibio_nombre: nota.recibio },
		await versionDe(base, "notas_entrega", notaId),
		aLas(nota.entregada, 16),
	);
	return notaId;
}

/**
 * Pone listo en aduana para un pedido lo que lleva una nota de la muestra: un A- `lote_cliente`, las piezas que entran
 * a Aduana como carga inicial y su reserva `pedido_externo`, como las deja la recepción del taller.
 */
async function ponerListoEnAduana(
	base: Base,
	registro: RegistroDeModulos,
	pedidoId: string,
	renglones: readonly { variante_id: string; cantidad: number }[],
	ahora: Temporal.Instant,
): Promise<void> {
	await enTransaccion(base, async (transaccion) => {
		const { contexto } = crearContexto(
			registro,
			transaccion,
			javier,
			"muestra.listo_en_aduana",
			ahora,
			undefined,
			undefined,
			uuidv7(),
		);
		const lugares = await transaccion.select({ id: ubicaciones.id, codigo: ubicaciones.codigo }).from(ubicaciones);
		const lugar = (codigo: string) => lugares.find((suyo) => suyo.codigo === codigo)?.id ?? "";
		const nuevo = await crearTraspaso(contexto, {
			tipo: "lote_cliente",
			estado: "en_aduana",
			origen: { ubicacionId: lugar("TAL") },
			destino: { externo: "cliente_externo" },
			renglones: renglones.map((renglon) => ({ varianteId: renglon.variante_id, piezas: renglon.cantidad })),
			referencias: { pedidoId },
		});
		await escribirMovimiento(contexto, {
			tipo: "carga_inicial",
			documento: { tipo: "traspaso", id: nuevo.traspasoId, folio: nuevo.folio },
			renglones: renglones.map((renglon) => ({
				origen: null,
				destino: lugar("ADU"),
				varianteId: renglon.variante_id,
				piezas: renglon.cantidad,
				traspasoId: nuevo.traspasoId,
			})),
		});
		for (const renglon of renglones) {
			await crearReserva(contexto, {
				ubicacionId: lugar("ADU"),
				varianteId: renglon.variante_id,
				piezas: renglon.cantidad,
				motivo: "pedido_externo",
				pedidoId,
				traspasoId: nuevo.traspasoId,
			});
		}
	});
}
