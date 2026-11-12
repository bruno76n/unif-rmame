/**
 * `inventario.recibir_de_proveedor`: Aduana recibe lo que llegó de una orden de compra. Nacen la recepción, las
 * partidas nuevas, los rollos con el costo de su línea, el A- del material ya en aduana con destino Bodega y el
 * movimiento de Fuera a Aduana; lo de más pide autorización a Dirección. Todo en una transacción.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (reglas 3, 4 y 9; «`inventario.recibir_de_proveedor`»)
 *
 * Fase 17 · la revisión de las facturas de la orden (`contaduria.revisar_facturas_de_orden`), con su mensaje sin
 * montos y su renglón de bitácora con la misma clave
 *
 * Aduana nunca recibe un costo: el del metro lo pone el servidor con `compras.precio_vigente_lineas`.
 */

import {
	aMilesimos,
	aMilesimosConSigno,
	cantidadEnTexto,
	deMilesimos,
} from "@uniformame/compartido/calculos/cuenta-material";
import { recibirDeProveedor } from "@uniformame/compartido/contratos/inventario/recepciones";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { partidasDe } from "../dominio/partidas.ts";
import {
	candadoDeLoRecibido,
	facturasRevisadas,
	type OrdenParaInventario,
	ordenesDeCompras,
	recibidoDeLineas,
	ubicacionDeTipo,
} from "../dominio/recepciones.ts";
import { crearTraspaso, type RenglonDeTraspaso } from "../dominio/traspasos.ts";
import { recepciones, recepcionLineas, rollos } from "../tablas.ts";

/** Una línea de la orden como la usa la recepción. */
type LineaDeLaOrden = OrdenParaInventario["lineas"][number];

/** Lo que regresa `compras.precio_vigente_lineas`. */
const precios = z.record(z.string(), z.number().int());

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `compras.recalcular_estado_orden`. */
const estadoRecalculado = z.object({ estado: z.string() });

/** Cómo se dice el estado de una orden que no se puede recibir. */
const estadoEnPalabras: Readonly<Record<string, string>> = {
	borrador: "en borrador",
	cancelada: "cancelada",
	recibida: "recibida",
	cerrada: "cerrada",
	cerrada_con_faltante: "cerrada con faltante",
};

/** Un renglón de lo que llegó: un rollo (con sus metros y su partida) o la cantidad de un material. */
interface LoQueLlega {
	linea: LineaDeLaOrden;
	milesimos: bigint;
	partida: string | null;
}

/**
 * Revisa lo que llegó contra las líneas de la orden y lo pone en renglones: uno por rollo y uno por cada otro
 * material.
 * @throws `422 linea_ajena`; `400` con «Metros», «Cantidad», «Número entero» o «Escribe lo que llegó».
 */
function loQueLlega(
	folio: string,
	lineas: readonly LineaDeLaOrden[],
	materiales: z.infer<typeof recibirDeProveedor.entrada>["materiales"],
): LoQueLlega[] {
	const campos: Record<string, string> = {};
	const renglones: LoQueLlega[] = [];
	for (const [i, material] of materiales.entries()) {
		const linea = lineas.find((suya) => suya.orden_compra_linea_id === material.orden_compra_linea_id);
		if (linea === undefined) throw errorDeRegla("linea_ajena", `Ese material no es de ${folio}.`);
		if (linea.tipo === "tela") {
			const suyos = material.rollos ?? [];
			if (suyos.length === 0) campos[`materiales.${i}.rollos.0.metros`] ??= "Metros";
			for (const rollo of suyos) {
				renglones.push({ linea, milesimos: aMilesimos(rollo.metros), partida: rollo.partida.toUpperCase() });
			}
			continue;
		}
		if (material.cantidad === undefined) {
			campos[`materiales.${i}.cantidad`] ??= "Cantidad";
			continue;
		}
		const milesimos = aMilesimos(material.cantidad);
		if (linea.se_cuenta_entera && milesimos % 1000n !== 0n) {
			campos[`materiales.${i}.cantidad`] ??= "Número entero";
			continue;
		}
		renglones.push({ linea, milesimos, partida: null });
	}
	const [primero] = Object.values(campos);
	if (primero !== undefined) throw new ErrorDeApi("validacion", null, primero, { campos });
	if (renglones.every((renglon) => renglon.milesimos === 0n)) {
		throw new ErrorDeApi("validacion", null, "Escribe lo que llegó", {
			campos: { materiales: "Escribe lo que llegó" },
		});
	}
	return renglones;
}

