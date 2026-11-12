/**
 * `calidad.revisar_devolucion`: Calidad revisa lo que regresó con defecto, por renglón: lo que sirve pasa a Bodega y la
 * merma sale. Inventario lo aplica con `inventario.aplicar_revision_devolucion`, que también toma la versión del
 * traspaso (la tabla es suya).
 * Fase 16 · docs/modulos/calidad/reclamos-y-devoluciones.md («`calidad.revisar_devolucion`»)
 */

import { revisarDevolucion } from "@uniformame/compartido/contratos/calidad/reclamos";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { traspasoLineas, traspasos } from "../../inventario/tablas.ts";
import { type origenesDeDevolucion, revisionesDevolucion } from "../tablas.ts";

/** De qué tipo de traspaso sale cada origen de una devolución. */
const origenDelTipo: Record<string, (typeof origenesDeDevolucion)[number]> = {
	devolucion_defecto: "salida_tienda",
	devolucion_cliente_externo: "nota_credito",
	devolucion_linea: "devolucion_linea",
};

/** Lo que regresa `inventario.aplicar_revision_devolucion`. */
const revisionAplicada = z.object({ folio: z.string(), a_bodega: z.number().int(), merma: z.number().int() });

export const accionRevisarDevolucion = implementarAccion(revisarDevolucion, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [traspaso] = await transaccion.select().from(traspasos).where(eq(traspasos.id, datos.traspaso_id));
	const origen = traspaso === undefined ? undefined : origenDelTipo[traspaso.tipo];
	if (traspaso === undefined || origen === undefined) throw noExiste();
	if (traspaso.estado !== "en_aduana") {
		throw errorDeRegla("devolucion_no_en_aduana", "Esa devolución todavía no está en aduana.");
	}
	const lineas = await transaccion
		.select()
		.from(traspasoLineas)
		.where(eq(traspasoLineas.traspasoId, traspaso.id))
		.orderBy(asc(traspasoLineas.renglon));
	for (const renglon of datos.renglones) {
		if (!lineas.some((linea) => linea.id === renglon.traspaso_linea_id)) {
			throw errorDeCampo("renglones", "Ese renglón no es de esta devolución");
		}
		if (renglon.decision === "merma" && (renglon.motivo ?? "") === "") {
			throw errorDeCampo("motivo", "Escribe con qué tiene.");
		}
	}
	// Inventario lo aplica: los hijos, la merma que sale y la versión del traspaso.
	const aplicada = revisionAplicada.parse(
		await contexto.interna("inventario.aplicar_revision_devolucion", {
			traspaso_id: traspaso.id,
			version,
			renglones: datos.renglones.map((renglon) => ({
				traspaso_linea_id: renglon.traspaso_linea_id,
				piezas: renglon.piezas,
				decision: renglon.decision,
				...(renglon.motivo === undefined ? {} : { motivo: renglon.motivo }),
			})),
		}),
	);
	const quien = quienCambia(contexto);
	if (quien === null) throw new Error("revisa una cuenta de Calidad");
	await transaccion.insert(revisionesDevolucion).values(
		datos.renglones.map((renglon) => {
			const linea = lineas.find((suya) => suya.id === renglon.traspaso_linea_id);
			return {
				id: uuidv7(),
				traspasoId: traspaso.id,
				traspasoLineaId: renglon.traspaso_linea_id,
				origen,
				salidaTiendaId: traspaso.salidaTiendaId,
				notaCreditoId: traspaso.notaCreditoId,
				varianteId: linea?.varianteId ?? "",
				loteId: linea?.loteId ?? null,
				piezas: renglon.piezas,
				decision: renglon.decision,
				defectoId: renglon.defecto_id ?? linea?.defectoId ?? null,
				motivo: renglon.decision === "merma" ? (renglon.motivo ?? null) : null,
				revisadoPor: quien,
				revisadoEn: contexto.ahora.toString(),
				creadoPor: quien,
			};
		}),
	);
	contexto.guardarEvento({
		tipo: "devolucion.revisada",
		datos: { traspaso_id: traspaso.id },
		tablas: ["revisiones_devolucion", "traspasos", "traspaso_lineas", "existencias"],
		entidad: "traspasos",
		entidadId: traspaso.id,
		entidadFolio: traspaso.folio,
	});
	const motivos = [
		...new Set(datos.renglones.flatMap((renglon) => (renglon.decision === "merma" ? [renglon.motivo ?? ""] : []))),
	];
	contexto.bitacora({
		descripcion: `Revisó la devolución ${traspaso.folio}: ${aplicada.a_bodega} sirven, ${aplicada.merma} merma${motivos.length > 0 ? ` (${motivos.join(", ")})` : ""}`,
		entidad: "traspasos",
		entidadId: traspaso.id,
		entidadFolio: traspaso.folio,
		despues: { renglones: datos.renglones },
	});
	return {
		resultado: {
			mensaje: `${traspaso.folio}: ${aplicada.a_bodega} a bodega, ${aplicada.merma} como merma`,
			a_bodega: aplicada.a_bodega,
			merma: aplicada.merma,
		},
		entidad: { nombre: "traspasos", id: traspaso.id },
	};
});
