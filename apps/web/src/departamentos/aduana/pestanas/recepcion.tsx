/**
 * Recepción de Aduana: cuatro grupos que siempre salen (Del taller, De bodega, De proveedores y De las tiendas y de
 * clientes), cada uno con «{n} por recibir · {descripción}» o «Nada por recibir», y su tabla: Qué llega · Cuánto · Va a
 * · «Recibir», que abre su cajón. «Ver todas las órdenes por recibir», en De proveedores, agrega las que no entran en
 * la ventana de días.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Recepción»)
 */

import type { recepcionDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { DestinoConPunto, useAbrir } from "../comun.tsx";
import { useDireccionDeAduana } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Recepcion = z.infer<typeof recepcionDeAduana.resultado>;

/** Un renglón. */
type Renglon = Recepcion["grupos"][number]["renglones"][number];

/**
 * Recepción.
 * @param props Lo que regresa `inventario.aduana_recepcion`.
 */
export function RecepcionDeAduana({ datos }: { datos: Recepcion }) {
	const abrir = useAbrir();
	const { busqueda, navegar } = useDireccionDeAduana();
	return (
		<div className="flex flex-col gap-6">
			{datos.grupos.map((grupo) => (
				<Seccion
					key={grupo.clave}
					titulo={grupo.titulo}
					nota={grupo.resumen}
					derecha={
						grupo.clave === "proveedores" && busqueda.todas === undefined && datos.ordenes_fuera > 0 ? (
							<Boton chico onClick={() => navegar({ todas: "si" })}>
								Ver todas las órdenes por recibir
							</Boton>
						) : undefined
					}
				>
					{grupo.renglones.length === 0 ? null : (
						<Panel>
							<Tabla
								nombre={grupo.titulo}
								filas={grupo.renglones}
								claveDeFila={(renglon: Renglon) => renglon.clave}
								alTocarFila={(renglon) => abrir(renglon.abre)}
								columnas={[
									{
										clave: "que",
										encabezado: "Qué llega",
										celda: (renglon) => <DosRenglones arriba={renglon.titulo} abajo={renglon.detalle} />,
									},
									{ clave: "cuanto", encabezado: "Cuánto", alinear: "derecha", celda: (renglon) => renglon.cantidad },
									{
										clave: "va_a",
										encabezado: "Va a",
										celda: (renglon) => <DestinoConPunto carril={renglon.carril} nombre={renglon.destino} />,
									},
									{
										clave: "recibir",
										encabezado: "",
										alinear: "derecha",
										celda: (renglon) => (
											<Boton chico onClick={() => abrir(renglon.abre)}>
												Recibir
											</Boton>
										),
									},
								]}
							/>
						</Panel>
					)}
				</Seccion>
			))}
		</div>
	);
}
