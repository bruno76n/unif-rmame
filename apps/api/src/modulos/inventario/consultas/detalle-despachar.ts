/**
 * `inventario.detalle_despachar`: el cajón Despachar. Lo que sale, a dónde, desde cuándo y cuándo la esperan; según lo
 * que es, la nota de entrega sin precios, la tabla por talla, o por qué no sale (sin nota, espera a Calidad, primero
 * regresa lo de más de su orden); lo que también está en aduana para ese destino y puede salir en el mismo despacho; y
 * sus etiquetas, si las lleva.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Despachar) y docs/modulos/inventario/surtido-y-despachos.md
 * (reglas 3, 4 y 8)
 */

import { textoDeDiaCorto, textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { detalleDespachar } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import {
	ordenesConDevolucionPendiente,
	type PorQueNoSale,
	porQueNoSale,
	textoDeDevolucionPendiente,
	tiposConEtiquetas,
} from "../dominio/despachos.ts";
import { type FilaEnAduana, leerEnAduana, partidaDe } from "./aduana-comun.ts";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleDespachar.resultado>;

/** Los tipos de traspaso que llevan la tabla por talla: los lotes y lo que se repartió de un lote. */
const conTablaPorTalla = new Set([
	"lote_cliente",
	"lote_reabasto",
	"lote_temporada",
	"lote_pedido_especial",
	"reproceso",
	"quitado_de_pedido",
	"excedente_pedido",
]);

/** El caso del cajón para cada motivo por el que no sale. */
const casoDelMotivo: Readonly<Record<PorQueNoSale["codigo"], Detalle["caso"]>> = {
	no_esta_en_aduana: "otro",
	se_empaca: "en_linea",
	es_devolucion_proveedor: "proveedor",
	espera_calidad: "calidad",
	sin_nota: "sin_nota",
};

/**
 * Qué muestra el cajón y, si no puede salir, por qué: la misma regla que revisa `inventario.despachar`.
 * @param fila Lo que está en aduana.
 * @param pendientes Las órdenes con lo de más esperando regresar al proveedor.
 */
function casoDe(fila: FilaEnAduana, pendientes: ReadonlySet<string>): { caso: Detalle["caso"]; aviso: string | null } {
	const motivo = porQueNoSale({
		folio: fila.folio,
		estado: fila.estado,
		tipo: fila.tipo,
		destinoExterno: fila.destino_externo,
		tienePadre: fila.es_hijo,
		tieneNotaDeEntrega: fila.nota !== null,
	});
	if (motivo !== null) {
		const aviso =
			motivo.codigo === "sin_nota" ? `${motivo.mensaje}. La arma Ventas con lo que recibe el cliente.` : motivo.mensaje;
		return { caso: casoDelMotivo[motivo.codigo], aviso };
	}
	if (fila.tipo === "nota_entrega") return { caso: "nota", aviso: null };
	if (fila.tipo === "material_proveedor" && fila.orden_compra_id !== null && pendientes.has(fila.orden_compra_id)) {
		return { caso: "devolucion_pendiente", aviso: textoDeDevolucionPendiente(fila.orden) };
	}
	if (conTablaPorTalla.has(fila.tipo)) return { caso: "lote", aviso: null };
	return { caso: "otro", aviso: null };
}

/**
 * La tabla por talla: cada prenda con lo que queda en aduana de cada talla, en el orden de las tallas.
 * @param contexto El contexto de la lectura.
 * @param traspasoId El traspaso.
 */
async function porTalla(contexto: ContextoDeAccion, traspasoId: string): Promise<Detalle["por_talla"]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT p.nombre AS prenda, t.nombre AS talla,
			sum(coalesce(l.piezas_recibidas_aduana, 0) - l.piezas_repartidas) AS piezas
		FROM traspaso_lineas l JOIN variantes v ON v.id = l.variante_id JOIN productos p ON p.id = v.producto_id
		JOIN tallas t ON t.id = v.talla_id
		WHERE l.traspaso_id = ${traspasoId}::uuid GROUP BY p.nombre, t.nombre, t.orden, t.grupo_talla_id ORDER BY p.nombre, ${ordenDeTallas("t")}`);
	const filas = z.array(z.object({ prenda: z.string(), talla: z.string(), piezas: z.coerce.number() })).parse(rows);
	const prendas = [...new Set(filas.map((fila) => fila.prenda))];
	return prendas.map((prenda) => {
		const tallas = filas
			.filter((fila) => fila.prenda === prenda && fila.piezas > 0)
			.map(({ talla, piezas }) => ({ talla, piezas }));
		return { prenda, tallas, piezas: tallas.reduce((suma, talla) => suma + talla.piezas, 0) };
	});
}

/**
 * La nota de entrega, sin precios: su folio, su pedido, el cliente y su dirección.
 * @param contexto El contexto de la lectura.
 * @param traspasoId El traspaso de la nota.
 */
async function notaDe(contexto: ContextoDeAccion, traspasoId: string): Promise<Detalle["nota"]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT nv.folio, pe.folio AS pedido, tc.nombre AS cliente,
			concat_ws(', ', c.direccion_entrega, c.municipio) AS direccion
		FROM traspasos t JOIN notas_entrega nv ON nv.id = t.nota_entrega_id JOIN pedidos pe ON pe.id = nv.pedido_id
		JOIN clientes c ON c.id = nv.cliente_id JOIN terceros tc ON tc.id = c.tercero_id
		WHERE t.id = ${traspasoId}::uuid`);
	const [nota] = z
		.array(z.object({ folio: z.string(), pedido: z.string(), cliente: z.string(), direccion: z.string() }))
		.parse(rows);
	return nota ?? null;
}

