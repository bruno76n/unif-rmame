/**
 * `catalogo.cambiar_precio_en_linea`: las acciones de `linea` cambian el precio en línea de un producto, desde la
 * fábrica o desde el panel de uniformame.mx con su credencial.
 * Fase 8 · docs/modulos/catalogo/precios.md (regla 7, «`catalogo.cambiar_precio_en_linea`»)
 *
 * El precio en línea vive en Catálogo, en la lista En línea: uniformame.mx no escribe aquí. La bitácora la
 * escribe la acción de `linea` que la llama.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { cambiarPrecio, eventoDePrecio, preciosVigentes, subirVersionDelProducto } from "../dominio/precios.ts";
import { leerProducto } from "../dominio/productos.ts";
import { listasPrecios } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({
	producto_id: z.uuid(),
	precio_centavos: z.number().int(),
	origen: z.enum(["tienda_en_linea", "panel_uniformame"]),
	usuario_panel_id: z.uuid().optional(),
	dispositivo_id: z.uuid().optional(),
});

/**
 * Cierra el precio base vigente de En línea y crea el nuevo con su origen; sube la versión del producto.
 * @param contexto El contexto de la acción de `linea`.
 * @param datos El producto, el precio, el origen y, desde el panel, quién y su credencial.
 * @returns El precio de antes y el nuevo.
 * @throws `400` si el precio no es de pesos enteros de $1 al tope; `422 canal_en_linea_apagado`.
 */
export async function cambiarPrecioEnLinea(contexto: ContextoDeAccion, datos: unknown) {
	const cambio = pedido.parse(datos);
	const { transaccion } = contexto;
	const maximo = Number(await contexto.lectura("admin.parametro", { clave: "catalogo.precio_max_centavos" }));
	if (cambio.precio_centavos <= 0 || cambio.precio_centavos % 100 !== 0 || cambio.precio_centavos > maximo) {
		throw errorDeCampo("precio_centavos", "Escribe un precio mayor que cero");
	}
	const producto = await leerProducto(transaccion, cambio.producto_id);
	if (!producto.canalEnLinea || producto.bajaEn !== null) {
		throw errorDeRegla("canal_en_linea_apagado", `${producto.nombre} no se vende en línea: lo prende Catálogo.`);
	}
	const [enLinea] = await transaccion
		.select({ id: listasPrecios.id })
		.from(listasPrecios)
		.where(eq(listasPrecios.tipo, "en_linea"));
	if (enLinea === undefined) throw new Error("no hay lista En línea");
	const vigente = (await preciosVigentes(transaccion, [producto.id], enLinea.id)).find(
		(precio) => precio.varianteId === null,
	);
	await cambiarPrecio(
		contexto,
		{ vigente, listaId: enLinea.id, productoId: producto.id, varianteId: null, precio: cambio.precio_centavos },
		{
			origen: cambio.origen,
			...(cambio.usuario_panel_id === undefined ? {} : { usuarioPanelId: cambio.usuario_panel_id }),
			...(cambio.dispositivo_id === undefined ? {} : { dispositivoId: cambio.dispositivo_id }),
		},
	);
	await subirVersionDelProducto(transaccion, producto.id);
	eventoDePrecio(contexto, producto.id, enLinea.id);
	return { antes_centavos: vigente?.precioCentavos ?? null, despues_centavos: cambio.precio_centavos };
}
