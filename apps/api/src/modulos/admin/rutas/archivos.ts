/**
 * Las rutas fijas de los archivos: `POST /v1/archivos/subida` y `GET /v1/archivos/{id}`.
 * Fase 4 · docs/modulos/admin/archivos.md («`admin.subir_archivo`» y «`admin.archivo`»)
 *
 * La subida revisa el propósito, el tipo, el tamaño y el departamento, escribe el archivo sin `subido_en`
 * y da la dirección firmada con los encabezados que el cliente tiene que mandar. Abrir un archivo pide
 * poder ver su documento, y eso lo responde el módulo dueño con su lectura `{modulo}.ve_documento`; uno
 * sin ligar solo lo ve quien lo subió. A quien no puede verlo le responde `404`, como si no existiera.
 */

import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { departamentosDelModulo } from "../../../nucleo/acceso/departamentos.ts";
import type { QuienLlama } from "../../../nucleo/acceso/quien.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { camposDeZod } from "../../../nucleo/http/validacion.ts";
import type { ContextoDeRuta, RutaFija } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { bytesPorMb, claveEnElAlmacen, columnasDeQuienSube, loSubio, tiposPorProposito } from "../dominio/archivos.ts";
import { archivos, propositosDeArchivo } from "../tablas.ts";

/** Lo que pide la subida. */
const pedidoDeSubida = z.object({
	proposito: z.enum(propositosDeArchivo),
	modulo: z.string().min(1),
	nombre_original: z.string().trim().min(1).max(200),
	tipo_mime: z.string().min(1),
	tamano_bytes: z.number().int().positive(),
	sha256: z.string().regex(/^[0-9a-f]{64}$/, "La suma SHA-256 va en hexadecimal."),
	archivo_id: z.uuid().optional(),
});

/** Los segundos que vale una dirección firmada (`admin.minutos_enlace_archivo`). */
async function segundosDelEnlace(contexto: ContextoDeRuta): Promise<number> {
	return Number(await leerParametro(contexto.base, { clave: "admin.minutos_enlace_archivo" })) * 60;
}

/** El almacén, que la API siempre tiene. */
function almacenDe(contexto: ContextoDeRuta) {
	if (contexto.almacen === undefined) throw new Error("la API no tiene almacén de archivos");
	return contexto.almacen;
}

/**
 * Revisa que quien sube tenga un departamento del módulo que usa el archivo (la dueña, todos). Un aparato
 * sube por ahora a cualquier módulo: su alcance llega con la fase 6.
 */
function revisarDepartamento(quien: QuienLlama, modulo: string): void {
	if (quien.tipo !== "cuenta" || quien.esDuena) return;
	const delModulo = Object.hasOwn(departamentosDelModulo, modulo) ? (departamentosDelModulo[modulo] ?? []) : [];
	if (!delModulo.some((departamento) => quien.departamentos.includes(departamento))) {
		throw new ErrorDeApi("sin_permiso", "sin_departamento");
	}
}

