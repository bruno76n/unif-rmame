/**
 * `compras.orden`: el cajón de una orden de compra. Sus datos, sus avisos (atrasada, cancelada o cerrada con
 * faltante), lo que se pidió contra lo recibido y lo que falta con su precio vigente, el total, y qué se puede hacer
 * con ella según su estado; «Capturar nota o factura» solo si ya llegó algo y la cuenta tiene Contaduría.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Orden de compra») y docs/modulos/compras/ordenes-de-compra.md (reglas
 * 4 a 12)
 */

import { deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { diaDeNegocio, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { ordenDeCompra } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { cantidadConUnidad } from "@uniformame/compartido/contratos/compras/textos";
import { Temporal } from "temporal-polyfill";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import { nombreDeCuenta } from "../../../nucleo/acciones/comunes.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { condicionDeOrden, estadoDeOrden, type OrdenResumida, ordenesResumidas } from "./comun.ts";

/** Los estados que ya terminaron: muestran cuándo llegó. */
const terminadas = ["recibida", "cerrada", "cerrada_con_faltante"];

/**
 * El día de negocio de un momento guardado.
 * @param momento El momento ISO.
 */
function dia(momento: string): string {
	return diaDeNegocio(Temporal.Instant.from(momento)).toString();
}

/**
 * Los avisos del cajón: «Debía llegar el {fecha}. Lleva {n} días de atraso.», «Cancelada el {fecha} por {persona}.
 * {motivo}» o «Cerrada con faltante el {fecha} por {persona}. Faltó {…}. {motivo}».
 * @param accion El contexto de la lectura.
 * @param orden La orden.
 */
async function avisosDe(accion: ContextoDeAccion, orden: OrdenResumida): Promise<string[]> {
	if (orden.diasAtraso > 0 && orden.fechaPrometida !== null) {
		return [
			`Debía llegar el ${textoDeDiaCorto(orden.fechaPrometida)}. Lleva ${plural(orden.diasAtraso, "día", "días")} de atraso.`,
		];
	}
	if (orden.estado === "cancelada" && orden.canceladoEn !== null) {
		const quien = await nombreDeCuenta(accion, orden.canceladoPor);
		return [
			`Cancelada el ${textoDeDiaCorto(dia(orden.canceladoEn))} por ${quien}. ${orden.motivoCancelacion ?? ""}`.trim(),
		];
	}
	if (orden.estado === "cerrada_con_faltante" && orden.cerradaEn !== null) {
		const quien = await nombreDeCuenta(accion, orden.cerradaPor);
		const falto = orden.lineas
			.filter((linea) => linea.falta > 0n)
			.map((linea) => `${cantidadConUnidad(linea.falta, linea.unidad)} de ${linea.material}`)
			.join(", ");
		return [
			`Cerrada con faltante el ${textoDeDiaCorto(dia(orden.cerradaEn))} por ${quien}. Faltó ${falto}. ${orden.motivoCierre ?? ""}`.trim(),
		];
	}
	return [];
}

export const consultaOrden = implementarConsulta(ordenDeCompra, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const [orden] = await ordenesResumidas(accion, { ids: [parametros.orden_compra_id] });
		if (orden === undefined) throw noExiste();
		const hoy = accion.diaDeNegocio;
		const { quien } = contexto;
		const conContaduria = tieneDepartamento(quien, "contaduria");
		const conAlgoRecibido = orden.lineas.some((linea) => linea.recibido > 0n);
		const ultima = orden.recepciones.at(-1);
		return {
			orden: {
				orden_compra_id: orden.id,
				version: orden.version,
				folio: orden.folio,
				estado: ordenDeCompra.resultado.shape.orden.shape.estado.parse(orden.estado),
				estado_armado: estadoDeOrden(orden.estado, orden.diasAtraso),
				proveedor_id: orden.proveedorId,
				proveedor: orden.proveedor,
				condicion: condicionDeOrden(orden),
				levanto: await nombreDeCuenta(accion, orden.creadoPor),
				creada: orden.fecha,
				enviada: orden.enviadaEn === null ? null : dia(orden.enviadaEn),
				fecha_prometida: orden.fechaPrometida,
				llego: terminadas.includes(orden.estado) ? (ultima ?? null) : null,
				dice_tardar: orden.diasDiceTardar,
				fecha_propuesta: hoy.add({ days: orden.diasDiceTardar }).toString(),
				fecha_maxima: hoy.add({ days: await parametroNumero(accion, "compras.dias_max_fecha_prometida") }).toString(),
				avisos: await avisosDe(accion, orden),
				pdf_archivo_id: orden.pdfArchivoId,
			},
			lineas: orden.lineas.map((linea) => ({
				orden_compra_linea_id: linea.id,
				material_id: linea.materialId,
				material: linea.material,
				unidad: linea.unidad,
				multiplo: Number(linea.multiplo),
				pedido: deMilesimos(linea.pedido),
				recibido: deMilesimos(linea.recibido),
				falta: deMilesimos(linea.falta),
				falta_rojo: orden.diasAtraso > 0 && linea.falta > 0n,
				precio_centavos: linea.precioCentavos,
				precio_orden_centavos:
					linea.precioNotaCentavos !== null && linea.precioNotaCentavos !== linea.precioOrdenCentavos
						? linea.precioOrdenCentavos
						: null,
				importe_centavos: linea.importeCentavos,
			})),
			total_centavos: orden.totalCentavos,
			cantidad_maxima: await parametroNumero(accion, "compras.cantidad_maxima_linea"),
			puede: {
				editar: orden.estado === "borrador",
				cancelar: orden.estado === "enviada",
				cerrar_con_faltante: orden.estado === "recibida_en_parte",
				capturar_factura: conAlgoRecibido && conContaduria && orden.estado !== "cancelada",
			},
		};
	}),
}));
