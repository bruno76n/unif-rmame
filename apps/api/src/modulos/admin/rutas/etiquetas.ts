/**
 * La ruta fija de las etiquetas y las hojas: `GET /v1/etiquetas/{tipo}/{id}?formato=zpl|pdf`.
 * Fase 4 · docs/modulos/admin/impresion.md («`admin.etiqueta`»)
 *
 * El tipo lo registra su módulo con quién lo puede pedir y su dibujo (los del negocio, en la fase 20). La
 * pide un departamento que pueda ver ese tipo (y su permiso fino, si lo pide), o el puente que tiene un
 * trabajo pendiente de esa etiqueta. Regresa ZPL en texto o el PDF.
 */

import { and, arrayContains, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { noVeMontos } from "../../../nucleo/acceso/recorte.ts";
import { ErrorDeApi, noExiste } from "../../../nucleo/http/errores.ts";
import { camposDeZod } from "../../../nucleo/http/validacion.ts";
import type { ContextoDeRuta, RutaFija, TipoDeEtiqueta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { impresoras, trabajosImpresion } from "../tablas.ts";

/** Lo que va en la dirección. */
const parametrosDeEtiqueta = z.object({ tipo: z.string().min(1), id: z.uuid() });

/** Lo que va en la búsqueda: el formato, las copias y, si son varias, los ids. */
const busquedaDeEtiqueta = z.object({
	formato: z.enum(["zpl", "pdf"], "Pide zpl o pdf."),
	copias: z.coerce.number().int().positive().optional(),
	ids: z
		.string()
		.optional()
		.transform((ids) => (ids === undefined || ids === "" ? undefined : ids.split(",")))
		.pipe(z.array(z.uuid()).optional()),
});

/**
 * Revisa que quien llama pueda pedir esa etiqueta.
 * @throws `403` sin el departamento o el permiso fino, o a la cuenta de soporte si lleva montos; `403 fuera_de_alcance`
 * a un puente sin ese trabajo.
 */
async function revisarQuienPide(contexto: ContextoDeRuta, etiqueta: TipoDeEtiqueta, ids: readonly string[]) {
	const { quien } = contexto;
	if (quien.tipo === "cuenta") {
		if (quien.esDuena) return;
		// Soporte nunca recibe un monto, y un PDF no pasa por el recorte común.
		if (etiqueta.llevaMontos === true && noVeMontos(quien)) throw new ErrorDeApi("sin_permiso", "sin_departamento");
		if (!etiqueta.departamentos.some((departamento) => quien.departamentos.includes(departamento))) {
			throw new ErrorDeApi("sin_permiso", "sin_departamento");
		}
		if (etiqueta.permisoFino !== undefined && !quien.permisosFinos.includes(etiqueta.permisoFino)) {
			throw new ErrorDeApi("sin_permiso", "sin_permiso_fino");
		}
		return;
	}
	// Un puente solo pide lo que tiene en un trabajo pendiente de una impresora suya.
	const suyas = contexto.base
		.select({ id: impresoras.id })
		.from(impresoras)
		.where(and(eq(impresoras.dispositivoId, quien.dispositivoId), isNull(impresoras.bajaEn)));
	const [pendiente] = await contexto.base
		.select({ id: trabajosImpresion.id })
		.from(trabajosImpresion)
		.where(
			and(
				eq(trabajosImpresion.tipo, etiqueta.tipo),
				inArray(trabajosImpresion.estado, ["por_imprimir", "mandado"]),
				inArray(trabajosImpresion.impresoraId, suyas),
				arrayContains(trabajosImpresion.ids, [...ids]),
			),
		)
		.limit(1);
	if (pendiente === undefined) throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
}

/** `GET /v1/etiquetas/{tipo}/{id}`. */
const etiqueta: RutaFija = {
	nombre: "admin.etiqueta",
	metodo: "GET",
	url: "/v1/etiquetas/:tipo/:id",
	descripcion: "Una etiqueta o una hoja en ZPL o en PDF, con lo que la cuenta puede ver",
	atender: async (contexto, peticion) => {
		const parametros = parametrosDeEtiqueta.safeParse(peticion.parametros);
		const busqueda = busquedaDeEtiqueta.safeParse(peticion.busqueda);
		const tipo = parametros.success ? contexto.registro.tiposDeEtiqueta.get(parametros.data.tipo) : undefined;
		if (!parametros.success || tipo === undefined) throw noExiste();
		if (!busqueda.success) {
			throw new ErrorDeApi("validacion", null, undefined, { campos: camposDeZod(busqueda.error) });
		}
		const ids = busqueda.data.ids ?? [parametros.data.id];
		await revisarQuienPide(contexto, tipo, ids);
		const maximo = Number(await leerParametro(contexto.base, { clave: "admin.copias_max_impresion" }));
		const copias = Math.min(busqueda.data.copias ?? 1, maximo);
		const contenido = await tipo.dibujar(contexto, { ids, formato: busqueda.data.formato, copias });
		return {
			contenido,
			tipo: busqueda.data.formato === "zpl" ? "text/plain; charset=utf-8" : "application/pdf",
		};
	},
};

/** Las rutas fijas de la impresión. */
export const rutasDeEtiquetas: readonly RutaFija[] = [etiqueta];
