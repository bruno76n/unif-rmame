/**
 * El historial de un documento dentro de su cajón, lo más nuevo arriba: de `admin.historial_entidad`, con el recorte de
 * quien lo ve. Cada renglón dice quién (su departamento, o la persona) y qué hizo, y el día a la derecha.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 3)
 */

import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { historialEntidad } from "@uniformame/compartido/contratos/admin/armazon";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { useConsulta } from "./api.tsx";
import { SegunConsulta } from "./segun-consulta.tsx";

/**
 * El historial de un documento, con su título.
 * @param props Su tabla (`pedidos`, `ordenes_compra`…) y su id.
 */
export function Historial({ entidad, entidadId }: { entidad: string; entidadId: string }) {
	const consulta = useConsulta(historialEntidad, { entidad, entidad_id: entidadId });
	return (
		<section className="flex flex-col gap-2">
			<TituloDeBloque titulo="Historial" />
			<SegunConsulta consulta={consulta} renglones={2}>
				{({ renglones }) =>
					renglones.length === 0 ? (
						<p className="m-0 text-tinta3">Sin movimientos todavía</p>
					) : (
						<ol className="m-0 flex list-none flex-col gap-2 p-0">
							{renglones.map((renglon) => (
								<li key={`${renglon.ocurrido_en}-${renglon.descripcion}`} className="flex justify-between gap-4">
									<span>
										<b className="font-semibold">{renglon.departamento ?? renglon.quien}</b> {renglon.descripcion}
									</span>
									<span className="flex-none text-etiqueta text-tinta3 tabular-nums">
										{textoDeMomentoCorto(renglon.ocurrido_en)}
									</span>
								</li>
							))}
						</ol>
					)
				}
			</SegunConsulta>
		</section>
	);
}
