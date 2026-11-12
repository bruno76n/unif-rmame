/**
 * Lo que comparten las acciones de Compras: leer y bloquear un proveedor o un material, su nombre, los topes de
 * los parámetros, el precio en texto y el historial de precios.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md y materiales.md (reglas)
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { esCentavos } from "@uniformame/compartido/tipos/base";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { subirVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { materiales, materialProveedores, type origenesDePrecio, preciosCompra, proveedores } from "../tablas.ts";

/** Un proveedor como se guarda. */
export type Proveedor = typeof proveedores.$inferSelect;

/** Un material como se guarda. */
export type Material = typeof materiales.$inferSelect;

/** Lo que regresa `contaduria.datos_terceros`. */
const datosDeTerceros = z.record(z.string(), z.object({ nombre: z.string(), rfc: z.string().nullable() }));

/**
 * Lee un número de un parámetro.
 * @param contexto El contexto de la acción.
 * @param clave La clave del parámetro.
 */
export async function parametroNumero(contexto: ContextoDeAccion, clave: string): Promise<number> {
	return Number(await contexto.lectura("admin.parametro", { clave }));
}

/**
 * Lee un proveedor con su nombre y su RFC (de su tercero) y lo bloquea.
 * @param contexto El contexto de la acción.
 * @param id El proveedor.
 * @param candado `update` para cambiarlo; `share` para usarlo (que nadie lo dé de baja mientras).
 * @throws `404` si no existe.
 */
export async function leerProveedor(
	contexto: ContextoDeAccion,
	id: string,
	candado: "update" | "share",
): Promise<Proveedor & { nombre: string; rfc: string | null }> {
	const [proveedor] = await contexto.transaccion.select().from(proveedores).where(eq(proveedores.id, id)).for(candado);
	if (proveedor === undefined) throw noExiste();
	const tercero = datosDeTerceros.parse(
		await contexto.lectura("contaduria.datos_terceros", { tercero_ids: [proveedor.terceroId] }),
	)[proveedor.terceroId];
	if (tercero === undefined) throw new Error(`el proveedor ${id} no tiene su tercero`);
	return { ...proveedor, nombre: tercero.nombre, rfc: tercero.rfc };
}

/**
 * Revisa que un proveedor siga activo.
 * @throws `422 proveedor_dado_de_baja`: «{proveedor} está dado de baja.».
 */
export function revisarProveedorActivo(proveedor: { nombre: string; bajaEn: string | null }): void {
	if (proveedor.bajaEn !== null) {
		throw errorDeRegla("proveedor_dado_de_baja", `${proveedor.nombre} está dado de baja.`);
	}
}

/**
 * Lee un material y lo bloquea para cambiarlo. El candado también espera a un movimiento a medias que lo usa (la
 * llave foránea del libro lo comparte).
 * @throws `404` si no existe.
 */
export async function leerMaterial(contexto: ContextoDeAccion, id: string): Promise<Material> {
	const [material] = await contexto.transaccion.select().from(materiales).where(eq(materiales.id, id)).for("update");
	if (material === undefined) throw noExiste();
	return material;
}

/**
 * Revisa que un precio de compra no pase de `compras.precio_max_centavos`.
 * @param contexto El contexto de la acción.
 * @param campo El campo del precio, para su mensaje.
 * @param mensaje El mensaje de ese campo.
 * @param precio Los centavos.
 * @throws `400` en ese campo.
 */
export async function revisarPrecio(contexto: ContextoDeAccion, campo: string, mensaje: string, precio: number) {
	if (precio > (await parametroNumero(contexto, "compras.precio_max_centavos"))) throw errorDeCampo(campo, mensaje);
}

/**
 * Un precio de compra en texto: «$78» o, con centavos, «$0.38».
 * @param precio Los centavos.
 */
export function precioATexto(precio: number): string {
	if (!esCentavos(precio)) throw new Error(`${precio} no son centavos`);
	return centavosATexto(precio, { conCentavos: precio % 100 !== 0 });
}

/**
 * El aviso de un precio distinto del anterior: lo usan la orden (contra el último que se le pagó a ese proveedor) y
 * la nota del proveedor (contra el vigente de la línea).
 * @param material El nombre del material.
 * @param anterior El precio anterior, si hay.
 * @param nuevo El precio nuevo.
 * @param umbral Desde qué cambio, en por ciento, se avisa; sin umbral, cualquier cambio.
 * @returns «{material}: sube {n} % · antes ${precio}» o «baja…», o nada si es el mismo, no hay anterior o no llega
 * al umbral.
 */
export function avisoDePrecio(material: string, anterior: number | undefined, nuevo: number, umbral = 0): string[] {
	if (anterior === undefined || anterior === nuevo) return [];
	const cambio = (Math.abs(nuevo - anterior) * 100) / anterior;
	if (cambio < umbral) return [];
	return [
		`${material}: ${nuevo > anterior ? "sube" : "baja"} ${Math.round(cambio)} % · antes ${precioATexto(anterior)}`,
	];
}

