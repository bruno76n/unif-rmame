/**
 * `ventas.pedido`: el cajón del pedido.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido (ancho)»)
 *
 * El encabezado con su cliente, los botones con cifra (lotes, lo listo en aduana, las notas, el anticipo y el crédito),
 * el avance, los datos, los avisos en su orden, las prendas con su precio y su tabla por talla, las notas y lo que se
 * puede hacer según la etapa. Lo abren Ventas, Contaduría y Dirección; solo Ventas tiene botones que escriben.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { pedidoVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	type Avance,
	type AvanceDeTalla,
	avanceDe,
	creditoDe,
	estadosDeNota,
	etapaDelPedido,
	fechaDeEntrega,
	leerClientes,
	leerNotasDePedidos,
	leerPedidos,
	leerRenglones,
	porPrenda,
	type RenglonLeido,
	sumar,
	textoDeFormaDePago,
	tramosDeAvance,
} from "./comun.ts";

/** La prenda y la talla de cada variante del avance. */
const deVariantes = z.array(
	z.object({ id: z.uuid(), producto_id: z.uuid(), prenda: z.string(), talla: z.string(), orden: z.coerce.number() }),
);

/** Los conceptos de la tabla por talla, en su orden, con lo que suman. */
const conceptos: readonly [string, (talla: AvanceDeTalla) => number][] = [
	["Pedido", (talla) => talla.pedido],
	["Entregado", (talla) => talla.entregado],
	["En nota", (talla) => talla.en_nota],
	["Listo en aduana", (talla) => talla.listo],
	["De bodega", (talla) => talla.de_bodega],
	["En producción", (talla) => talla.en_produccion],
	["Por mandar a producción", (talla) => talla.por_mandar],
];

/**
 * Cómo se lee el precio de una prenda: el dado con el sugerido, o la escuela con el origen del sugerido y su precio, y
 * el de las tallas especiales si es otro.
 * @param renglones Los renglones de la prenda.
 * @param listaCorta El nombre corto de la lista del cliente.
 */
function textoDePrecio(renglones: readonly RenglonLeido[], listaCorta: string): string {
	const normal = renglones.find((renglon) => renglon.recargo_especial_centavos === 0) ?? renglones[0];
	if (normal === undefined) return "";
	const especial = renglones.find((renglon) => renglon.recargo_especial_centavos > 0);
	const especiales = especial === undefined ? "" : ` · especiales ${enPesos(especial.precio_unitario_centavos)}`;
	if (normal.precio_dado_centavos !== null) {
		const sugerido =
			normal.precio_sugerido_centavos === null ? "" : ` · sugerido ${enPesos(normal.precio_sugerido_centavos)}`;
		return `Precio dado ${enPesos(normal.precio_dado_centavos)}${sugerido}${especiales}`;
	}
	const origen =
		normal.origen_sugerido === "lista_cliente"
			? `Lista ${listaCorta}`
			: normal.origen_sugerido === "porcentaje_cliente"
				? `${Number(normal.porcentaje_aplicado ?? 0)}% sobre mostrador`
				: normal.origen_sugerido === "mostrador"
					? "Mostrador"
					: "Mayoreo";
	return `${normal.escuela ?? "Básico"} · ${origen} ${enPesos(normal.precio_unitario_centavos)}${especiales}`;
}

/**
 * Cómo se lee lo de sus lotes: «en producción», «ya en aduana», «ya entregados», «nada en producción» o «sin
 * confirmar».
 * @param estado El estado del pedido.
 * @param lotes Las etapas de sus lotes no cancelados.
 */
function textoDeLotes(estado: string, lotes: readonly string[]): string {
	const sustantivo = lotes.length === 1 ? "lote" : "lotes";
	if (estado === "borrador") return `${sustantivo} · sin confirmar`;
	if (lotes.length === 0) return `${sustantivo} · nada en producción`;
	if (estado === "entregado") return `${sustantivo} · ya entregados`;
	if (lotes.every((etapa) => etapa === "en_aduana")) return `${sustantivo} · ya en aduana`;
	return `${sustantivo} · en producción`;
}

