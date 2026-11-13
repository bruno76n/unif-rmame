/**
 * El historial de un documento dentro de un cajón, lo más nuevo arriba: de `admin.historial_entidad`, con el recorte de
 * quien lo ve.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 3)
 */

import { historialEntidad } from "@uniformame/compartido/contratos/admin/armazon";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { useConsulta } from "../../../comun/api.tsx";

/** Cómo se escribe el día de un renglón: «10 oct», en hora de México. */
const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });

/**
 * El historial de un documento.
 * @param props Su tabla y su id.
 */
export function Historial({ entidad, entidadId }: { entidad: string; entidadId: string }) {
	const consulta = useConsulta(historialEntidad, { entidad, entidad_id: entidadId });
	const renglones = consulta.data?.renglones ?? [];
	return (
		<section className="flex flex-col gap-2">
			<TituloDeBloque titulo="Historial" />
			{renglones.length === 0 ? (
				<p className="m-0 text-tinta3">{consulta.isLoading ? "Cargando" : "Sin movimientos todavía"}</p>
			) : (
				<ol className="m-0 flex list-none flex-col gap-2 p-0">
					{renglones.map((renglon) => (
						<li key={`${renglon.ocurrido_en}-${renglon.descripcion}`} className="flex justify-between gap-4">
							<span>
								<b className="font-semibold">{renglon.departamento ?? renglon.quien}</b> {renglon.descripcion}
							</span>
							<span className="flex-none text-etiqueta text-tinta3">
								{dia.format(new Date(renglon.ocurrido_en)).replace(".", "")}
							</span>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
