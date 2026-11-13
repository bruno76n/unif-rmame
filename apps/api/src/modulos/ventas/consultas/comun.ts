/**
 * Lo que comparten las consultas de las pantallas de Ventas a externos: leer los pedidos con sus renglones y sus
 * notas, su avance (el de `ventas.avance_pedido`), el crédito de los clientes (el de Contaduría, sin montos) y cómo se
 * escribe cada etapa, alerta, fecha y crédito, con su color de la guía de textos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md y docs/interfaz/TEXTOS.md («Los estados», «Las etapas de pedidos, notas y
 * lotes»)
 *
 * Las reglas del avance, la etapa y la alerta son de `dominio/avance.ts`: aquí solo se leen y se escriben.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";

/** Un color de estado de la guía. */
export type Color = "rojo" | "ambar" | "azul" | "verde" | "gris" | "morado" | "verde-azulado";

/** Las etapas de un pedido, como se leen. */
export type ClaveDeEtapa =
	| "borrador"
	| "confirmado"
	| "en_produccion"
	| "listo_en_aduana"
	| "entrega_parcial"
	| "entregado";

/** Cómo se escribe cada etapa de un pedido y su color (la barra de avance usa los mismos). */
export const etapas: Readonly<Record<ClaveDeEtapa | "cancelado", { texto: string; color: Color }>> = {
	borrador: { texto: "Borrador", color: "gris" },
	confirmado: { texto: "Confirmado", color: "azul" },
	en_produccion: { texto: "En producción", color: "ambar" },
	listo_en_aduana: { texto: "Listo en aduana", color: "morado" },
	entrega_parcial: { texto: "Entrega parcial", color: "verde-azulado" },
	entregado: { texto: "Entregado", color: "verde" },
	cancelado: { texto: "Cancelado", color: "rojo" },
};

/** Cómo se escribe cada estado de una nota de entrega y su color. */
export const estadosDeNota: Readonly<Record<string, { texto: string; color: Color }>> = {
	por_despachar: { texto: "Por despachar", color: "morado" },
	en_camino: { texto: "En camino", color: "ambar" },
	entregada: { texto: "Entregada", color: "verde" },
	cancelada: { texto: "Cancelada", color: "rojo" },
};

/** Cómo se escribe el estado del pago de una nota. */
export const textosDePago: Readonly<Record<string, string>> = {
	sin_pagar: "Sin pagar",
	pagada_en_parte: "Pagada en parte",
	pagada: "Pagada",
};

/** Cómo se lee cada tipo de cliente, con mayúscula: «Escuela en Yurécuaro». */
export const tiposDeCliente: Readonly<Record<string, string>> = {
	escuela: "Escuela",
	mayorista: "Mayorista",
	empresa_otro: "Empresa u otro",
};

/**
 * La forma de pago como se lee: «Crédito 30 días», «Anticipo» o «Contado».
 * @param forma La forma de pago.
 * @param dias Sus días de crédito.
 */
export function textoDeFormaDePago(forma: string, dias: number): string {
	if (forma === "credito") return `Crédito ${plural(dias, "día", "días")}`;
	return forma === "anticipo" ? "Anticipo" : "Contado";
}

/**
 * Los días de hoy a una fecha: negativos si ya pasó.
 * @param hoy El día de negocio.
 * @param fecha La fecha ISO.
 */
export function diasHasta(hoy: Temporal.PlainDate, fecha: string): number {
	return hoy.until(fecha, { largestUnit: "days" }).days;
}

/**
 * Una fecha de entrega con su texto y su tono: «hace 2 días» en rojo, «hoy», «mañana» o «en {n} días», en ámbar a
 * `ventas.dias_en_riesgo` o menos; ya entregado, «Entregado».
 * @param fecha La fecha ISO.
 * @param hoy El día de negocio.
 * @param diasEnRiesgo `ventas.dias_en_riesgo`.
 * @param entregado Si el pedido ya se entregó.
 */
