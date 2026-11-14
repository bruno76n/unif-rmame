/**
 * Despacho de Aduana: un grupo por destino (las tiendas, «Clientes externos» y «Bodega»), solo los que tienen algo,
 * con «{n} por despachar · {m} piezas». Qué sale · Cuánto · Aquí desde · «Despachar» o «Sin nota», que abren el cajón
 * Despachar. Vacío: «Nada por despachar.» La pestaña lee `inventario.aduana_despacho`.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho»)
 */

import { despachoDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { type PartidaEnAduana, useAbrir } from "../comun.tsx";
import { BotonDePartida, QueEs } from "./partidas.tsx";

/** Lo que regresa la consulta. */
type Despacho = z.infer<typeof despachoDeAduana.resultado>;

/** La pestaña Despacho: lee `inventario.aduana_despacho` y pinta sus estados. */
export function DespachoDeAduana() {
	const consulta = useConsulta(despachoDeAduana, {});
	return <SegunConsulta consulta={consulta}>{(datos) => <Contenido datos={datos} />}</SegunConsulta>;
}

/**
 * Lo que pinta Despacho con los datos.
 * @param props Lo que regresa `inventario.aduana_despacho`.
 */
function Contenido({ datos }: { datos: Despacho }) {
	const abrir = useAbrir();
	if (datos.grupos.length === 0) return <EstadoDePantalla tipo="vacio" texto="Nada por despachar." />;
	return (
		<div className="flex flex-col gap-6">
			{datos.grupos.map((grupo) => (
				<Seccion key={grupo.carril} titulo={grupo.nombre} nota={grupo.resumen}>
					<Panel>
						<Tabla
							nombre={grupo.nombre}
							filas={grupo.renglones}
							claveDeFila={(partida: PartidaEnAduana) => partida.traspaso_id}
							alTocarFila={(partida) => abrir({ a: "despachar", id: partida.traspaso_id })}
							columnas={[
								{ clave: "que", encabezado: "Qué sale", celda: (partida) => <QueEs partida={partida} /> },
								{ clave: "cuanto", encabezado: "Cuánto", alinear: "derecha", celda: (partida) => partida.cantidad },
								{
									clave: "desde",
									encabezado: "Aquí desde",
									celda: (partida) => <Estado texto={partida.antiguedad.texto} color={partida.antiguedad.color} />,
								},
								{
									clave: "boton",
									encabezado: "",
									alinear: "derecha",
									celda: (partida) => <BotonDePartida partida={partida} />,
								},
							]}
						/>
					</Panel>
				</Seccion>
			))}
		</div>
	);
}