/**
 * Las etiquetas, si las lleva: «Etiquetas por imprimir» (ámbar) o «Impresas el {fecha}» (verde).
 * @param contexto El contexto de la lectura.
 * @param fila Lo que está en aduana.
 */
async function etiquetasDe(contexto: ContextoDeAccion, fila: FilaEnAduana): Promise<Detalle["etiquetas"]> {
	if (!tiposConEtiquetas.has(fila.tipo)) return null;
	if (!fila.impresas) return { estado: { texto: "Etiquetas por imprimir", color: "ambar" }, impresas: false };
	const { rows } = await contexto.transaccion.execute(
		sql`SELECT etiquetas_impresas_en::text AS cuando FROM traspasos WHERE id = ${fila.id}::uuid`,
	);
	const { cuando } = z.object({ cuando: z.string() }).parse(rows[0]);
	return { estado: { texto: `Impresas el ${textoDeMomentoCorto(cuando)}`, color: "verde" }, impresas: true };
}

export const consultaDetalleDespachar = implementarConsulta(detalleDespachar, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion): Promise<Detalle> => {
		const todas = await leerEnAduana(accion);
		const fila = todas.find((una) => una.id === parametros.traspaso_id);
		if (fila === undefined) throw noExiste();
		const partida = await partidaDe(accion, fila);
		const pendientes = await ordenesConDevolucionPendiente(accion.transaccion);
		const { caso, aviso } = casoDe(fila, pendientes);
		const puedeSalir = caso === "nota" || caso === "lote" || caso === "otro";
		const esCliente = partida.carril === "externos";
		const tabla = caso === "sin_nota" || caso === "nota" || caso === "lote" ? await porTalla(accion, fila.id) : [];
		// Un despacho a un cliente lleva una sola nota: solo se junta lo que va a una tienda o a Bodega.
		const juntar = [];
		if (puedeSalir && !esCliente) {
			for (const otra of todas) {
				if (otra.id === fila.id) continue;
				const suya = await partidaDe(accion, otra);
				if (suya.carril !== partida.carril || suya.boton !== "despachar") continue;
				if (casoDe(otra, pendientes).aviso !== null) continue;
				juntar.push({
					traspaso_id: suya.traspaso_id,
					version: suya.version,
					folio: suya.folio,
					titulo: suya.titulo,
					cantidad: suya.cantidad,
				});
			}
		}
		const quien = esCliente ? (fila.cliente ?? "el cliente") : partida.destino;
		return {
			traspaso_id: fila.id,
			folio: fila.folio,
			version: fila.version,
			titulo: partida.titulo,
			destino: `A ${partida.destino}`,
			carril: partida.carril,
			cantidad: partida.cantidad,
			salen: caso === "sin_nota" ? "esperan nota" : "salen",
			antiguedad: partida.antiguedad.texto,
			antiguedad_color: partida.antiguedad.color,
			desde: `desde el ${textoDeDiaCorto(fila.llego_dia)}`,
			la_esperan: fila.salida === null ? null : textoDeDiaCorto(fila.salida),
			dato_destino: esCliente ? `Clientes externos · ${quien}` : partida.destino,
			que_es: partida.detalle,
			caso,
			aviso,
			pedido:
				fila.pedido_id !== null && fila.pedido !== null && esCliente
					? { pedido_id: fila.pedido_id, folio: fila.pedido }
					: null,
			nota: caso === "nota" ? await notaDe(accion, fila.id) : null,
			por_talla: tabla,
			total: tabla.reduce((suma, prenda) => suma + prenda.piezas, 0),
			juntar,
			etiquetas: await etiquetasDe(accion, fila),
			queda_en_camino: !puedeSalir
				? null
				: esCliente
					? `Queda en camino hasta que ${quien} firme de recibido.`
					: `Queda en camino hasta que ${quien} confirme que lo recibió.`,
			boton: puedeSalir ? `Despachar a ${quien}` : null,
		};
	}),
}));
