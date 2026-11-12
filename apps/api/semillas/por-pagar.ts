/**
 * Lo que la fábrica debe en la muestra: las facturas de sus proveedores (conciliadas y detenidas), las deudas con sus
 * acreedores con las mensualidades que ya se pagaron, los dos depósitos de clientes a la cuenta de un tercero que
 * quedan sin aplicar, y los dos descuentos semanales de la nómina.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md y la muestra
 * (`docs/interfaz/muestra/sistema-alameda.html`: `CX_CXP`, `CP_FACT_LIST`, `CX_PAG` y `PER`)
 *
 * Se carga con las acciones del sistema, como Rosa (Contaduría, con «ven sueldos y tarifas»), en el día que dice la
 * muestra. Lo que no se puede reproducir se ajusta (decisión 715):
 * - las facturas van a la orden de su proveedor y su material, porque los folios OC- siguen al contador; sin IVA,
 *   como las trae la muestra; la FP-8790 y la FP-0388 son de órdenes que la muestra no tiene, así que no se cargan;
 * - cada deuda nace con todas sus mensualidades, una por mes hasta la que la muestra dice que sigue, y las de antes
 *   se pagan en su día; cada pago, con su «Confirmar con Google» en una sesión de carga suya;
 * - la semana de la nómina de la muestra sigue abierta: no nace ninguna nómina.
 * Los folios FP-, PR- y PG- siguen a sus contadores. Si ya hay facturas de proveedor, no hace nada.
 */

import { join } from "node:path";
import { and, asc, eq, lt } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { materiales, ordenCompraLineas, ordenesCompra, proveedores } from "../src/modulos/compras/tablas.ts";
import { cuentasPorPagar, deudaMensualidades, facturasProveedor, terceros } from "../src/modulos/contaduria/tablas.ts";
import { personas } from "../src/modulos/personal/tablas.ts";
import { notasEntrega } from "../src/modulos/ventas/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { cargarModulos, type RegistroDeModulos } from "../src/nucleo/modulos.ts";
import { nombreDeMaterial, nombreDeProveedor } from "./compras-y-patronaje.ts";
import { enSesionDeCarga, type Hacer } from "./correr.ts";

/** Rosa (`cuentas.ts`), con Contaduría y «ven sueldos y tarifas», en la sesión de esta carga. */
const rosa: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000006",
	sesionId: "01936f2e-0000-7000-8000-0000000000fc",
	esDuena: false,
	esSoporte: false,
	departamentos: ["compras", "catalogo", "patronaje", "ventas", "linea", "contaduria", "personal", "admin"],
	permisosFinos: ["ven_sueldos_y_tarifas"],
	confirmadoConGoogleEn: undefined,
};

/** Una hora de un día de la muestra, en hora de México (UTC−6). */
const aLas = (dia: string, hora: number) =>
	Temporal.PlainDate.from(dia)
		.toZonedDateTime({ timeZone: "-06:00", plainTime: { hour: hora } })
		.toInstant();

/** Una factura de la muestra: su folio en la muestra, su proveedor, su material, su día y su total en pesos. */
const facturasDeLaMuestra: readonly [string, string, string | null, string, number][] = [
	["0377", "p5", "m10", "2026-09-07", 4_900],
	["0915", "p6", "m13", "2026-09-14", 2_832],
	// Facturaron 520 m y llegaron 500 m: queda detenida, a cargo de Contaduría.
	["8841", "p1", "m01", "2026-10-06", 40_560],
	["1172", "p3", "m07", "2026-10-08", 40_800],
	// De una orden que no ha llegado: queda detenida, a cargo de Aduana.
	["2207", "p7", null, "2026-10-09", 3_170],
];

/** Una deuda de la muestra: a quién, qué es, el importe de cada mensualidad, cuántas y cuál sigue y cuándo vence. */
interface DeudaDeLaMuestra {
	acreedor: { nombre: string; clase: "persona" | "banco" } | { cliente: string };
	descripcion: string;
	mensualidadPesos: number;
	mensualidades: number;
	sigue: number;
	vence: string;
}

