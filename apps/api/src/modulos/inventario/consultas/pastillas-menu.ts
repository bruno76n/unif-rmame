/**
 * Las pastillas del menú de Aduana y Bodega, y la consulta `inventario.pastillas_menu` que las entrega juntas.
 * Fase 19 · docs/interfaz/comunes.md («El menú lateral», «`inventario.pastillas_menu`»)
 *
 * Aduana cuenta lo que lleva más de `inventario.horas_aduana_parado` en aduana y los despachos con más de
 * `inventario.dias_sin_confirmar_pastilla` días sin confirmar; va en rojo si algo en aduana sale hoy o mañana.
 * Bodega cuenta sus excepciones por resolver, los pedidos externos, los pedidos en línea y las devoluciones a
 * proveedor por surtir, las recepciones por confirmar y las diferencias por contar; va en rojo con un pedido en línea
 * por surtir.
 */

import { pastillasMenu } from "@uniformame/compartido/contratos/inventario/armazon";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { type ConteoDePastilla, type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";

/** Una fila de conteos. */
const conteos = z.record(z.string(), z.coerce.number());

/**
 * Lee una fila de conteos con SQL.
 * @param base La base.
 * @param consulta La consulta, que regresa una sola fila.
 */
async function contar(base: Base | Transaccion, consulta: ReturnType<typeof sql>): Promise<Record<string, number>> {
	const { rows } = await base.execute(consulta);
	return conteos.parse(rows[0] ?? {});
}

/** La pastilla de Aduana. */
export async function pastillaAduana({ base, ahora, diaDeNegocio }: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const horas = Number(await leerParametro(base, { clave: "inventario.horas_aduana_parado" }));
	const dias = Number(await leerParametro(base, { clave: "inventario.dias_sin_confirmar_pastilla" }));
	const parado = ahora.subtract({ hours: horas }).toString();
	const sinConfirmar = ahora.subtract({ hours: dias * 24 }).toString();
	const manana = diaDeNegocio.add({ days: 1 }).toString();
	const fila = await contar(
		base,
		sql`SELECT
			(SELECT count(*) FROM traspasos WHERE estado = 'en_aduana' AND llego_aduana_en <= ${parado}) AS parados,
			(SELECT count(*) FROM despachos WHERE estado = 'en_transito' AND despachado_en <= ${sinConfirmar}) AS sin_confirmar,
			(SELECT count(*) FROM traspasos WHERE estado = 'en_aduana' AND fecha_salida_esperada <= ${manana}::date) AS urgentes`,
	);
	return { conteo: (fila.parados ?? 0) + (fila.sin_confirmar ?? 0), rojo: (fila.urgentes ?? 0) > 0 };
}

/** La pastilla de Bodega. */
export async function pastillaBodega({ base }: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const fila = await contar(
		base,
		sql`WITH bodega AS (SELECT id FROM ubicaciones WHERE tipo = 'bodega'),
			sueltas AS (
				SELECT r.* FROM reservas r, bodega WHERE r.estado = 'activa' AND r.ubicacion_id = bodega.id AND r.traspaso_id IS NULL)
		SELECT
			(SELECT count(*) FROM excepciones WHERE estado = 'por_revisar' AND area = 'bodega') AS excepciones,
			(SELECT count(DISTINCT pedido_id) FROM sueltas WHERE motivo = 'pedido_externo') AS pedidos,
			(SELECT count(DISTINCT s.pedido_linea_id) FROM sueltas s JOIN pedidos_linea w ON w.id = s.pedido_linea_id
				WHERE w.estado = 'por_surtir') AS en_linea,
			(SELECT count(*) FROM traspasos t, bodega WHERE t.tipo = 'devolucion_proveedor' AND t.estado = 'esperado'
				AND t.origen_ubicacion_id = bodega.id) AS devoluciones,
			(SELECT count(*) FROM despachos d, bodega WHERE d.estado = 'en_transito' AND d.destino_ubicacion_id = bodega.id) AS recepciones,
			(SELECT count(*) FROM diferencias f, bodega WHERE f.estado = 'por_contar' AND f.ubicacion_id = bodega.id) AS por_contar`,
	);
	const enLinea = fila.en_linea ?? 0;
	return {
		conteo:
			(fila.excepciones ?? 0) +
			(fila.pedidos ?? 0) +
			enLinea +
			(fila.devoluciones ?? 0) +
			(fila.recepciones ?? 0) +
			(fila.por_contar ?? 0),
		rojo: enLinea > 0,
	};
}

export const consultaPastillasMenu = implementarConsulta(pastillasMenu, async (contexto) => {
	const { quien } = contexto;
	const tiene = (departamento: string) => tieneDepartamento(quien, departamento);
	return {
		resultado: {
			aduana: tiene("aduana") ? await pastillaAduana(contexto) : null,
			bodega: tiene("bodega") ? await pastillaBodega(contexto) : null,
		},
	};
});