/**
 * Lo de más de una línea que todavía no está en una autorización: lo que pasa de lo pedido después de esta
 * recepción, si pasa del umbral (en la tela, lo pedido más `inventario.porcentaje_de_mas_tela`), menos lo que ya se
 * pidió antes. Lo pedido antes es lo que ya pasaba de lo pedido si ya pasaba del umbral: lo rechazado ya regresó y
 * bajó lo recibido.
 * @returns En milésimos; cero si no hay que pedir nada.
 */
function deMasPorPedir(pedido: bigint, antes: bigint, despues: bigint, umbral: bigint): bigint {
	if (despues <= umbral) return 0n;
	const yaPedido = antes > umbral ? antes - pedido : 0n;
	const deMas = despues - pedido - yaPedido;
	return deMas > 0n ? deMas : 0n;
}

export const accionRecibirDeProveedor = implementarAccion(recibirDeProveedor, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [orden] = await ordenesDeCompras(contexto, [datos.orden_compra_id]);
	if (orden === undefined) throw noExiste();
	const noRecibible = () =>
		errorDeRegla(
			"orden_no_recibible",
			`${orden.folio} no se puede recibir: está ${estadoEnPalabras[orden.estado] ?? orden.estado}`,
		);
	if (!orden.se_puede_recibir) throw noRecibible();
	await candadoDeLoRecibido(contexto, orden.orden_compra_id);
	// La orden y las ligadas por sus facturas, antes que nada: Contaduría las revisa juntas al final (decisión 716).
	await contexto.interna("contaduria.bloquear_ordenes_ligadas", { orden_compra_id: orden.orden_compra_id });
	const renglones = loQueLlega(orden.folio, orden.lineas, datos.materiales);
	const lineaIds = [...new Set(renglones.map((renglon) => renglon.linea.orden_compra_linea_id))];
	const recibidoAntes = await recibidoDeLineas(transaccion, lineaIds);
	const costos = precios.parse(
		await contexto.lectura("compras.precio_vigente_lineas", { orden_compra_linea_ids: lineaIds }),
	);
	const [aduana, bodega] = [await ubicacionDeTipo(transaccion, "aduana"), await ubicacionDeTipo(transaccion, "bodega")];
	const quien = quienCambia(contexto);
	// Lo que cambia en cada línea: lo que había, lo que llega y si hubo diferencia contra lo que faltaba.
	const porLinea = lineaIds.map((id) => {
		const suyos = renglones.filter((renglon) => renglon.linea.orden_compra_linea_id === id);
		const linea = suyos[0]?.linea;
		if (linea === undefined) throw new Error(`la línea ${id} no llegó`);
		const pedido = aMilesimos(linea.pedido);
		const antes = aMilesimosConSigno(recibidoAntes[id] ?? "0");
		const llega = suyos.reduce((suma, renglon) => suma + renglon.milesimos, 0n);
		const falta = pedido > antes ? pedido - antes : 0n;
		return { linea, pedido, antes, llega, falta };
	});
	const recepcionId = uuidv7();
	await transaccion.insert(recepciones).values({
		id: recepcionId,
		tipo: "aduana_de_proveedor",
		ubicacionId: aduana,
		modo: "completo",
		ordenCompraId: orden.orden_compra_id,
		recibidoEn: contexto.ahora.toString(),
		recibidoPor: quien,
		huboDiferencia: porLinea.some((linea) => linea.llega !== linea.falta),
		creadoPor: quien,
	});
	// Las partidas y los rollos de cada tela.
	const rollosNuevos: { rolloId: string; folio: string; renglon: LoQueLlega; partidaId: string }[] = [];
	for (const { linea } of porLinea.filter((suya) => suya.linea.tipo === "tela")) {
		const suyos = renglones.filter((renglon) => renglon.linea === linea);
		const partidas = await partidasDe(
			contexto,
			orden.proveedor_id,
			linea.material_id,
			suyos.map((renglon) => renglon.partida ?? ""),
			recepcionId,
		);
		for (const renglon of suyos) {
			const rolloId = uuidv7();
			const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "rollo" }));
			const partidaId = partidas.get(renglon.partida ?? "") ?? "";
			await transaccion.insert(rollos).values({
				id: rolloId,
				folio,
				materialId: linea.material_id,
				partidaTelaId: partidaId,
				proveedorId: orden.proveedor_id,
				ordenCompraId: orden.orden_compra_id,
				ordenCompraLineaId: linea.orden_compra_linea_id,
				recepcionId,
				metrosIniciales: deMilesimos(renglon.milesimos),
				costoMetroCentavos: costos[linea.orden_compra_linea_id] ?? null,
				estado: "disponible",
				creadoPor: quien,
			});
			rollosNuevos.push({ rolloId, folio, renglon, partidaId });
		}
	}
	const rolloDe = new Map(rollosNuevos.map((nuevo) => [nuevo.renglon, nuevo]));
	// El A- del material, ya en aduana con destino Bodega, y el movimiento de Fuera a Aduana: lo que llegó.
	const conCantidad = renglones.filter((renglon) => renglon.milesimos > 0n);
	const deTraspaso: RenglonDeTraspaso[] = conCantidad.map((renglon) => ({
		materialId: renglon.linea.material_id,
		rolloId: rolloDe.get(renglon)?.rolloId ?? null,
		cantidad: deMilesimos(renglon.milesimos),
	}));
	const traspaso = await crearTraspaso(contexto, {
		tipo: "material_proveedor",
		estado: "en_aduana",
		origen: { externo: "proveedor" },
		destino: { ubicacionId: bodega },
		renglones: deTraspaso,
		referencias: { ordenCompraId: orden.orden_compra_id, recepcionAduanaId: recepcionId },
	});
	const movimiento = await escribirMovimiento(contexto, {
		tipo: "recepcion_proveedor",
		documento: { tipo: "recepcion", id: recepcionId, folio: orden.folio },
		renglones: deTraspaso.map((renglon) => ({
			origen: null,
			destino: aduana,
			materialId: renglon.materialId ?? "",
			rolloId: renglon.rolloId ?? null,
			cantidad: renglon.cantidad ?? "0",
			traspasoId: traspaso.traspasoId,
		})),
	});
	await transaccion
		.update(recepciones)
		.set({ movimientoId: movimiento.movimientoId })
		.where(eq(recepciones.id, recepcionId));
	// El papel: un renglón por rollo y uno por cada otro material; lo esperado (lo que faltaba) en el primero de su línea.
	const yaEsperado = new Set<string>();
	await transaccion.insert(recepcionLineas).values(
		renglones.map((renglon, i) => {
			const id = renglon.linea.orden_compra_linea_id;
			const primero = !yaEsperado.has(id);
			yaEsperado.add(id);
			const falta = porLinea.find((suya) => suya.linea.orden_compra_linea_id === id)?.falta ?? 0n;
			return {
				id: uuidv7(),
				recepcionId,
				renglon: i + 1,
				ordenCompraLineaId: id,
				materialId: renglon.linea.material_id,
				rolloId: rolloDe.get(renglon)?.rolloId ?? null,
				partidaTelaId: rolloDe.get(renglon)?.partidaId ?? null,
				cantidadEsperada: primero ? deMilesimos(falta) : null,
				cantidadContada: deMilesimos(renglon.milesimos),
				creadoPor: quien,
			};
		}),
	);
	// La orden pasa a recibida o recibida en parte; si mientras tanto se canceló, no se recibe.
	const { estado } = estadoRecalculado.parse(
		await contexto.interna("compras.recalcular_estado_orden", { orden_compra_id: orden.orden_compra_id }),
	);
	if (estado !== "recibida" && estado !== "recibida_en_parte") throw noRecibible();
	// Lo recibido cambió: Contaduría vuelve a revisar las facturas de la orden (sin montos para Aduana).
	const { facturas } = facturasRevisadas.parse(
		await contexto.interna("contaduria.revisar_facturas_de_orden", { orden_compra_id: orden.orden_compra_id }),
	);
	// Lo de más, por línea, pide autorización a Dirección.
	const porcentajeTela = aMilesimos(
		String(await contexto.lectura("admin.parametro", { clave: "inventario.porcentaje_de_mas_tela" })),
	);
	const deMas: { material: string; cantidad: string; unidad: string }[] = [];
	for (const { linea, pedido, antes, llega } of porLinea) {
		const umbral = linea.tipo === "tela" ? pedido + (pedido * porcentajeTela) / 100_000n : pedido;
		const porPedir = deMasPorPedir(pedido, antes, antes + llega, umbral);
		if (porPedir === 0n) continue;
		const cantidad = cantidadEnTexto(porPedir);
		await contexto.interna("direccion.pedir_autorizacion", {
			tipo: "recepcion_de_mas",
			departamento_origen: "aduana",
			resumen: `Recibir ${cantidad} ${linea.unidad} de más en ${orden.folio} de ${orden.proveedor}`,
			documento: orden.folio,
			cantidad: deMilesimos(porPedir),
			unidad: linea.unidad,
			recepcion_id: recepcionId,
			orden_compra_linea_id: linea.orden_compra_linea_id,
		});
		deMas.push({ material: linea.material, cantidad, unidad: linea.unidad });
	}
	contexto.bitacora({
		descripcion: `Recibió ${orden.folio}`,
		entidad: "recepciones",
		entidadId: recepcionId,
		entidadFolio: orden.folio,
		despues: {
			materiales: porLinea.map(({ linea, llega }) => ({ material: linea.material, cantidad: deMilesimos(llega) })),
			rollos: rollosNuevos.map((nuevo) => nuevo.folio),
			de_mas: deMas,
		},
	});
	for (const factura of facturas) {
		contexto.bitacora({
			descripcion: factura.descripcion,
			entidad: "facturas_proveedor",
			entidadId: factura.factura_proveedor_id,
			entidadFolio: factura.folio,
			despues: { estado: factura.estado },
		});
	}
	contexto.guardarEvento({
		tipo: "recepcion.de_proveedor",
		datos: { recepcion_id: recepcionId, orden_compra_id: orden.orden_compra_id },
		tablas: ["recepciones", "recepcion_lineas", "rollos", "partidas_tela", "existencias_material"],
		entidad: "recepciones",
		entidadId: recepcionId,
	});
	contexto.guardarEvento({
		tipo: "traspaso.en_aduana",
		datos: { traspaso_id: traspaso.traspasoId },
		tablas: ["traspasos", "traspaso_lineas"],
		entidad: "traspasos",
		entidadId: traspaso.traspasoId,
		entidadFolio: traspaso.folio,
	});
	for (const nuevo of rollosNuevos) {
		contexto.guardarEvento({
			tipo: "rollo.recibido",
			datos: { rollo_id: nuevo.rolloId },
			tablas: ["rollos"],
			entidad: "rollos",
			entidadId: nuevo.rolloId,
			entidadFolio: nuevo.folio,
		});
	}
	// Una tela que llega de varias partidas avisa: el tono puede variar.
	const avisos = porLinea
		.filter(({ linea }) => linea.tipo === "tela")
		.map(({ linea }) => new Set(renglones.filter((renglon) => renglon.linea === linea).map((r) => r.partida)).size)
		.filter((partidas) => partidas > 1)
		.map((partidas) => `Llegan ${partidas} partidas distintas`);
	const conDeMas =
		deMas.length === 0
			? ""
			: `. Llegó de más: ${deMas.map((suyo) => `${suyo.cantidad} ${suyo.unidad} de ${suyo.material}`).join(", ")}, espera autorización de Dirección`;
	return {
		resultado: {
			recepcion_id: recepcionId,
			traspaso_id: traspaso.traspasoId,
			folio: traspaso.folio,
			rollos: rollosNuevos.map((nuevo) => ({ rollo_id: nuevo.rolloId, folio: nuevo.folio })),
			mensaje: `${orden.folio} recibida: queda en aduana hasta que bodega la confirme${conDeMas}${facturas
				.map((factura) =>
					factura.estado === "conciliada"
						? `. ${factura.folio} ya se puede pagar`
						: `. ${factura.folio} no cuadra con lo recibido`,
				)
				.join("")}`,
		},
		avisos,
		entidad: { nombre: "recepciones", id: recepcionId },
	};
});