/** Lo más que cabe en `numeric(6,3)`. */
const cambioMaximo = 999.999;

/**
 * El cambio de un precio contra el anterior, en por ciento con tres decimales, para `cambio_porcentaje`.
 * @param anterior El precio anterior, mayor que cero.
 * @param nuevo El precio nuevo.
 * @returns El texto decimal. Un cambio de más de 999.999 % (de $0.38 a $78) se guarda como 999.999: la marca ámbar
 * solo pregunta si pasa del umbral.
 */
export function cambioPorcentaje(anterior: number, nuevo: number): string {
	const cambio = ((nuevo - anterior) * 100) / anterior;
	return Math.max(-cambioMaximo, Math.min(cambioMaximo, cambio)).toFixed(3);
}

/**
 * Guarda un precio en el historial y lo copia como el último del par: el renglón del par nace, se reactiva o se
 * actualiza en la misma transacción. Compara contra el último precio de ese proveedor con ese material, o contra el
 * que se dé (el de la línea, en una nota).
 * @param contexto El contexto de la acción.
 * @param precio El material, el proveedor, el precio y su origen; con `orden` o `nota`, su orden y su línea.
 * @returns El precio contra el que se comparó, o nada si no había.
 */
export async function registrarPrecio(
	contexto: ContextoDeAccion,
	precio: {
		materialId: string;
		proveedorId: string;
		precioCentavos: number;
		origen: (typeof origenesDePrecio)[number];
		orden?: { id: string; lineaId: string };
		anterior?: number;
	},
): Promise<number | null> {
	const { transaccion } = contexto;
	const [par] = await transaccion
		.select()
		.from(materialProveedores)
		.where(
			and(
				eq(materialProveedores.materialId, precio.materialId),
				eq(materialProveedores.proveedorId, precio.proveedorId),
			),
		)
		.for("update");
	const anterior = precio.anterior ?? par?.ultimoPrecioCentavos ?? null;
	await transaccion.insert(preciosCompra).values({
		id: uuidv7(),
		materialId: precio.materialId,
		proveedorId: precio.proveedorId,
		precioCentavos: precio.precioCentavos,
		origen: precio.origen,
		ordenCompraId: precio.orden?.id ?? null,
		ordenCompraLineaId: precio.orden?.lineaId ?? null,
		precioAnteriorCentavos: anterior,
		cambioPorcentaje: anterior === null ? null : cambioPorcentaje(anterior, precio.precioCentavos),
		fecha: contexto.diaDeNegocio.toString(),
		creadoPor: quienCambia(contexto),
	});
	if (par === undefined) {
		await transaccion.insert(materialProveedores).values({
			id: uuidv7(),
			materialId: precio.materialId,
			proveedorId: precio.proveedorId,
			ultimoPrecioCentavos: precio.precioCentavos,
			creadoPor: quienCambia(contexto),
		});
		return anterior;
	}
	await transaccion
		.update(materialProveedores)
		.set({
			ultimoPrecioCentavos: precio.precioCentavos,
			...(par.bajaEn === null
				? {}
				: { bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() }),
		})
		.where(eq(materialProveedores.id, par.id));
	return anterior;
}

/**
 * Guarda el evento de un proveedor.
 * @param contexto El contexto de la acción.
 * @param tipo `proveedor.creado` o `proveedor.cambiado`.
 * @param id El proveedor.
 */
export function eventoDeProveedor(
	contexto: ContextoDeAccion,
	tipo: "proveedor.creado" | "proveedor.cambiado",
	id: string,
) {
	contexto.guardarEvento({
		tipo,
		datos: { proveedor_id: id },
		tablas: ["proveedores"],
		entidad: "proveedores",
		entidadId: id,
	});
}

/**
 * Un material cuyos proveedores o último precio cambiaron desde otra acción (una orden, una nota): sube su versión,
 * para que quien lo tiene abierto choque, y guarda `material.cambiado`.
 * @param contexto El contexto de la acción, que ya bloqueó el material.
 * @param materialId El material.
 */
export async function materialCambiado(contexto: ContextoDeAccion, materialId: string): Promise<void> {
	await subirVersion(contexto.transaccion, materiales, materialId);
	eventoDeMaterial(contexto, "material.cambiado", materialId);
}

/**
 * Guarda el evento de un material. Toca también sus proveedores: el cajón Material los muestra.
 * @param contexto El contexto de la acción.
 * @param tipo `material.creado` o `material.cambiado`.
 * @param id El material.
 */
export function eventoDeMaterial(
	contexto: ContextoDeAccion,
	tipo: "material.creado" | "material.cambiado",
	id: string,
) {
	contexto.guardarEvento({
		tipo,
		datos: { material_id: id },
		tablas: ["materiales", "material_proveedores", "precios_compra"],
		entidad: "materiales",
		entidadId: id,
	});
}
