/**
 * `ventas.armar_nota`: lo que necesita el cajón «Armar nota de entrega».
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Armar nota de entrega (ancho)»)
 *
 * El folio NV- que sigue, los datos del pedido (su entrega, su forma de pago, sus notas anteriores y el anticipo
 * disponible) y, por prenda, lo listo en aduana sin nota de cada talla con el precio del renglón vigente del pedido.
 * Sin nada listo no se abre.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { armarNotaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	avanceDe,
	fechaDeEntrega,
	leerClientes,
	leerNotasDePedidos,
	leerPedidos,
	leerRenglones,
	textoDeFormaDePago,
} from "./comun.ts";

/** La prenda y la talla de lo listo. */
const deVariantes = z.array(
	z.object({ id: z.uuid(), producto_id: z.uuid(), prenda: z.string(), talla: z.string(), orden: z.coerce.number() }),
);

export const consultaArmarNota = implementarConsulta(armarNotaVentas, async (contexto, parametros) => {
	const { base, diaDeNegocio: hoy } = contexto;
	const [pedido] = await leerPedidos(base, { pedidoId: parametros.pedido_id });
	if (pedido === undefined || pedido.estado === "cancelado") throw noExiste();
	const tallas = pedido.estado === "confirmado" ? (await avanceDe(contexto, pedido.id)).tallas : [];
	const listas = tallas.filter((talla) => talla.listo > 0);
	if (listas.length === 0) throw errorDeRegla("nada_listo", "Nada listo en aduana para este pedido");
	const renglones = await leerRenglones(base, [pedido.id]);
	const variantes = deVariantes.parse(
		(
			await base.execute(sql`SELECT v.id, v.producto_id, p.nombre AS prenda, t.nombre AS talla, t.orden
			FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			WHERE v.id IN (${sql.join(
				tallas.map((talla) => sql`${talla.variante_id}::uuid`),
				sql`, `,
			)}) ORDER BY p.nombre, t.orden`)
		).rows,
	);
	const cliente = (await leerClientes(base)).find((suyo) => suyo.id === pedido.cliente_id);
	const anticipo = z
		.object({ disponible_centavos: z.number() })
		.parse(await contexto.lectura("contaduria.anticipo_del_pedido", { pedido_id: pedido.id }));
	const folio = z
		.object({ folio: z.string() })
		.parse(await contexto.lectura("admin.siguiente_folio", { tipo: "nota_entrega" })).folio;
	const productos = [...new Set(variantes.map((variante) => variante.producto_id))];
	const deTalla = (varianteId: string) => tallas.find((talla) => talla.variante_id === varianteId);
	return {
		resultado: {
			pedido_id: pedido.id,
			folio_pedido: pedido.folio,
			folio,
			version: pedido.version,
			cliente: { cliente_id: pedido.cliente_id, nombre: pedido.cliente, color: cliente?.color ?? null },
			entrega: fechaDeEntrega(pedido.fecha_entrega, hoy, await parametroEntero(base, "ventas.dias_en_riesgo")),
			forma_pago: textoDeFormaDePago(pedido.forma_pago, pedido.dias_credito),
			notas_anteriores: (await leerNotasDePedidos(base, [pedido.id])).map((nota) => nota.folio),
			anticipo_disponible_centavos: anticipo.disponible_centavos,
			prendas: productos
				.map((productoId) => {
					const suyas = variantes.filter((variante) => variante.producto_id === productoId);
					const conListas = suyas.filter((variante) => (deTalla(variante.id)?.listo ?? 0) > 0);
					const cuantas = conListas.reduce((total, variante) => total + (deTalla(variante.id)?.listo ?? 0), 0);
					const faltan = suyas.reduce((total, variante) => {
						const talla = deTalla(variante.id);
						return total + Math.max(0, (talla?.pedido ?? 0) - (talla?.entregado ?? 0) - (talla?.en_nota ?? 0));
					}, 0);
					return {
						producto_id: productoId,
						nombre: suyas[0]?.prenda ?? "",
						linea: `${plural(cuantas, "lista", "listas")} en aduana · faltan ${faltan} del pedido`,
						tallas: conListas.map((variante) => ({
							variante_id: variante.id,
							talla: variante.talla,
							listas: deTalla(variante.id)?.listo ?? 0,
							precio_unitario_centavos:
								renglones.find((renglon) => renglon.variante_id === variante.id)?.precio_unitario_centavos ?? 0,
						})),
					};
				})
				.filter((prenda) => prenda.tallas.length > 0),
		},
	};
});
