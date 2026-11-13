/**
 * `catalogo.cambio_en_bloque_previo`: la vista previa de la ventana «Cambiar precios en bloque».
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Cambiar precios en bloque») y docs/modulos/catalogo/precios.md
 * («`catalogo.cambiar_precios_en_bloque`»)
 *
 * Usa las mismas cuentas que la acción (`precioDelCambioEnBloque` y `topeDelCambioEnBloque` del paquete compartido),
 * con los mismos parámetros: lo que se ve es lo que se aplica. Ofrece solo las listas donde alguno de los escogidos tiene
 * precio; por producto que cambia, su precio base antes y después (hasta 5), cuántos cambian, cuántos no tienen precio
 * en la lista, cuántos precios (base y de talla) cambian y, si la acción lo rechazaría, su código y su texto.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { precioDelCambioEnBloque, topeDelCambioEnBloque } from "@uniformame/compartido/calculos/precios";
import { cambioEnBloquePrevio } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { centavos } from "@uniformame/compartido/tipos/base";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { enLista, filas, parametroNumero } from "./comunes.ts";

/** Cuántos renglones enseña la vista previa. */
const renglonesDeLaVista = 5;

/**
 * El texto de un monto, como lo dicen los errores de la acción.
 * @param monto En centavos.
 */
const texto = (monto: number) => centavosATexto(centavos(monto));

export const consultaCambioEnBloquePrevio = implementarConsulta(cambioEnBloquePrevio, async ({ base }, parametros) => {
	const ids = [...new Set(parametros.productos.split(","))];
	const cambio = {
		direccion: parametros.direccion,
		modo: parametros.modo,
		cantidad: parametros.cantidad,
		redondear: parametros.redondear === "si",
	};
	const listas = await filas(
		base,
		sql`SELECT l.id, l.nombre FROM listas_precios l WHERE l.baja_en IS NULL AND EXISTS (SELECT 1 FROM precios pr
			WHERE pr.lista_id = l.id AND pr.vigente_hasta IS NULL AND pr.producto_id IN (${enLista(ids)}))
			ORDER BY l.tipo = 'cliente', l.orden, l.nombre`,
		z.object({ id: z.uuid(), nombre: z.string() }),
	);
	const lista = listas.find((una) => una.id === parametros.lista_id) ?? listas[0] ?? null;
	const redondeo = await parametroNumero(base, "catalogo.bloque_redondeo_centavos");
	const vacio = {
		listas,
		lista,
		renglones: [],
		cambian: 0,
		escogidos: ids.length,
		precios: 0,
		redondeo_centavos: redondeo,
	};
	const porCiento = await parametroNumero(base, "catalogo.bloque_tope_pct");
	const tope = await parametroNumero(base, "catalogo.bloque_tope_centavos");
	const pasa = topeDelCambioEnBloque(cambio, { porCiento, centavos: tope });
	if (pasa !== undefined) {
		const mensaje =
			pasa === "tope_por_ciento"
				? `Más de ${porCiento}% se cambia producto por producto.`
				: `Más de ${texto(tope)} se cambia producto por producto.`;
		return { resultado: { ...vacio, sin_precio: 0, error: { codigo: pasa, mensaje } } };
	}
	if (lista === null) {
		return {
			resultado: {
				...vacio,
				sin_precio: ids.length,
				error: { codigo: "sin_precio_en_lista", mensaje: "Ninguno de esos productos tiene precio en esa lista." },
			},
		};
	}
	const vigentes = await filas(
		base,
		sql`SELECT p.id AS producto_id, p.nombre AS producto, e.nombre AS escuela, pr.variante_id, pr.precio_centavos::int AS precio
			FROM precios pr JOIN productos p ON p.id = pr.producto_id LEFT JOIN escuelas e ON e.id = p.escuela_id
			WHERE pr.lista_id = ${lista.id} AND pr.vigente_hasta IS NULL AND pr.producto_id IN (${enLista(ids)})
			ORDER BY p.nombre, e.nombre NULLS FIRST, pr.variante_id NULLS FIRST`,
		z.object({
			producto_id: z.uuid(),
			producto: z.string(),
			escuela: z.string().nullable(),
			variante_id: z.uuid().nullable(),
			precio: z.number(),
		}),
	);
	const maximo = await parametroNumero(base, "catalogo.precio_max_centavos");
	const cambios = vigentes
		.map((vigente) => ({ ...vigente, nuevo: precioDelCambioEnBloque(centavos(vigente.precio), cambio, redondeo) }))
		.filter((uno) => uno.nuevo !== uno.precio);
	const conPrecio = new Set(vigentes.map((vigente) => vigente.producto_id));
	const queCambian = [...new Set(cambios.map((uno) => uno.producto_id))];
	const fuera = cambios.find((uno) => uno.nuevo < 100 || uno.nuevo > maximo);
	const error =
		fuera !== undefined
			? {
					codigo: "precio_fuera_de_rango",
					mensaje: `${fuera.producto} quedaría en ${texto(Math.max(0, fuera.nuevo))}: el precio va de $1 a ${texto(maximo)}. Quítalo de la selección o cámbialo en su ficha.`,
				}
			: cambios.length === 0
				? { codigo: "sin_cambio", mensaje: "Con ese cambio no se mueve ningún precio." }
				: null;
	// En cada producto, el renglón de la vista es su precio base, o el primero de talla si no tiene base.
	const renglones = queCambian.slice(0, renglonesDeLaVista).flatMap((productoId) => {
		const uno = cambios.find((otro) => otro.producto_id === productoId);
		return uno === undefined
			? []
			: [{ producto: uno.producto, escuela: uno.escuela, antes_centavos: uno.precio, despues_centavos: uno.nuevo }];
	});
	return {
		resultado: {
			listas,
			lista,
			renglones,
			cambian: queCambian.length,
			escogidos: ids.length,
			sin_precio: ids.filter((id) => !conPrecio.has(id)).length,
			precios: cambios.length,
			redondeo_centavos: redondeo,
			error,
		},
	};
});