/** Las deudas de la muestra. */
const deudasDeLaMuestra: readonly DeudaDeLaMuestra[] = [
	{
		acreedor: { nombre: "Ing. Ramón Villaseñor", clase: "persona" },
		descripcion: "Préstamo personal",
		mensualidadPesos: 15_000,
		mensualidades: 20,
		sigue: 8,
		vence: "2026-10-15",
	},
	{
		acreedor: { nombre: "Banorte", clase: "banco" },
		descripcion: "Crédito PyME",
		mensualidadPesos: 22_400,
		mensualidades: 36,
		sigue: 14,
		vence: "2026-10-20",
	},
	{
		acreedor: { cliente: "Distribuidora Escolar Zamora" },
		descripcion: "300 m de gabardina que prestaron en julio",
		mensualidadPesos: 28_500,
		mensualidades: 1,
		sigue: 1,
		vence: "2026-10-31",
	},
];

/**
 * Los depósitos de clientes a la cuenta de un tercero: su nota (quién la recibió y cuándo se entregó, porque los
 * folios NV- siguen al contador), el día, los pesos, la referencia y a quién.
 */
const depositosDeLaMuestra: readonly [[string, string], string, number, string, string][] = [
	// La NV-0129 de la muestra.
	[["Profra. Elena Castillo", "2026-09-08"], "2026-10-02", 12_000, "Transferencia 5520", "Ing. Ramón Villaseñor"],
	// La NV-0131 de la muestra.
	[["Lucía Herrera", "2026-09-05"], "2026-10-07", 26_000, "Depósito 0049213", nombreDeProveedor("p1")],
];

/** Los descuentos semanales de la nómina: la persona, los pesos y por qué. */
const descuentosDeLaMuestra: readonly [string, number, string][] = [
	["Lupita Ramos", 300, "Abono a préstamo"],
	["Sergio Gómez", 200, "Anticipo de sueldo"],
];

/**
 * La orden enviada de un proveedor de la muestra con ese material (o la primera de ese proveedor), y su tercero.
 * @param base La base.
 * @param proveedor La clave del proveedor en la muestra.
 * @param material La clave del material, si se sabe.
 */
