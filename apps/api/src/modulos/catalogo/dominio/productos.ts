/**
 * Lo que comparten las acciones de los productos y sus tallas: leerlos, tomar la versión del producto, tomar
 * códigos de barras, revisar un precio y los canales, y los eventos.
 * Fase 8 · docs/modulos/catalogo/productos.md (reglas 3, 4 y 9) y variantes-codigos-y-etiquetas.md (reglas 1,
 * 2 y 9)
 *
 * El producto es un agregado: cualquier cambio en él, en sus variantes o en sus precios toma (y sube) su
 * versión.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { centavos } from "@uniformame/compartido/tipos/base";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, tallas, variantes } from "../tablas.ts";

/** Un producto como lo leen las acciones. */
export type Producto = typeof productos.$inferSelect;

/** Una variante como la leen las acciones, con el nombre de su talla. */
export type Variante = typeof variantes.$inferSelect & { talla: string };

/**
 * Lee un producto y lo bloquea.
 * @throws `404` si no existe.
 */
export async function leerProducto(transaccion: Transaccion, id: string): Promise<Producto> {
	const [producto] = await transaccion.select().from(productos).where(eq(productos.id, id)).for("update");
	if (producto === undefined) throw noExiste();
	return producto;
}

/**
 * Lee una variante con el nombre de su talla, y la bloquea.
 * @throws `404` si no existe.
 */
export async function leerVariante(transaccion: Transaccion, id: string): Promise<Variante> {
	const [leida] = await transaccion
		.select({ variante: variantes, talla: tallas.nombre })
		.from(variantes)
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(eq(variantes.id, id))
		.for("update", { of: variantes });
	if (leida === undefined) throw noExiste();
	return { ...leida.variante, talla: leida.talla };
}

/**
 * Toma la versión del producto que se leyó en la ficha y la sube: el `409` lleva lo que la cuenta ve de él.
 * @param contexto El contexto de la acción.
 * @param producto El producto, ya bloqueado.
 * @param version La versión que se leyó.
 */
export async function tomarVersionDelProducto(
	contexto: ContextoDeAccion,
	producto: Producto,
	version: number | undefined,
): Promise<void> {
	await tomarVersion(contexto, productos, producto.id, version, async () => ({
		producto_id: producto.id,
		nombre: producto.nombre,
		descontinuado: producto.bajaEn !== null,
	}));
}

/**
 * Revisa que el producto esté activo para cambiarlo.
 * @throws `422 producto_descontinuado`.
 */
export function revisarQueEstaActivo(producto: Producto): void {
	if (producto.bajaEn !== null) {
		throw errorDeRegla("producto_descontinuado", `${producto.nombre} está descontinuado: reactívalo para cambiarlo.`);
	}
}

/**
 * Toma `n` códigos de barras de fábrica seguidos, en un solo paso.
 * @param contexto El contexto de la acción.
 * @param n Cuántos.
 * @param mensajeSinCodigos El mensaje de `sin_codigos` de quien los pide.
 * @returns Los códigos, en orden.
 * @throws `422 sin_codigos` si no alcanzan: no toma ninguno.
 */
export async function tomarCodigos(
	contexto: ContextoDeAccion,
	n: number,
	mensajeSinCodigos: string,
): Promise<string[]> {
	try {
		const tomados = z
			.array(z.object({ folio: z.string() }))
			.parse(await contexto.interna("admin.tomar_folio", { tipo: "codigo_barras", n }));
		return tomados.map((tomado) => tomado.folio);
	} catch (error) {
		if (error instanceof ErrorDeApi && error.codigo === "folio_agotado")
			throw errorDeRegla("sin_codigos", mensajeSinCodigos);
		throw error;
	}
}

/**
 * Revisa que un precio no pase de `catalogo.precio_max_centavos`.
 * @param contexto El contexto de la acción.
 * @param campo El campo donde va el mensaje.
 * @param precio El precio, en centavos (pesos enteros: lo revisa el contrato).
 * @param mensaje El mensaje del campo.
 * @throws `400` en el campo.
 */
export async function revisarPrecioMaximo(
	contexto: ContextoDeAccion,
	campo: string,
	precio: number,
	mensaje: (tope: string) => string,
): Promise<void> {
	const maximo = Number(await contexto.lectura("admin.parametro", { clave: "catalogo.precio_max_centavos" }));
	if (precio > maximo) throw errorDeCampo(campo, mensaje(textoDePrecio(maximo)));
}

/**
 * Revisa dónde se puede vender: en línea, solo sin escuela y nunca un servicio.
 * @throws `422 en_linea_solo_sin_escuela` o `422 servicio_en_linea`.
 */
export function revisarCanalEnLinea(
	producto: { escuelaId: string | null; esServicio: boolean },
	enLinea: boolean,
): void {
	if (!enLinea) return;
	if (producto.esServicio) throw errorDeRegla("servicio_en_linea", "Los servicios de mostrador no se venden en línea");
	if (producto.escuelaId !== null) {
		throw errorDeRegla("en_linea_solo_sin_escuela", "Solo productos de «Ninguna escuela» se venden en línea.");
	}
}

/** Un precio como se lee en los mensajes: «$1,250». */
export function textoDePrecio(precio: number): string {
	return centavosATexto(centavos(precio));
}

/**
 * Guarda un evento del producto, con «hay cambios» en sus tablas.
 * @param contexto El contexto de la acción.
 * @param tipo El tipo del evento.
 * @param producto El producto.
 * @param tablas Las tablas que cambiaron.
 */
export function eventoDeProducto(
	contexto: ContextoDeAccion,
	tipo: `${"producto" | "variante" | "precio"}.${string}`,
	producto: Pick<Producto, "id">,
	tablas: readonly string[],
): void {
	contexto.guardarEvento({
		tipo,
		datos: { producto_id: producto.id },
		tablas: [...tablas],
		entidad: "productos",
		entidadId: producto.id,
	});
}

/**
 * Revisa con Producción que un flujo exista y no esté dado de baja (`produccion.flujo_vigente`).
 * Fase 12 · docs/modulos/catalogo/productos.md («Lo que llega después»)
 * @param contexto El contexto de la acción.
 * @param flujoId El flujo.
 * @returns Su nombre, o `null` si no existe o está dado de baja.
 */
export async function nombreDeFlujoVigente(contexto: ContextoDeAccion, flujoId: string): Promise<string | null> {
	const suyo = await leerFlujo(contexto, flujoId);
	return suyo.vigente ? suyo.nombre : null;
}

/** Lo que dice Producción de un flujo: si está vigente y su nombre (también si ya está dado de baja). */
export async function leerFlujo(contexto: ContextoDeAccion, flujoId: string) {
	return z
		.object({ vigente: z.boolean(), nombre: z.string().nullable() })
		.parse(await contexto.lectura("produccion.flujo_vigente", { flujo_id: flujoId }));
}

/**
 * Como `nombreDeFlujoVigente`, para un flujo que se escogió.
 * @param campo El campo que lo trae, para el error.
 * @throws `400` en el campo: «Escoge un flujo vigente.».
 */
export async function flujoEscogido(contexto: ContextoDeAccion, flujoId: string, campo: string): Promise<string> {
	const nombre = await nombreDeFlujoVigente(contexto, flujoId);
	if (nombre === null) throw errorDeCampo(campo, "Escoge un flujo vigente.");
	return nombre;
}
