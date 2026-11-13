/**
 * El historial de Aduana: todo lo que entró y salió, lo más reciente primero, por páginas, sin filtros ni botones:
 * Fecha · Movimiento («Entró» verde, «Salió» ámbar) · Referencia · Qué.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Historial»)
 */

import { historialDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";

/** Un renglón. */
type Renglon = z.infer<typeof historialDeAduana.resultado>["renglones"][number];

/** El historial. */
export function HistorialDeAduana() {
	const paginas = usePaginas(historialDeAduana, {});
	return (
		<SegunConsulta consulta={paginas}>
			{({ pages }) => {
				const renglones = pages.flatMap((pagina) => pagina.renglones);
				if (renglones.length === 0) return <EstadoDePantalla tipo="vacio" texto="Nada entró ni salió de aduana" />;
				return (
					<div className="flex flex-col gap-3">
						<Tabla
							nombre="Historial de aduana"
							filas={renglones}
							claveDeFila={(renglon: Renglon) => renglon.clave}
							columnas={[
								{ clave: "fecha", encabezado: "Fecha", celda: (renglon) => renglon.fecha },
								{
									clave: "movimiento",
									encabezado: "Movimiento",
									celda: (renglon) => <Estado texto={renglon.movimiento.texto} color={renglon.movimiento.color} />,
								},
								{ clave: "referencia", encabezado: "Referencia", celda: (renglon) => <b>{renglon.referencia}</b> },
								{ clave: "que", encabezado: "Qué", celda: (renglon) => renglon.que },
							]}
						/>
						{paginas.hasNextPage ? (
							<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
					</div>
				);
			}}
		</SegunConsulta>
	);
}