/** `POST /v1/archivos/subida`. */
const subirArchivo: RutaFija = {
	nombre: "admin.subir_archivo",
	metodo: "POST",
	url: "/v1/archivos/subida",
	descripcion: "Registra un archivo y da la dirección firmada para subirlo directo a R2",
	atender: async (contexto, peticion) => {
		const leido = pedidoDeSubida.safeParse(peticion.cuerpo);
		if (!leido.success) throw new ErrorDeApi("validacion", null, undefined, { campos: camposDeZod(leido.error) });
		const pedido = leido.data;
		// Un módulo del sistema (aunque su carpeta llegue en otra fase) o uno registrado.
		const conocido =
			Object.hasOwn(departamentosDelModulo, pedido.modulo) ||
			contexto.registro.modulos.some((modulo) => modulo.nombre === pedido.modulo);
		if (!conocido) {
			throw new ErrorDeApi("validacion", null, undefined, { campos: { modulo: "Ese módulo no existe." } });
		}
		revisarDepartamento(contexto.quien, pedido.modulo);
		const aceptados = tiposPorProposito[pedido.proposito];
		if (!aceptados.tipos.includes(pedido.tipo_mime)) {
			throw errorDeRegla("tipo_no_aceptado", `Ese tipo de archivo no se acepta aquí. Sube ${aceptados.texto}.`);
		}
		const maximoMb = Number(await leerParametro(contexto.base, { clave: "admin.archivo_tamano_max_mb" }));
		if (pedido.tamano_bytes > maximoMb * bytesPorMb) {
			throw errorDeRegla("archivo_muy_grande", `El archivo pesa más de ${maximoMb} MB.`);
		}
		const id = pedido.archivo_id ?? uuidv7();
		const clave = claveEnElAlmacen(pedido.modulo, contexto.diaDeNegocio, id);
		await contexto.enTransaccion(async (accion) => {
			const [nuevo] = await accion.transaccion
				.insert(archivos)
				.values({
					id,
					proposito: pedido.proposito,
					modulo: pedido.modulo,
					nombreOriginal: pedido.nombre_original,
					tipoMime: pedido.tipo_mime,
					tamanoBytes: pedido.tamano_bytes,
					sha256: pedido.sha256,
					almacenClave: clave,
					...columnasDeQuienSube(accion.quien),
				})
				.onConflictDoNothing()
				.returning({ id: archivos.id });
			if (nuevo !== undefined) return;
			// Un aparato que repite su subida con el mismo id recibe la misma dirección; otro, no.
			const [anterior] = await accion.transaccion.select().from(archivos).where(eq(archivos.id, id));
			if (anterior === undefined || !loSubio(accion.quien, anterior) || anterior.sha256 !== pedido.sha256) {
				throw errorDeRegla("archivo_ajeno", "Ese archivo lo subió otra cuenta.");
			}
		});
		const { url, encabezados } = await almacenDe(contexto).direccionDeSubida(
			clave,
			{ tipo: pedido.tipo_mime, tamano: pedido.tamano_bytes, sha256: pedido.sha256 },
			await segundosDelEnlace(contexto),
		);
		return { estado: 200, cuerpo: { ok: true, resultado: { archivo_id: id, url_subida: url, encabezados } } };
	},
};

/** Lo que pide abrir un archivo. */
const pedidoDeArchivo = z.object({ id: z.uuid() });
const busquedaDeArchivo = z.object({ descarga: z.enum(["true", "false"]).optional() });

/** `GET /v1/archivos/{id}`. */
const abrirArchivo: RutaFija = {
	nombre: "admin.archivo",
	metodo: "GET",
	url: "/v1/archivos/:id",
	descripcion: "Abre o baja un archivo: redirige a una dirección firmada si la cuenta puede ver su documento",
	atender: async (contexto, peticion) => {
		const parametros = pedidoDeArchivo.safeParse(peticion.parametros);
		if (!parametros.success) throw noExiste();
		const descarga = busquedaDeArchivo.safeParse(peticion.busqueda).data?.descarga === "true";
		const archivo = await contexto.enTransaccion(async (accion) => {
			const [encontrado] = await accion.transaccion
				.select()
				.from(archivos)
				.where(and(eq(archivos.id, parametros.data.id), isNull(archivos.bajaEn)));
			if (encontrado === undefined) return undefined;
			if (encontrado.entidad === null || encontrado.entidadId === null) {
				return loSubio(accion.quien, encontrado) ? encontrado : undefined;
			}
			const lectura = `${encontrado.modulo}.ve_documento`;
			if (!accion.hayLectura(lectura)) return undefined;
			const loVe = await accion.lectura(lectura, { entidad: encontrado.entidad, entidad_id: encontrado.entidadId });
			return loVe === true ? encontrado : undefined;
		});
		if (archivo === undefined) throw noExiste();
		const url = await almacenDe(contexto).direccionDeBajada(
			archivo.almacenClave,
			{ nombre: archivo.nombreOriginal, descarga },
			await segundosDelEnlace(contexto),
		);
		return { redirigir: url };
	},
};

/** Las rutas fijas de los archivos. */
export const rutasDeArchivos: readonly RutaFija[] = [subirArchivo, abrirArchivo];
