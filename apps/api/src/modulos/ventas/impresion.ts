/**
 * Los tipos de impresión de Ventas: la hoja del pedido (`pedido`), que saca Ventas, y la de la nota de entrega
 * (`nota_entrega`), que sacan Ventas, Contaduría y Aduana. Juntan los datos con el recorte de quien la pide y los dibujan
 * en `impresos/hojas/`: a quien no ve precios (Aduana) la nota le llega sin precios, importes ni nada de dinero.
 * Fase 20 · docs/impresos/hojas.md («El pedido», «La nota de entrega»)
 *
 * «Por cobrar» es lo que la nota deja por cobrar: su subtotal menos el anticipo aplicado y sus notas de crédito
 * autorizadas. Lo pagado después es de Contaduría y no va en la nota.
 */

import { telefonoEnTexto } from "@uniformame/compartido/calculos/compras";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaConAnio } from "@uniformame/compartido/calculos/fechas";
import { plural, rangoDeTallas } from "@uniformame/compartido/calculos/textos";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { dibujarHojaDeNota } from "../../impresos/hojas/nota-entrega.ts";
import { dibujarHojaDePedido } from "../../impresos/hojas/pedido.ts";
import { marcoDeLaHoja } from "../../nucleo/hojas.ts";
import { errorDeRegla, noExiste } from "../../nucleo/http/errores.ts";
import type { ContextoDeConsulta, TipoDeEtiqueta } from "../../nucleo/modulos.ts";
import {
	avanceDe,
	leerNotasDePedidos,
	leerPedidos,
	leerRenglones,
	type RenglonLeido,
	sumar,
	textoDeFormaDePago,
} from "./consultas/comun.ts";
import { leerLineas, leerNotas } from "./consultas/notas.ts";
import { vePreciosDeNotas } from "./dominio/notas.ts";

/** Lo del cliente que llevan las dos hojas. */
const delCliente = z.object({
	nombre: z.string(),
	contacto: z.string().nullable(),
	telefono: z.string(),
	direccion: z.string(),
});

/**
 * El nombre, el contacto, el teléfono y la dirección de entrega de un cliente.
 * @param contexto El contexto de quien pide la hoja.
 * @param clienteId El cliente.
 */
async function leerCliente(contexto: ContextoDeConsulta, clienteId: string) {
	const { rows } = await contexto.base.execute(sql`SELECT t.nombre, c.contacto, c.telefono,
			c.direccion_entrega AS direccion
		FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE c.id = ${clienteId}::uuid`);
	return delCliente.parse(rows[0]);
}

/**
 * Los renglones de la hoja del pedido: uno por prenda y precio, así las tallas especiales (con su recargo) van en el
 * suyo, marcadas.
 * @param renglones Los renglones vigentes del pedido, por prenda y en el orden de sus tallas.
 */
function renglonesDelPedido(renglones: readonly RenglonLeido[]) {
	const grupos = new Map<string, RenglonLeido[]>();
	for (const renglon of renglones.filter((suyo) => suyo.cantidad > 0)) {
		const clave = `${renglon.producto_id}:${renglon.precio_unitario_centavos}`;
		grupos.set(clave, [...(grupos.get(clave) ?? []), renglon]);
	}
	return [...grupos.values()].map((suyos) => {
		const [primero] = suyos;
		const especiales = suyos.some((renglon) => renglon.recargo_especial_centavos > 0);
		const piezas = suyos.reduce((total, renglon) => total + renglon.cantidad, 0);
		return {
			prenda: primero?.prenda ?? "",
			tallas: `${rangoDeTallas(suyos)}${especiales ? " (especiales)" : ""}`,
			piezas: String(piezas),
			precio: enPesos(primero?.precio_unitario_centavos ?? 0),
			importe: enPesos(
				suyos.reduce((total, renglon) => total + renglon.cantidad * renglon.precio_unitario_centavos, 0),
			),
		};
	});
}

/**
 * El PDF de la hoja de un pedido confirmado o entregado.
 * @param contexto El contexto de quien la pide.
 * @param pedidoId El pedido.
 * @throws `404` si no existe o se canceló; `422 pedido_no_confirmado` si sigue en borrador.
 */
async function hojaDelPedido(contexto: ContextoDeConsulta, pedidoId: string): Promise<Uint8Array> {
	const [pedido] = await leerPedidos(contexto.base, { pedidoId });
	if (pedido === undefined || pedido.estado === "cancelado") throw noExiste();
	if (pedido.estado === "borrador")
		throw errorDeRegla("pedido_no_confirmado", `${pedido.folio} está en borrador: su PDF sale desde que se confirma.`);
	const renglones = await leerRenglones(contexto.base, [pedido.id]);
	const notas = await leerNotasDePedidos(contexto.base, [pedido.id]);
	const cliente = await leerCliente(contexto, pedido.cliente_id);
	// Con notas, lo entregado del avance de Ventas.
	const avance = notas.length === 0 ? null : await avanceDe(contexto, pedido.id);
	const piezas = renglones.reduce((total, renglon) => total + renglon.cantidad, 0);
	const marco = await marcoDeLaHoja(contexto, {
		nombre: "Pedido",
		folio: pedido.folio,
		fecha: `versión ${pedido.version_vigente}`,
	});
	return dibujarHojaDePedido(marco, {
		cliente: [
			cliente.nombre,
			cliente.contacto,
			`Tel. ${telefonoEnTexto(cliente.telefono)}`,
			`Entregar en: ${cliente.direccion}`,
		],
		para: `Para el ${textoDeDiaConAnio(pedido.fecha_entrega)}`,
		formaDePago: textoDeFormaDePago(pedido.forma_pago, pedido.dias_credito),
		renglones: renglonesDelPedido(renglones),
		piezas: String(piezas),
		total: enPesos(
			renglones.reduce((total, renglon) => total + renglon.cantidad * renglon.precio_unitario_centavos, 0),
		),
		entregadas:
			avance === null
				? null
				: `${sumar(avance.tallas, (talla) => talla.entregado)} de ${plural(piezas, "pieza entregada", "piezas entregadas")}`,
	});
}

