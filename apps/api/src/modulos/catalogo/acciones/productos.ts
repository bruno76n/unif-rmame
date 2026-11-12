/**
 * `catalogo.subir_foto_producto`, `catalogo.descontinuar_productos` y `catalogo.reactivar_producto`.
 * Fase 8 · docs/modulos/catalogo/productos.md (reglas 9 a 11, «Acciones»)
 *
 * La foto se guarda en el momento, aparte de «Aplicar cambios», y la anterior se queda en archivos como
 * historial. Descontinuar no borra nada: conserva sus códigos, precios, historial y canales marcados.
 * Pausar sus publicaciones en línea llega con uniformame.mx (fase 18).
 */

import {
	descontinuarProductos,
	reactivarProducto,
	subirFotoProducto,
} from "@uniformame/compartido/contratos/catalogo/productos";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { eventoDeProducto, leerProducto, tomarVersionDelProducto } from "../dominio/productos.ts";
import { escuelas, productos } from "../tablas.ts";

/** Los formatos de la foto de un producto: la de un gasto acepta también HEIC, esta no. */
const formatosDeFoto = ["image/jpeg", "image/png", "image/webp"];

/** Lo que da `admin.datos_de_archivo`. */
const datosDeArchivo = z.object({ tipo_mime: z.string(), tamano_bytes: z.number() });

export const accionSubirFotoProducto = implementarAccion(subirFotoProducto, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const producto = await leerProducto(transaccion, datos.producto_id);
	await tomarVersionDelProducto(contexto, producto, version);
	const archivo = datosDeArchivo.parse(
		await contexto.lectura("admin.datos_de_archivo", { archivo_id: datos.archivo_id }),
	);
	if (!formatosDeFoto.includes(archivo.tipo_mime))
		throw errorDeRegla("foto_formato", "La foto debe ser JPG, PNG o WebP.");
	const maximoMb = Number(await contexto.lectura("admin.parametro", { clave: "catalogo.foto_max_mb" }));
	if (archivo.tamano_bytes > maximoMb * 1024 * 1024) {
		throw errorDeRegla("foto_pesada", `La foto pesa más de ${maximoMb} MB. Súbela más ligera.`);
	}
	await contexto.interna("admin.ligar_archivo", {
		archivo_id: datos.archivo_id,
		proposito: "foto",
		modulo: "catalogo",
		entidad: "productos",
		entidad_id: producto.id,
	});
	await transaccion.update(productos).set({ fotoArchivoId: datos.archivo_id }).where(eq(productos.id, producto.id));
	contexto.bitacora({
		descripcion: `Cambió la foto de ${producto.nombre}`,
		entidad: "productos",
		entidadId: producto.id,
		antes: { foto_archivo_id: producto.fotoArchivoId },
		despues: { foto_archivo_id: datos.archivo_id },
	});
	eventoDeProducto(contexto, "producto.cambiado", producto, ["productos"]);
	return {
		resultado: {
			mensaje:
				producto.canalEnLinea && producto.bajaEn === null
					? `Foto guardada. ${producto.nombre} ya se puede publicar en línea`
					: "Foto guardada",
			version: await versionActual(transaccion, productos, producto.id),
		},
		entidad: { nombre: "productos", id: producto.id },
	};
});

export const accionDescontinuarProductos = implementarAccion(descontinuarProductos, async (contexto, datos) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	// En orden por id: dos descontinuaciones a la vez bloquean en el mismo orden.
	const ordenados = [...datos.productos].sort((uno, otro) => uno.producto_id.localeCompare(otro.producto_id));
	const descontinuados: string[] = [];
	for (const { producto_id, version } of ordenados) {
		const producto = await leerProducto(transaccion, producto_id);
		if (producto.bajaEn !== null) continue;
		await tomarVersionDelProducto(contexto, producto, version);
		await transaccion
			.update(productos)
			.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
			.where(eq(productos.id, producto.id));
		contexto.bitacora({
			descripcion: `Descontinuó ${producto.nombre}: ${datos.motivo}`,
			entidad: "productos",
			entidadId: producto.id,
			antes: { activo: true },
			despues: { activo: false, motivo: datos.motivo },
		});
		eventoDeProducto(contexto, "producto.descontinuado", producto, ["productos"]);
		// Sus publicaciones en línea se pausan (fase 18).
		await contexto.interna("linea.pausar_publicaciones_producto", {
			producto_id: producto.id,
			motivo: "descontinuado",
		});
		descontinuados.push(producto.nombre);
	}
	const [unico] = descontinuados;
	if (unico === undefined) throw errorDeRegla("ya_descontinuados", "Esos productos ya están descontinuados");
	return {
		resultado: {
			descontinuados: descontinuados.length,
			mensaje:
				descontinuados.length === 1
					? `${unico} descontinuado. Su historial y sus códigos se conservan`
					: `${descontinuados.length} productos descontinuados`,
		},
	};
});

export const accionReactivarProducto = implementarAccion(reactivarProducto, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const producto = await leerProducto(transaccion, datos.producto_id);
	await tomarVersionDelProducto(contexto, producto, version);
	if (producto.bajaEn === null) throw errorDeRegla("producto_activo", `${producto.nombre} ya está activo.`);
	if (producto.escuelaId !== null) {
		const [escuela] = await transaccion
			.select({ nombre: escuelas.nombre, bajaEn: escuelas.bajaEn })
			.from(escuelas)
			.where(eq(escuelas.id, producto.escuelaId));
		if (escuela !== undefined && escuela.bajaEn !== null) {
			throw errorDeRegla("escuela_dada_de_baja", `${escuela.nombre} está dada de baja: reactívala antes.`);
		}
	}
	await transaccion
		.update(productos)
		.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
		.where(eq(productos.id, producto.id));
	contexto.bitacora({
		descripcion: "Vuelve a venderse",
		entidad: "productos",
		entidadId: producto.id,
		antes: { activo: false, motivo: producto.motivoBaja },
		despues: { activo: true },
	});
	eventoDeProducto(contexto, "producto.reactivado", producto, ["productos"]);
	return {
		resultado: {
			mensaje: `${producto.nombre} vuelve a estar activo`,
			version: await versionActual(transaccion, productos, producto.id),
		},
		entidad: { nombre: "productos", id: producto.id },
	};
});
