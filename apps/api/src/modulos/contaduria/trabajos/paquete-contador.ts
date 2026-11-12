/**
 * Los trabajos del paquete del contador: «Crear el paquete del mes», el día 1 a las 00:20, y «Armar el archivo del
 * paquete», al mandarlo: un ZIP con la relación en CSV y los comprobantes de sus gastos y de las facturas del mes.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md (regla 1, «Trabajos»)
 *
 * Los dos son repetibles: el paquete del mes es único y un paquete con archivo ya no se vuelve a armar.
 */

import { textoDeMes } from "@uniformame/compartido/calculos/fechas";
import { and, asc, eq, gte, isNotNull, isNull, lt, or } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { listaValores } from "../../admin/tablas.ts";
import { type ArchivoDelZip, armarZip } from "../dominio/zip.ts";
import { facturasProveedor, gastos, paqueteContadorRenglones, paquetesContador } from "../tablas.ts";

/**
 * Crea, si no existe, el paquete del mes que terminó: «Por enviar», con su fecha límite (regla 1).
 * @param contexto El contexto de la transacción del trabajo.
 * @returns El paquete que nació, o nada si ya estaba.
 */
export async function crearPaqueteDelMes(contexto: ContextoDeAccion): Promise<string | undefined> {
	const mes = contexto.diaDeNegocio.with({ day: 1 }).subtract({ months: 1 });
	const dia = Number(await leerParametro(contexto.transaccion, { clave: "contaduria.contador_dia_limite" }));
	const id = uuidv7();
	const [nuevo] = await contexto.transaccion
		.insert(paquetesContador)
		.values({ id, mes: mes.toString(), fechaLimite: mes.add({ months: 1 }).with({ day: dia }).toString() })
		.onConflictDoNothing()
		.returning({ id: paquetesContador.id });
	if (nuevo === undefined) return undefined;
	contexto.guardarEvento({
		tipo: "paquete_contador.creado",
		datos: { paquete_contador_id: id },
		tablas: ["paquetes_contador"],
		entidad: "paquetes_contador",
		entidadId: id,
	});
	contexto.bitacora({
		descripcion: `Nació el paquete de ${textoDeMes(mes)} para el contador`,
		entidad: "paquetes_contador",
		entidadId: id,
		despues: { estado: "por_enviar" },
	});
	return id;
}

export const crearPaqueteMes: Trabajo = {
	nombre: "contaduria.crear_paquete_mes",
	horario: async () => ({ cada: "mes", dia: 1, hora: "00:20" }),
	correr: async (contexto) => {
		await contexto.enTransaccion(crearPaqueteDelMes);
	},
};

/** Lo que regresa `admin.datos_de_archivo`. */
const datosDelArchivo = z.object({ nombre_original: z.string(), almacen_clave: z.string() });

/** Un monto en centavos como lo lee una hoja de cálculo: «1250.50». */
function enPesosCsv(centavos: number): string {
	return `${Math.trunc(centavos / 100)}.${String(Math.abs(centavos) % 100).padStart(2, "0")}`;
}

/**
 * La relación del paquete en CSV: un renglón por concepto, con su categoría, si es de meses anteriores, su monto en
 * pesos y cuántos documentos cubre.
 */
async function relacionCsv(contexto: ContextoDeAccion, paqueteId: string): Promise<string> {
	const renglones = await contexto.transaccion
		.select({
			concepto: paqueteContadorRenglones.concepto,
			categoria: listaValores.nombre,
			deMesesAnteriores: paqueteContadorRenglones.deMesesAnteriores,
			monto: paqueteContadorRenglones.montoCentavos,
			documentos: paqueteContadorRenglones.documentos,
		})
		.from(paqueteContadorRenglones)
		.leftJoin(listaValores, eq(listaValores.id, paqueteContadorRenglones.categoriaId))
		.where(eq(paqueteContadorRenglones.paqueteContadorId, paqueteId))
		.orderBy(asc(paqueteContadorRenglones.creadoEn), asc(paqueteContadorRenglones.id));
	const comillas = (texto: string) => `"${texto.replaceAll('"', '""')}"`;
	return [
		"concepto,categoria,de_meses_anteriores,monto,documentos",
		...renglones.map((renglon) =>
			[
				renglon.concepto,
				comillas(renglon.categoria ?? ""),
				renglon.deMesesAnteriores ? "si" : "no",
				enPesosCsv(renglon.monto),
				String(renglon.documentos),
			].join(","),
		),
	].join("\r\n");
}