export function fechaDeEntrega(fecha: string, hoy: Temporal.PlainDate, diasEnRiesgo: number, entregado = false) {
	const texto = textoDeDiaCorto(fecha);
	if (entregado) return { fecha, texto, cuando: "Entregado", tono: "normal" as const };
	const dias = diasHasta(hoy, fecha);
	if (dias < 0) return { fecha, texto, cuando: `hace ${plural(-dias, "día", "días")}`, tono: "rojo" as const };
	const cuando = dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${plural(dias, "día", "días")}`;
	return { fecha, texto, cuando, tono: dias <= diasEnRiesgo ? ("ambar" as const) : ("normal" as const) };
}

/** Lo que regresa `ventas.avance_pedido`. */
const avanceLeido = z.object({
	folio: z.string(),
	estado: z.string(),
	etapa: z.enum(["confirmado", "entrega_parcial", "listo_en_aduana", "en_produccion"]),
	alerta: z
		.discriminatedUnion("tipo", [
			z.object({ tipo: z.literal("atrasado") }),
			z.object({ tipo: z.literal("listo_para_entregar") }),
			z.object({ tipo: z.literal("por_mandar"), piezas: z.number(), conOrden: z.boolean() }),
			z.object({ tipo: z.literal("en_riesgo") }),
			z.object({ tipo: z.literal("cambio_por_aplicar") }),
		])
		.nullable(),
	tallas: z.array(
		z.object({
			variante_id: z.uuid(),
			pedido: z.number(),
			entregado: z.number(),
			en_nota: z.number(),
			listo: z.number(),
			de_bodega: z.number(),
			en_produccion: z.number(),
			falta: z.number(),
			por_mandar: z.number(),
			de_mas: z.number(),
		}),
	),
});

/** El avance de un pedido, como lo da Ventas. */
export type Avance = z.infer<typeof avanceLeido>;

/** El avance de una talla. */
export type AvanceDeTalla = Avance["tallas"][number];

/**
 * El avance de un pedido con su etapa y su alerta: la lectura del módulo, la misma que usan las acciones.
 * @param contexto El contexto de la consulta.
 * @param pedidoId El pedido.
 */
export async function avanceDe(contexto: ContextoDeConsulta, pedidoId: string): Promise<Avance> {
	return avanceLeido.parse(await contexto.lectura("ventas.avance_pedido", { pedido_id: pedidoId }));
}

/**
 * Suma una cuenta de las tallas de un avance.
 * @param tallas Las tallas.
 * @param cuenta Qué se suma.
 */
export function sumar(tallas: readonly AvanceDeTalla[], cuenta: (talla: AvanceDeTalla) => number): number {
	return tallas.reduce((total, talla) => total + cuenta(talla), 0);
}

/**
 * La alerta de un pedido como se lee, o nada.
 * @param avance Su avance.
 * @param fechaEntrega Su entrega.
 * @param hoy El día de negocio.
 */
export function textoDeAlerta(avance: Avance, fechaEntrega: string, hoy: Temporal.PlainDate): string | null {
	const alerta = avance.alerta;
	if (alerta === null) return null;
	switch (alerta.tipo) {
		case "atrasado":
			return `Atrasado ${plural(-diasHasta(hoy, fechaEntrega), "día", "días")}`;
		case "listo_para_entregar":
			return "Listo para entregar";
		case "por_mandar":
			return alerta.conOrden ? `${plural(alerta.piezas, "pieza", "piezas")} por mandar` : "Por mandar a producción";
		case "en_riesgo":
			return "En riesgo de atraso";
		case "cambio_por_aplicar":
			return "Cambio por aplicar";
	}
}

/**
 * La etapa de un pedido y su estado armado: la etapa en su color, con la alerta abajo.
 * @param pedido El pedido.
 * @param avance Su avance, si no es borrador.
 * @param hoy El día de negocio.
 */
export function etapaDelPedido(
	pedido: Pick<PedidoLeido, "estado" | "fecha_entrega">,
	avance: Avance | undefined,
	hoy: Temporal.PlainDate,
): { clave: ClaveDeEtapa; texto: string; estado: { texto: string; color: Color; abajo: string | null } } {
	const clave: ClaveDeEtapa =
		pedido.estado === "borrador"
			? "borrador"
			: pedido.estado === "entregado"
				? "entregado"
				: (avance?.etapa ?? "confirmado");
	const { texto, color } = etapas[clave];
	const abajo = avance === undefined ? null : textoDeAlerta(avance, pedido.fecha_entrega, hoy);
	return { clave, texto, estado: { texto, color, abajo } };
}

/**
 * La barra de avance de un pedido, en los colores de cada etapa: lo entregado, en nota, listo en aduana, en
 * producción y lo que falta mandar.
 * @param tallas Sus tallas.
 */
export function tramosDeAvance(tallas: readonly AvanceDeTalla[]) {
	return [
		{ etiqueta: "Entregado", valor: sumar(tallas, (talla) => talla.entregado), color: "verde" as const },
		{ etiqueta: "En nota", valor: sumar(tallas, (talla) => talla.en_nota), color: "verde-azulado" as const },
		{ etiqueta: "Listo en aduana", valor: sumar(tallas, (talla) => talla.listo), color: "morado" as const },
		{
			etiqueta: "En producción",
			valor: sumar(tallas, (talla) => talla.en_produccion + talla.de_bodega),
			color: "ambar" as const,
		},
		{ etiqueta: "Por mandar a producción", valor: sumar(tallas, (talla) => talla.por_mandar), color: "gris" as const },
	];
}

/** Un pedido como lo leen las consultas. */
const pedidoLeido = z.object({
	id: z.uuid(),
	folio: z.string(),
	estado: z.enum(["borrador", "confirmado", "entregado", "cancelado"]),
	cliente_id: z.uuid(),
	cliente: z.string(),
	fecha_entrega: z.string(),
	forma_pago: z.string(),
	dias_credito: z.coerce.number(),
	version_vigente: z.coerce.number(),
	version: z.coerce.number(),
	creado_por: z.string().nullable(),
	levanto: z.string().nullable(),
});

/** Un pedido como lo leen las consultas. */
export type PedidoLeido = z.infer<typeof pedidoLeido>;

/**
 * Los pedidos que no se cancelaron, con el nombre de su cliente y de quien lo levantó.
 * @param base La base.
 * @param filtro Qué pedidos: los abiertos (borrador y confirmado), también los entregados, o uno solo.
 */
export async function leerPedidos(
	base: Base,
	filtro: { entregados?: boolean; pedidoId?: string; clienteId?: string } = {},
): Promise<PedidoLeido[]> {
	const estados =
		filtro.entregados === true ? sql`('borrador', 'confirmado', 'entregado')` : sql`('borrador', 'confirmado')`;
	const { rows } = await base.execute(sql`SELECT p.id, p.folio, p.estado, p.cliente_id, t.nombre AS cliente,
			p.fecha_entrega::text AS fecha_entrega, p.forma_pago, p.dias_credito, p.version_vigente, p.version, p.creado_por,
			coalesce(pe.nombre, u.nombre, u.correo) AS levanto
		FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN terceros t ON t.id = c.tercero_id
		LEFT JOIN usuarios u ON u.id = p.creado_por LEFT JOIN personas pe ON pe.id = u.persona_id
		WHERE ${
			filtro.pedidoId === undefined ? sql`p.estado IN ${estados}` : sql`p.id = ${filtro.pedidoId}`
		} ${filtro.clienteId === undefined ? sql`` : sql`AND p.cliente_id = ${filtro.clienteId}`}
		ORDER BY p.fecha_entrega, p.folio`);
	return z.array(pedidoLeido).parse(rows);
}

/** Un renglón vigente de un pedido, con su prenda y su talla. */
const renglonLeido = z.object({
	pedido_id: z.uuid(),
	variante_id: z.uuid(),
	cantidad: z.coerce.number(),
	precio_unitario_centavos: z.coerce.number(),
	precio_dado_centavos: z.coerce.number().nullable(),
	precio_sugerido_centavos: z.coerce.number().nullable(),
	origen_sugerido: z.string().nullable(),
	porcentaje_aplicado: z.string().nullable(),
	recargo_especial_centavos: z.coerce.number(),
	producto_id: z.uuid(),
	prenda: z.string(),
	talla: z.string(),
	orden: z.coerce.number(),
	escuela: z.string().nullable(),
});

/** Un renglón vigente de un pedido, con su prenda y su talla. */
export type RenglonLeido = z.infer<typeof renglonLeido>;

/**
 * Los renglones vigentes de unos pedidos, por prenda y en el orden de sus tallas.
 * @param base La base.
 * @param pedidoIds Los pedidos.
 */
export async function leerRenglones(base: Base, pedidoIds: readonly string[]): Promise<RenglonLeido[]> {
	if (pedidoIds.length === 0) return [];
	const { rows } = await base.execute(sql`SELECT r.pedido_id, r.variante_id, r.cantidad, r.precio_unitario_centavos,
			r.precio_dado_centavos, r.precio_sugerido_centavos, r.origen_sugerido, r.porcentaje_aplicado::text,
			r.recargo_especial_centavos, v.producto_id, pr.nombre AS prenda, t.nombre AS talla, t.orden, e.nombre AS escuela
		FROM pedido_renglones r JOIN variantes v ON v.id = r.variante_id JOIN productos pr ON pr.id = v.producto_id
		JOIN tallas t ON t.id = v.talla_id LEFT JOIN escuelas e ON e.id = pr.escuela_id
		WHERE r.hasta_version IS NULL AND r.pedido_id IN (${sql.join(
			pedidoIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})
		ORDER BY pr.nombre, t.orden`);
	return z.array(renglonLeido).parse(rows);
}

/**
 * Las prendas de unos renglones, en el orden en que llegan: el producto y sus renglones.
 * @param renglones Los renglones.
 */
export function porPrenda<Renglon extends { producto_id: string }>(renglones: readonly Renglon[]) {
	const prendas = new Map<string, Renglon[]>();
	for (const renglon of renglones)
		prendas.set(renglon.producto_id, [...(prendas.get(renglon.producto_id) ?? []), renglon]);
	return prendas;
}

/**
 * El rango de tallas de una prenda: «6 a 14», o la talla sola.
 * @param tallas Sus tallas, en orden.
 */
export function rangoDeTallas(tallas: readonly string[]): string {
	const primera = tallas[0] ?? "";
	const ultima = tallas.at(-1) ?? "";
	return tallas.length <= 1 ? primera : `${primera} a ${ultima}`;
}

/**
 * Los nombres de las prendas de un pedido y su detalle: «2 productos · tallas 6 a 14», o «2 rangos de tallas».
 * @param renglones Sus renglones con piezas.
 */
export function prendasDelPedido(renglones: readonly RenglonLeido[]): { nombres: string; detalle: string } {
	const prendas = [...porPrenda(renglones.filter((renglon) => renglon.cantidad > 0)).values()];
	const rangos = [...new Set(prendas.map((suyos) => rangoDeTallas(suyos.map((renglon) => renglon.talla))))];
	return {
		nombres: prendas.map((suyos) => suyos[0]?.prenda ?? "").join(", "),
		detalle: `${plural(prendas.length, "producto", "productos")} · ${
			rangos.length === 1 ? `tallas ${rangos[0]}` : plural(rangos.length, "rango de tallas", "rangos de tallas")
		}`,
	};
}

/** Una nota de entrega como la leen las consultas. */
const notaLeida = z.object({
	id: z.uuid(),
	folio: z.string(),
	pedido_id: z.uuid(),
	estado: z.string(),
	numero_en_pedido: z.coerce.number(),
	subtotal_centavos: z.coerce.number(),
	armada: z.string(),
	piezas: z.coerce.number(),
	prendas: z.string().nullable(),
});

/**
 * Las notas que no se cancelaron de unos pedidos, por número en su pedido.
 * @param base La base.
 * @param pedidoIds Los pedidos.
 */
export async function leerNotasDePedidos(base: Base, pedidoIds: readonly string[]) {
	if (pedidoIds.length === 0) return [];
	const { rows } = await base.execute(sql`SELECT n.id, n.folio, n.pedido_id, n.estado, n.numero_en_pedido,
			n.subtotal_centavos, (n.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS armada,
			coalesce((SELECT sum(l.cantidad) FROM nota_entrega_lineas l WHERE l.nota_entrega_id = n.id), 0) AS piezas,
			(SELECT string_agg(DISTINCT pr.nombre, ', ') FROM nota_entrega_lineas l JOIN variantes v ON v.id = l.variante_id
				JOIN productos pr ON pr.id = v.producto_id WHERE l.nota_entrega_id = n.id) AS prendas
		FROM notas_entrega n WHERE n.estado <> 'cancelada' AND n.pedido_id IN (${sql.join(
			pedidoIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)}) ORDER BY n.numero_en_pedido`);
	return z.array(notaLeida).parse(rows);
}

/** Un cliente como lo leen las consultas. */
const clienteLeido = z.object({
	id: z.uuid(),
	nombre: z.string(),
	tipo: z.string(),
	municipio: z.string(),
	color: z.string().nullable(),
	escuela: z.string().nullable(),
	contacto: z.string().nullable(),
	telefono: z.string(),
	desde: z.string(),
	baja_en: z.string().nullable(),
	motivo_baja: z.string().nullable(),
	version: z.coerce.number(),
});

/** Un cliente como lo leen las consultas. */
export type ClienteLeido = z.infer<typeof clienteLeido>;

/**
 * Los clientes, en el orden en que se dieron de alta, con el color de su escuela.
 * @param base La base.
 */
export async function leerClientes(base: Base): Promise<ClienteLeido[]> {
	const { rows } = await base.execute(sql`SELECT c.id, t.nombre, c.tipo, c.municipio, e.color, e.nombre AS escuela,
			c.contacto, c.telefono, extract(year FROM c.creado_en AT TIME ZONE 'America/Mexico_City')::int::text AS desde,
			c.baja_en::text AS baja_en, c.motivo_baja, c.version
		FROM clientes c JOIN terceros t ON t.id = c.tercero_id LEFT JOIN escuelas e ON e.id = c.escuela_id
		ORDER BY c.creado_en, t.nombre`);
	return z.array(clienteLeido).parse(rows);
}

/** Lo que regresa `contaduria.credito_de_cliente`. */
const creditoLeido = z.object({
	semaforo: z.string(),
	tiene_credito: z.boolean(),
	dias_credito: z.number(),
	cerca_del_limite: z.boolean(),
});

/** El crédito de un cliente como lo ve Ventas: su semáforo, sin montos. */
export interface CreditoDeVentas {
	texto: string;
	color: Color;
	detenido: boolean;
	tieneCredito: boolean;
	cercaDelLimite: boolean;
	diasCredito: number;
}

/**
 * El crédito de un cliente, de Contaduría: «Detenido por crédito», «Cerca del límite de crédito», «Sin crédito» o
 * «Crédito al corriente».
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente.
 */
export async function creditoDe(contexto: ContextoDeConsulta, clienteId: string): Promise<CreditoDeVentas> {
	const credito = creditoLeido.parse(
		await contexto.lectura("contaduria.credito_de_cliente", { cliente_id: clienteId }),
	);
	const detenido = credito.semaforo === "detenido";
	const cerca = credito.semaforo === "cerca_del_limite" || credito.cerca_del_limite;
	const [texto, color]: [string, Color] = detenido
		? ["Detenido por crédito", "rojo"]
		: !credito.tiene_credito
			? ["Sin crédito", "gris"]
			: cerca
				? ["Cerca del límite de crédito", "ambar"]
				: ["Crédito al corriente", "verde"];
	return {
		texto,
		color,
		detenido,
		tieneCredito: credito.tiene_credito,
		cercaDelLimite: cerca,
		diasCredito: credito.dias_credito,
	};
}

/**
 * El crédito de varios clientes, por id.
 * @param contexto El contexto de la consulta.
 * @param clienteIds Los clientes.
 */
export async function creditosDe(
	contexto: ContextoDeConsulta,
	clienteIds: readonly string[],
): Promise<Map<string, CreditoDeVentas>> {
	const leidos = await Promise.all(clienteIds.map(async (id) => [id, await creditoDe(contexto, id)] as const));
	return new Map(leidos);
}

/**
 * Si quien llama ve un departamento: la dueña los ve todos.
 * @param contexto El contexto de la consulta.
 * @param departamento La clave del departamento.
 */
export function tieneDepartamento(contexto: ContextoDeConsulta, departamento: string): boolean {
	const { quien } = contexto;
	return quien.tipo === "cuenta" && (quien.esDuena || quien.departamentos.includes(departamento));
}

/**
 * Un texto sin mayúsculas ni acentos, para buscar.
 * @param texto El texto.
 */
export function paraBuscar(texto: string): string {
	return texto
		.toLocaleLowerCase("es-MX")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

/**
 * Si un texto lleva todas las palabras de lo que se busca.
 * @param donde Donde se busca, ya sin mayúsculas ni acentos.
 * @param buscar Lo que se busca.
 */
export function llevaTodas(donde: string, buscar: string | undefined): boolean {
	return paraBuscar(buscar ?? "")
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0)
		.every((palabra) => donde.includes(palabra));
}
