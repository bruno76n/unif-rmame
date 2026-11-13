/**
 * En camino a aduana: lo que ya salió de Bodega o de una tienda y Aduana no ha recibido, por páginas. Folio (y fecha)
 * · Qué viene (y su tipo · «va a {destino}») · Cuánto · Responde · Salió (su color) · «Recibir», que abre Recibir lo
 * que viene en camino. Vacío: «Nada en camino a aduana».
 * Fase 19 · docs/interfaz/fabrica/aduana.md («En camino a aduana»)
 */

import { enCaminoAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeAduana } from "../direccion.ts";

/** Un renglón. */
type Renglon = z.infer<typeof enCaminoAduana.resultado>["renglones"][number];

/** En camino a aduana. */
export function EnCaminoDeAduana() {
	const paginas = usePaginas(enCaminoAduana, {});
	const { abrir } = useDireccionDeAduana();
	return (
		<SegunConsulta consulta={paginas}>
			{({ pages }) => {
				const renglones = pages.flatMap((pagina) => pagina.renglones);
				if (renglones.length === 0) return <EstadoDePantalla tipo="vacio" texto="Nada en camino a aduana" />;
				return (
					<div className="flex flex-col gap-3">
						<Panel>
							<Tabla
								nombre="En camino a aduana"
								filas={renglones}
								claveDeFila={(renglon: Renglon) => renglon.traspaso_id}
								alTocarFila={(renglon) => abrir("camino", renglon.traspaso_id)}
								columnas={[
									{
										clave: "folio",
										encabezado: "Folio",
										celda: (renglon) => <DosRenglones arriba={<b>{renglon.folio}</b>} abajo={renglon.fecha} />,
									},
									{
										clave: "que",
										encabezado: "Qué viene",
										celda: (renglon) => <DosRenglones arriba={renglon.que} abajo={renglon.detalle} />,
									},
									{ clave: "cuanto", encabezado: "Cuánto", alinear: "derecha", celda: (renglon) => renglon.cantidad },
									{ clave: "responde", encabezado: "Responde", celda: (renglon) => renglon.responde },
									{
										clave: "salio",
										encabezado: "Salió",
										celda: (renglon) => <Estado texto={renglon.salio.texto} color={renglon.salio.color} />,
									},
									{
										clave: "recibir",
										encabezado: "",
										alinear: "derecha",
										celda: (renglon) => (
											<Boton chico onClick={() => abrir("camino", renglon.traspaso_id)}>
												Recibir
											</Boton>
										),
									},
								]}
							/>
						</Panel>
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