/**
 * Arma el ZIP de un paquete mandado sin archivo y lo guarda: la relación, los comprobantes de sus gastos y el XML y el
 * PDF de las facturas de proveedor del mes. Un comprobante que ya no está en el almacén se salta.
 * @param contexto El contexto de la transacción del trabajo, con su almacén.
 * @param paquete El paquete.
 */
async function armarArchivo(contexto: ContextoDeAccion, paquete: { id: string; mes: string }): Promise<void> {
	const { transaccion, almacen } = contexto;
	if (almacen === undefined) throw new Error("no hay almacén de archivos para armar el paquete del contador");
	const siguiente = Temporal.PlainDate.from(paquete.mes).add({ months: 1 }).toString();
	const deGastos = await transaccion
		.select({ folio: gastos.folio, archivo: gastos.comprobanteArchivoId })
		.from(gastos)
		.where(and(eq(gastos.paqueteContadorId, paquete.id), isNotNull(gastos.comprobanteArchivoId)));
	const deFacturas = await transaccion
		.select({
			folio: facturasProveedor.folio,
			xml: facturasProveedor.archivoXmlId,
			pdf: facturasProveedor.archivoPdfId,
		})
		.from(facturasProveedor)
		.where(
			and(
				gte(facturasProveedor.fechaCaptura, paquete.mes),
				lt(facturasProveedor.fechaCaptura, siguiente),
				or(isNotNull(facturasProveedor.archivoXmlId), isNotNull(facturasProveedor.archivoPdfId)),
			),
		);
	const porLeer = [
		...deGastos.map((gasto) => ({ carpeta: "gastos", folio: gasto.folio, archivo: gasto.archivo })),
		...deFacturas.flatMap((factura) => [
			{ carpeta: "facturas", folio: factura.folio, archivo: factura.xml },
			{ carpeta: "facturas", folio: factura.folio, archivo: factura.pdf },
		]),
	];
	const archivos: ArchivoDelZip[] = [
		{ nombre: "relacion.csv", contenido: new TextEncoder().encode(await relacionCsv(contexto, paquete.id)) },
	];
	for (const { carpeta, folio, archivo } of porLeer) {
		if (archivo === null) continue;
		const datos = datosDelArchivo.parse(await contexto.lectura("admin.datos_de_archivo", { archivo_id: archivo }));
		const contenido = await almacen.leer(datos.almacen_clave);
		if (contenido !== undefined) {
			archivos.push({ nombre: `${carpeta}/${folio} ${datos.nombre_original}`, contenido });
		}
	}
	const { archivo_id } = z.object({ archivo_id: z.uuid() }).parse(
		await contexto.interna("admin.guardar_archivo", {
			contenido: armarZip(archivos),
			proposito: "documento_contador",
			modulo: "contaduria",
			entidad: "paquetes_contador",
			entidad_id: paquete.id,
			nombre_original: `Paquete ${textoDeMes(paquete.mes)}.zip`,
			tipo_mime: "application/zip",
		}),
	);
	await transaccion.update(paquetesContador).set({ archivoId: archivo_id }).where(eq(paquetesContador.id, paquete.id));
	contexto.bitacora({
		descripcion: `Se armó el archivo del paquete de ${textoDeMes(paquete.mes)}: ${archivos.length - 1} comprobantes`,
		entidad: "paquetes_contador",
		entidadId: paquete.id,
		despues: { archivo_id },
	});
}

export const armarArchivoPaquete: Trabajo = {
	nombre: "contaduria.armar_archivo_paquete",
	trasEventos: ["paquete_contador.enviado"],
	correr: async (contexto) => {
		const sinArchivo = await contexto.base
			.select({ id: paquetesContador.id, mes: paquetesContador.mes })
			.from(paquetesContador)
			.where(and(eq(paquetesContador.estado, "enviado"), isNull(paquetesContador.archivoId)));
		for (const paquete of sinArchivo) {
			await contexto.enTransaccion((enEsta) => armarArchivo(enEsta, paquete));
		}
	},
};