export const consultaPedidoVentas = implementarConsulta(pedidoVentas, async (contexto, parametros) => {
	const { base, diaDeNegocio: hoy } = contexto;
	const [pedido] = await leerPedidos(base, { pedidoId: parametros.pedido_id });
	if (pedido === undefined || pedido.estado === "cancelado") throw noExiste();
	const renglones = await leerRenglones(base, [pedido.id]);
	const notas = await leerNotasDePedidos(base, [pedido.id]);
	const cliente = (await leerClientes(base)).find((suyo) => suyo.id === pedido.cliente_id);
	if (cliente === undefined) throw noExiste();
	const credito = await creditoDe(contexto, cliente.id);
	// En borrador nada se ha mandado: el avance es solo lo pedido.
	const avance: Avance =
		pedido.estado === "borrador"
			? {
					folio: pedido.folio,
					estado: pedido.estado,
					etapa: "confirmado",
					alerta: null,
					tallas: renglones.map((renglon) => ({
						variante_id: renglon.variante_id,
						pedido: renglon.cantidad,
						entregado: 0,
						en_nota: 0,
						listo: 0,
						de_bodega: 0,
						en_produccion: 0,
						falta: renglon.cantidad,
						por_mandar: 0,
						de_mas: 0,
					})),
				}
			: await avanceDe(contexto, pedido.id);
	const etapa = etapaDelPedido(pedido, pedido.estado === "borrador" ? undefined : avance, hoy);
	const variantes =
		avance.tallas.length === 0
			? []
			: deVariantes.parse(
					(
						await base.execute(sql`SELECT v.id, v.producto_id, p.nombre AS prenda, t.nombre AS talla, t.orden
						FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
						WHERE v.id IN (${sql.join(
							avance.tallas.map((talla) => sql`${talla.variante_id}::uuid`),
							sql`, `,
						)}) ORDER BY t.orden`)
					).rows,
				);
	const { rows: deLotes } = await base.execute(
		sql`SELECT estado FROM lotes WHERE pedido_id = ${pedido.id} AND estado <> 'cancelado'`,
	);
	const lotes = z
		.array(z.object({ estado: z.string() }))
		.parse(deLotes)
		.map((lote) => lote.estado);
	const { rows: deCambio } = await base.execute(
		sql`SELECT 1 FROM cambios_pedido WHERE pedido_id = ${pedido.id} AND estado = 'por_aplicar' LIMIT 1`,
	);
	const { rows: deLista } = await base.execute(
		sql`SELECT coalesce(nombre_corto, nombre) AS corta FROM listas_precios WHERE cliente_id = ${cliente.id} LIMIT 1`,
	);
	const listaCorta = z.object({ corta: z.string() }).optional().parse(deLista[0])?.corta ?? cliente.nombre;
	const anticipo = z
		.object({ recibido_centavos: z.number() })
		.parse(await contexto.lectura("contaduria.anticipo_del_pedido", { pedido_id: pedido.id }));
	const nombreDe = (varianteId: string) => variantes.find((variante) => variante.id === varianteId);
	const listas = sumar(avance.tallas, (talla) => talla.listo);
	const porMandar = sumar(avance.tallas, (talla) => talla.por_mandar);
	const deMas = avance.tallas.filter((talla) => talla.de_mas > 0);
	const avisos = [
		...(deCambio.length > 0 && deMas.length > 0
			? [
					{
						color: "azul" as const,
						texto: `Versión ${pedido.version_vigente} por aplicar en Producción: ${deMas
							.map(
								(talla) =>
									`${nombreDe(talla.variante_id)?.prenda ?? ""}, talla ${nombreDe(talla.variante_id)?.talla ?? ""}: ${talla.de_mas} de más`,
							)
							.join(" · ")}`,
						boton: null,
					},
				]
			: []),
		...(porMandar > 0
			? [
					{
						color: "ambar" as const,
						texto: `${plural(porMandar, "pieza", "piezas")} por mandar a producción`,
						boton: "mandar" as const,
					},
				]
			: []),
		...(listas > 0
			? [
					{
						color: "verde" as const,
						texto: `${plural(listas, "pieza lista", "piezas listas")} en aduana`,
						boton: "armar_nota" as const,
					},
				]
			: []),
		...(credito.detenido
			? [
					{
						color: "rojo" as const,
						texto: "Cliente detenido por crédito · No se le pueden levantar pedidos nuevos",
						boton: null,
					},
				]
			: []),
	];
	// Por prenda: las tallas del pedido y las que tienen algo aunque ya no estén en él.
	const productos = [...new Set(variantes.map((variante) => variante.producto_id))];
	const deRenglones = porPrenda(renglones);
	const prendas = productos.map((productoId) => {
		const suyas = variantes.filter((variante) => variante.producto_id === productoId);
		const tallas = suyas.map((variante) => avance.tallas.find((talla) => talla.variante_id === variante.id));
		const suyos = deRenglones.get(productoId) ?? [];
		return {
			producto_id: productoId,
			nombre: suyas[0]?.prenda ?? "",
			precio: textoDePrecio(suyos, listaCorta),
			importe_centavos: suyos.reduce(
				(total, renglon) => total + renglon.cantidad * renglon.precio_unitario_centavos,
				0,
			),
			piezas: suyos.reduce((total, renglon) => total + renglon.cantidad, 0),
			tallas: suyas.map((variante) => variante.talla),
			filas: conceptos
				.map(([concepto, cuenta]) => {
					const piezas = tallas.map((talla) => (talla === undefined ? 0 : cuenta(talla)));
					return { concepto, piezas, total: piezas.reduce((total, numero) => total + numero, 0) };
				})
				.filter((fila) => fila.total > 0),
		};
	});
	const esVentas = tieneDepartamento(contexto.quien, "ventas");
	const confirmado = pedido.estado === "confirmado";
	const entregadas = sumar(avance.tallas, (talla) => talla.entregado);
	return {
		resultado: {
			pedido_id: pedido.id,
			folio: pedido.folio,
			version: pedido.version,
			version_vigente: pedido.version_vigente,
			estado: pedido.estado,
			cliente: { cliente_id: cliente.id, nombre: cliente.nombre, color: cliente.color },
			etapa: { clave: etapa.clave, texto: etapa.texto },
			estado_armado: etapa.estado,
			relacionados: {
				lotes: { cuantos: lotes.length, texto: textoDeLotes(pedido.estado, lotes) },
				listas_en_aduana: listas,
				notas: notas.length,
				anticipo_recibido_centavos: anticipo.recibido_centavos > 0 ? anticipo.recibido_centavos : null,
				credito: credito.texto,
			},
			avance: {
				texto: `${entregadas} de ${plural(
					sumar(avance.tallas, (talla) => talla.pedido),
					"pieza entregada",
					"piezas entregadas",
				)}`,
				tramos: tramosDeAvance(avance.tallas),
			},
			entrega: fechaDeEntrega(
				pedido.fecha_entrega,
				hoy,
				await parametroEntero(base, "ventas.dias_en_riesgo"),
				pedido.estado === "entregado",
			),
			forma_pago: textoDeFormaDePago(pedido.forma_pago, pedido.dias_credito),
			levanto: pedido.levanto ?? "—",
			total_centavos: renglones.reduce(
				(total, renglon) => total + renglon.cantidad * renglon.precio_unitario_centavos,
				0,
			),
			avisos,
			prendas,
			notas: notas.map((nota) => ({
				nota_id: nota.id,
				folio: nota.folio,
				fecha: textoDeDiaCorto(nota.armada),
				prendas: nota.prendas ?? "",
				piezas: nota.piezas,
				estado: { ...(estadosDeNota[nota.estado] ?? { texto: nota.estado, color: "gris" as const }), abajo: null },
				total_centavos: nota.subtotal_centavos,
			})),
			listo_por_talla: avance.tallas
				.filter((talla) => talla.listo > 0)
				.map((talla) => ({
					variante_id: talla.variante_id,
					prenda: nombreDe(talla.variante_id)?.prenda ?? "",
					talla: nombreDe(talla.variante_id)?.talla ?? "",
					listas: talla.listo,
				})),
			lotes_a_temporada: confirmado ? lotes.filter((estado) => estado !== "en_aduana").length : 0,
			puede: {
				confirmar: esVentas && pedido.estado === "borrador",
				editar: esVentas && pedido.estado === "borrador",
				modificar: esVentas && confirmado,
				cancelar: esVentas && (pedido.estado === "borrador" || (confirmado && notas.length === 0)),
				pasar_a_bodega: esVentas && confirmado && listas > 0,
				armar_nota: esVentas && confirmado && listas > 0,
				mandar: esVentas && confirmado && porMandar > 0,
				pdf: pedido.estado !== "borrador",
			},
		},
	};
});
