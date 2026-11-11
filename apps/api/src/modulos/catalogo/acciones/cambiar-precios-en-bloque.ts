/**
 * `catalogo.cambiar_precios_en_bloque`: Catálogo, con «Confirmar con Google», sube o baja los precios de varios
 * productos en una lista.
 * Fase 8 · docs/modulos/catalogo/precios.md («`catalogo.cambiar_precios_en_bloque`»)
 *
 * El precio nuevo sale de `precioDelCambioEnBloque` del paquete compartido, la misma función que la vista previa
 * (lo que se ve es lo que se aplica). Si un precio saldría del rango no se cambia ninguno: nada se recorta en
 * silencio. Un renglón de bitácora por producto, con sus precios de talla en el mismo renglón.
 */

import {
	cambioEnPorCiento,
	precioDelCambioEnBloque,
	topeDelCambioEnBloque,
} from "@uniformame/compartido/calculos/precios";
import { cambiarPreciosEnBloque } from "@uniformame/compartido/contratos/catalogo/precios";
import { centavos } from "@uniformame/compartido/tipos/base";
import { eq } from "drizzle-orm";
import { revisarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import {
	cambiarPrecio,
	eventoDePrecio,
	marcarPorReimprimir,
	mostradorPorTalla,
	preciosVigentes,
} from "../dominio/precios.ts";
import { leerProducto, textoDePrecio, tomarVersionDelProducto } from "../dominio/productos.ts";
import { listasPrecios, productos } from "../tablas.ts";

/** Lee un parámetro entero (centavos o por ciento). */
async function numero(contexto: ContextoDeAccion, clave: string): Promise<number> {
	return Number(await contexto.lectura("admin.parametro", { clave }));
}

export const accionCambiarPreciosEnBloque = implementarAccion(cambiarPreciosEnBloque, async (contexto, datos) => {
	const { transaccion } = contexto;
	const confirmado = confirmadoConGoogle(contexto);
	const tope = topeDelCambioEnBloque(datos, {
		porCiento: await numero(contexto, "catalogo.bloque_tope_pct"),
		centavos: await numero(contexto, "catalogo.bloque_tope_centavos"),
	});
	if (tope === "tope_por_ciento") {
		throw errorDeRegla(
			"tope_por_ciento",
			`Más de ${await numero(contexto, "catalogo.bloque_tope_pct")}% se cambia producto por producto.`,
		);
	}
	if (tope === "tope_pesos") {
		throw errorDeRegla(
			"tope_pesos",
			`Más de ${textoDePrecio(await numero(contexto, "catalogo.bloque_tope_centavos"))} se cambia producto por producto.`,
		);
	}
	const [lista] = await transaccion.select().from(listasPrecios).where(eq(listasPrecios.id, datos.lista_id));
	if (lista === undefined) throw noExiste();
	const redondeo = await numero(contexto, "catalogo.bloque_redondeo_centavos");
	const maximo = await numero(contexto, "catalogo.precio_max_centavos");
	// En orden por id: dos cambios en bloque a la vez bloquean los productos en el mismo orden.
	const ordenados = [...datos.productos].sort((uno, otro) => uno.producto_id.localeCompare(otro.producto_id));
	const planes = [];
	for (const { producto_id, version } of ordenados) {
		const producto = await leerProducto(transaccion, producto_id);
		const vigentes = await preciosVigentes(transaccion, [producto.id], lista.id);
		const cambios = vigentes
			.map((vigente) => ({
				vigente,
				nuevo: precioDelCambioEnBloque(centavos(vigente.precioCentavos), datos, redondeo),
			}))
			.filter((cambio) => cambio.nuevo !== cambio.vigente.precioCentavos);
		for (const { nuevo } of cambios) {
			if (nuevo < 100 || nuevo > maximo) {
				throw errorDeRegla(
					"precio_fuera_de_rango",
					`${producto.nombre} quedaría en ${textoDePrecio(Math.max(0, nuevo))}: el precio va de $1 a ${textoDePrecio(maximo)}. Quítalo de la selección o cámbialo en su ficha.`,
				);
			}
		}
		planes.push({ producto, version, vigentes, cambios });
	}
	if (planes.every((plan) => plan.vigentes.length === 0)) {
		throw errorDeRegla("sin_precio_en_lista", `Ninguno de esos productos tiene precio en ${lista.nombre}.`);
	}
	if (planes.every((plan) => plan.cambios.length === 0)) {
		throw errorDeRegla("sin_cambio", "Con ese cambio no se mueve ningún precio.");
	}
	let cambiados = 0;
	const sinCambio: string[] = [];
	for (const { producto, version, cambios } of planes) {
		if (cambios.length === 0) {
			// Se deja igual, pero su versión se revisa: si alguien lo cambió, `409`.
			await revisarVersion(contexto, productos, producto.id, version, async () => ({ producto_id: producto.id }));
			sinCambio.push(producto.id);
			continue;
		}
		await tomarVersionDelProducto(contexto, producto, version);
		const mostradorAntes =
			lista.tipo === "mostrador" ? await mostradorPorTalla(transaccion, producto.id, lista.id) : undefined;
		for (const { vigente, nuevo } of cambios) {
			await cambiarPrecio(
				contexto,
				{ vigente, listaId: lista.id, productoId: producto.id, varianteId: vigente.varianteId, precio: nuevo },
				{ origen: "cambio_en_bloque", confirmadoConGoogleEn: confirmado },
			);
		}
		if (mostradorAntes !== undefined) {
			await marcarPorReimprimir(
				contexto,
				producto.id,
				mostradorAntes,
				await mostradorPorTalla(transaccion, producto.id, lista.id),
			);
		}
		const base = cambios.find((cambio) => cambio.vigente.varianteId === null);
		const [primero] = cambios;
		const deReferencia = base ?? primero;
		contexto.bitacora({
			descripcion:
				deReferencia === undefined
					? `Precio de ${lista.nombre}`
					: `Precio de ${lista.nombre}: ${textoDePrecio(deReferencia.vigente.precioCentavos)} → ${textoDePrecio(deReferencia.nuevo)} ${cambioEnPorCiento(deReferencia.vigente.precioCentavos, deReferencia.nuevo)}`,
			entidad: "productos",
			entidadId: producto.id,
			antes: {
				lista_id: lista.id,
				precios: cambios.map(({ vigente }) => ({
					variante_id: vigente.varianteId,
					precio_centavos: vigente.precioCentavos,
				})),
			},
			despues: {
				lista_id: lista.id,
				precios: cambios.map(({ vigente, nuevo }) => ({ variante_id: vigente.varianteId, precio_centavos: nuevo })),
			},
			confirmadoConGoogleEn: confirmado,
		});
		eventoDePrecio(contexto, producto.id, lista.id);
		cambiados += cambios.length;
	}
	return {
		resultado: {
			precios_cambiados: cambiados,
			sin_cambio: sinCambio,
			mensaje: `${cambiados} precios actualizados en ${lista.nombre}. Quedan en la bitácora`,
		},
	};
});
