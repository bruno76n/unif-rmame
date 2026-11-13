/**
 * `calidad.devolucion`: la ventana «Revisar devolución {folio}». Lo que regresó de un cliente con defecto y espera a
 * Calidad en aduana: por renglón, la prenda y la talla, el lote, lo que queda por decidir, y el defecto y la nota con
 * que llegó; con su versión, para «Guardar decisión», y el catálogo de defectos. Sin precios.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Revisar devolución {folio}»)
 */

import { devolucionDeCalidad } from "@uniformame/compartido/contratos/calidad/devolucion";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { defectosVigentes, devolucionesPorRevisar } from "./comun.ts";

export const consultaDevolucion = implementarConsulta(devolucionDeCalidad, async (contexto, parametros) => {
	// Solo una devolución que sigue esperando a Calidad: decidida toda, ya no se revisa.
	const [devolucion] = await devolucionesPorRevisar(contexto, parametros.traspaso_id);
	if (devolucion === undefined) throw noExiste();
	return {
		resultado: {
			traspaso_id: devolucion.id,
			version: devolucion.version,
			folio: devolucion.folio,
			cliente: devolucion.cliente,
			renglones: devolucion.renglones.map((renglon) => ({
				traspaso_linea_id: renglon.traspaso_linea_id,
				prenda: `${renglon.prenda} · talla ${renglon.talla}`,
				lote: renglon.lote,
				por_decidir: renglon.por_decidir,
				defecto_id: renglon.defecto_id,
				defecto: renglon.defecto,
				nota: renglon.nota,
			})),
			defectos: await defectosVigentes(contexto),
		},
	};
});