/** Las notas de crédito autorizadas de una nota. */
const creditosAutorizados = z.array(z.object({ folio: z.string().nullable(), monto_centavos: z.coerce.number() }));

/**
 * Lo de dinero de la hoja de una nota: el precio y el importe de cada renglón, sus cuentas y la forma de pago con su
 * vencimiento.
 * @param contexto El contexto de quien la pide (ya se sabe que ve precios).
 * @param nota La nota.
 * @param lineas Sus renglones.
 */
async function dineroDeLaNota(
	contexto: ContextoDeConsulta,
	nota: Awaited<ReturnType<typeof leerNotas>>[number],
	lineas: Awaited<ReturnType<typeof leerLineas>>,
) {
	const creditos = creditosAutorizados.parse(
		(
			await contexto.base.execute(sql`SELECT folio, monto_centavos FROM notas_credito
			WHERE nota_entrega_id = ${nota.id}::uuid AND estado = 'autorizada' ORDER BY creado_en`)
		).rows,
	);
	const descontado = creditos.reduce((total, credito) => total + credito.monto_centavos, 0);
	const porCobrar = nota.subtotal_centavos - nota.anticipo_aplicado_centavos - descontado;
	const formaDePago = textoDeFormaDePago(nota.forma_pago, nota.dias_credito);
	// A crédito, vence a sus días desde que se entrega.
	const vence =
		nota.forma_pago === "credito" && nota.entregada !== null
			? ` · Vence el ${textoDeDiaConAnio(Temporal.PlainDate.from(nota.entregada).add({ days: nota.dias_credito }).toString())}`
			: "";
	return {
		precios: lineas.map((linea) => ({
			precio: enPesos(linea.precio_unitario_centavos),
			importe: enPesos(linea.cantidad * linea.precio_unitario_centavos),
		})),
		subtotal: enPesos(nota.subtotal_centavos),
		cuentas: [
			`Subtotal ${enPesos(nota.subtotal_centavos)}`,
			...(nota.anticipo_aplicado_centavos > 0
				? [`Anticipo aplicado -${enPesos(nota.anticipo_aplicado_centavos)}`]
				: []),
			...creditos.map((credito) => `Nota de crédito ${credito.folio ?? ""} -${enPesos(credito.monto_centavos)}`),
			`Por cobrar ${enPesos(porCobrar)}`,
		],
		formaDePago: `${formaDePago}${vence}`,
	};
}

/**
 * El PDF de la hoja de una nota de entrega, con precios para Ventas y Contaduría y sin ellos para los demás.
 * @param contexto El contexto de quien la pide.
 * @param notaId La nota.
 * @throws `404` si no existe o se canceló.
 */
async function hojaDeLaNota(contexto: ContextoDeConsulta, notaId: string): Promise<Uint8Array> {
	const [nota] = await leerNotas(contexto.base, notaId);
	if (nota === undefined || nota.estado === "cancelada") throw noExiste();
	const lineas = await leerLineas(contexto.base, [nota.id]);
	const cliente = await leerCliente(contexto, nota.cliente_id);
	const vePrecios = vePreciosDeNotas(contexto.quien);
	const marco = await marcoDeLaHoja(contexto, {
		nombre: "Nota de entrega",
		folio: nota.folio,
		fecha: `Nota ${nota.numero_en_pedido} de ${nota.de} del pedido ${nota.pedido_folio}`,
	});
	return dibujarHojaDeNota(marco, {
		cliente: cliente.nombre,
		direccion: `Entregar en: ${cliente.direccion}`,
		cuando: [
			`Armada el ${textoDeDiaConAnio(nota.armada)}`,
			nota.salio === null ? null : `Salió el ${textoDeDiaConAnio(nota.salio)} con ${nota.despacho ?? ""}`,
		],
		renglones: lineas.map((linea) => ({ prenda: linea.prenda, talla: linea.talla, piezas: String(linea.cantidad) })),
		piezas: String(lineas.reduce((total, linea) => total + linea.cantidad, 0)),
		dinero: vePrecios ? await dineroDeLaNota(contexto, nota, lineas) : null,
	});
}

/**
 * El primer documento que se pide: estas hojas son de uno solo.
 * @param ids Los documentos que llegan en la ruta.
 */
function unoSolo(ids: readonly string[]): string {
	const [id] = ids;
	if (id === undefined) throw noExiste();
	return id;
}

/** La hoja del pedido: la saca Ventas; siempre lleva precios, así que soporte no. */
export const tipoPedido: TipoDeEtiqueta = {
	tipo: "pedido",
	departamentos: ["ventas"],
	llevaMontos: true,
	dibujar: (contexto, pedido) => hojaDelPedido(contexto, unoSolo(pedido.ids)),
};

/** La hoja de la nota de entrega: la sacan Ventas y Contaduría con precios, y Aduana sin ellos. */
export const tipoNotaEntrega: TipoDeEtiqueta = {
	tipo: "nota_entrega",
	departamentos: ["ventas", "contaduria", "aduana"],
	dibujar: (contexto, pedido) => hojaDeLaNota(contexto, unoSolo(pedido.ids)),
};