async function ordenDe(base: Base, proveedor: string, material: string | null): Promise<string> {
	const filas = await base
		.select({ id: ordenesCompra.id, material: materiales.nombre })
		.from(ordenesCompra)
		.innerJoin(proveedores, eq(proveedores.id, ordenesCompra.proveedorId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.innerJoin(ordenCompraLineas, eq(ordenCompraLineas.ordenCompraId, ordenesCompra.id))
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.where(eq(terceros.nombre, nombreDeProveedor(proveedor)))
		.orderBy(ordenesCompra.folio);
	const orden = material === null ? filas[0] : filas.find((fila) => fila.material === nombreDeMaterial(material));
	if (orden === undefined) throw new Error(`no hay orden de ${proveedor} con ${material ?? "nada"}`);
	return orden.id;
}

/**
 * El id de un tercero por su nombre.
 * @param base La base.
 * @param nombre Su nombre.
 */
async function terceroDe(base: Base, nombre: string): Promise<string> {
	const [tercero] = await base.select({ id: terceros.id }).from(terceros).where(eq(terceros.nombre, nombre));
	if (tercero === undefined) throw new Error(`no está el tercero ${nombre}`);
	return tercero.id;
}

/**
 * Paga una cuenta por pagar en su día, con «Confirmar con Google» de ese momento, en una sesión de carga suya.
 * @param base La base.
 * @param registro Lo que registraron los módulos.
 * @param cuentaId La cuenta.
 * @param pesos Lo que se paga.
 * @param cuando Cuándo.
 * @param referencia Su referencia.
 */
async function pagarEnSuDia(
	base: Base,
	registro: RegistroDeModulos,
	cuentaId: string,
	pesos: number,
	cuando: Temporal.Instant,
	referencia: string,
): Promise<void> {
	const conGoogle: CuentaQueLlama = { ...rosa, sesionId: uuidv7(), confirmadoConGoogleEn: cuando };
	await enSesionDeCarga(base, registro, conGoogle, async (hacer) => {
		const [cuenta] = await base
			.select({ version: cuentasPorPagar.version })
			.from(cuentasPorPagar)
			.where(eq(cuentasPorPagar.id, cuentaId));
		await hacer(
			"contaduria.pagar_cuenta_por_pagar",
			{ cuenta_por_pagar_id: cuentaId, monto_centavos: pesos * 100, medio: "cuenta_fabrica", referencia },
			cuenta?.version,
			cuando,
		);
	});
}

/** Captura las facturas de la muestra, cada una en su día. */
async function capturarFacturas(base: Base, hacer: Hacer): Promise<void> {
	for (const [folio, proveedor, material, dia, pesos] of facturasDeLaMuestra) {
		await hacer(
			"contaduria.capturar_factura_proveedor",
			{
				ordenes: [{ orden_compra_id: await ordenDe(base, proveedor, material) }],
				folio_proveedor: folio,
				fecha_factura: dia,
				subtotal_centavos: pesos * 100,
				iva_centavos: 0,
				total_centavos: pesos * 100,
			},
			undefined,
			aLas(dia, 11),
		);
	}
}

/** Registra las deudas de la muestra y paga en su día las mensualidades que ya pasaron. */
async function registrarDeudas(base: Base, registro: RegistroDeModulos, hacer: Hacer): Promise<void> {
	for (const deuda of deudasDeLaMuestra) {
		const primera = Temporal.PlainDate.from(deuda.vence).subtract({ months: deuda.sigue - 1 });
		const acreedor =
			"cliente" in deuda.acreedor
				? { tercero_id: await terceroDe(base, deuda.acreedor.cliente) }
				: { tercero_nuevo: deuda.acreedor };
		const registrada = z.object({ deuda_id: z.uuid() }).parse(
			await hacer(
				"contaduria.registrar_deuda",
				{
					...acreedor,
					descripcion: deuda.descripcion,
					monto_total_centavos: deuda.mensualidadPesos * deuda.mensualidades * 100,
					numero_mensualidades: deuda.mensualidades,
					primer_vencimiento: primera.toString(),
				},
				undefined,
				aLas(primera.subtract({ months: 1 }).toString(), 10),
			),
		);
		const pagadas = await base
			.select({ id: cuentasPorPagar.id, vence: cuentasPorPagar.vence })
			.from(cuentasPorPagar)
			.innerJoin(deudaMensualidades, eq(deudaMensualidades.id, cuentasPorPagar.deudaMensualidadId))
			.where(and(eq(deudaMensualidades.deudaId, registrada.deuda_id), lt(deudaMensualidades.numero, deuda.sigue)))
			.orderBy(asc(deudaMensualidades.numero));
		for (const [i, cuenta] of pagadas.entries()) {
			await pagarEnSuDia(
				base,
				registro,
				cuenta.id,
				deuda.mensualidadPesos,
				aLas(cuenta.vence, 12),
				`Mensualidad ${i + 1}`,
			);
		}
	}
}

/** Registra los depósitos de clientes a la cuenta de un tercero, para aplicarse después. */
async function registrarDepositos(base: Base, hacer: Hacer): Promise<void> {
	for (const [[recibio, entregada], dia, pesos, referencia, tercero] of depositosDeLaMuestra) {
		const [nota] = await base
			.select({ id: notasEntrega.id, clienteId: notasEntrega.clienteId })
			.from(notasEntrega)
			.where(and(eq(notasEntrega.recibioNombre, recibio), eq(notasEntrega.fechaEntrega, entregada)));
		if (nota === undefined) throw new Error(`no está la nota que recibió ${recibio} el ${entregada}`);
		await hacer(
			"contaduria.registrar_pago_recibido",
			{
				cliente_id: nota.clienteId,
				nota_entrega_id: nota.id,
				monto_centavos: pesos * 100,
				medio: "cuenta_tercero",
				referencia,
				tercero_deposito_id: await terceroDe(base, tercero),
				aplicar: "despues",
			},
			undefined,
			aLas(dia, 12),
		);
	}
}

/** Pone los descuentos semanales de la nómina. */
async function ponerDescuentos(base: Base, hacer: Hacer): Promise<void> {
	for (const [nombre, pesos, motivo] of descuentosDeLaMuestra) {
		const [persona] = await base.select({ id: personas.id }).from(personas).where(eq(personas.nombre, nombre));
		if (persona === undefined) throw new Error(`no está ${nombre}`);
		await hacer(
			"contaduria.guardar_descuento_semanal",
			{ persona_id: persona.id, monto_semanal_centavos: pesos * 100, motivo },
			undefined,
			aLas("2026-10-05", 9),
		);
	}
}

/**
 * Carga lo que la fábrica debe en la muestra.
 * @param base La base, con el rol dueño.
 */
export async function cargarPorPagarDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base.select({ id: facturasProveedor.id }).from(facturasProveedor).limit(1);
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	await enSesionDeCarga(base, registro, rosa, async (hacer) => {
		await capturarFacturas(base, hacer);
		await registrarDeudas(base, registro, hacer);
		await registrarDepositos(base, hacer);
		await ponerDescuentos(base, hacer);
	});
}
