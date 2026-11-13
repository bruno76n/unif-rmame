/**
 * La pestaña Defectos: «Últimos {d} días» con las piezas revisadas y rechazadas, una etiqueta por defecto con su
 * conteo, «Por operación» y «Por persona» (Rechazadas · Tasa con su barra contra la más alta · Más común) y el
 * «Catálogo de defectos» con «Agregar defecto».
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Defectos»)
 *
 * La tasa, su color y el largo de su barra llegan de `calidad.defectos`: la pantalla no los calcula.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { defectosDeCalidad, type tasaDeDefectos } from "@uniformame/compartido/contratos/calidad/defectos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { PaginaDeCalidad } from "../pagina.tsx";
import { VentanaDefectoNuevo } from "../ventanas/defecto-nuevo.tsx";

/** Las cifras con su separador de miles. */
const enteros = new Intl.NumberFormat("es-MX");

/** Un renglón de una tabla de tasa. */
type Tasa = z.infer<typeof tasaDeDefectos>;

/** La pestaña Defectos. */
export function PestanaDefectos() {
	const consulta = useConsulta(defectosDeCalidad, {});
	const [nuevo, setNuevo] = useState(false);
	return (
		<PaginaDeCalidad activa="defectos">
			<SegunConsulta consulta={consulta}>
				{(datos) => (
					<>
						<header className="rounded-grande bg-panel p-5 shadow-panel">
							<DosRenglones
								arriba={`Últimos ${datos.dias} días`}
								abajo={
									datos.lotes === 0
										? `Sin revisiones en los últimos ${datos.dias} días`
										: `${plural(datos.revisadas, "pieza revisada", "piezas revisadas")} en ${plural(datos.lotes, "lote", "lotes")} · ${plural(datos.rechazadas, "rechazada", "rechazadas")} (${datos.porcentaje.toFixed(1)}%)`
								}
							/>
						</header>
						{datos.del_periodo.length === 0 ? null : (
							<ul aria-label="Los defectos del periodo" className="m-0 flex list-none flex-wrap gap-2 p-0">
								{datos.del_periodo.map((defecto) => (
									<li key={defecto.nombre} className="rounded-full bg-panel px-3 py-1 shadow-panel">
										<b className="text-texto-error tabular-nums">{enteros.format(defecto.piezas)}</b> {defecto.nombre}
									</li>
								))}
							</ul>
						)}
						<div className="grid grid-cols-2 gap-5 max-menu:grid-cols-1">
							<Seccion titulo="Por operación" nota="Rechazadas entre piezas revisadas" enPanel>
								<TablaDeTasa nombre="Operación" filas={datos.por_operacion} />
							</Seccion>
							<Seccion titulo="Por persona" nota="Para saber a quién apoyar" enPanel>
								<TablaDeTasa nombre="Persona" filas={datos.por_persona} />
							</Seccion>
						</div>
						<Seccion
							enPanel
							titulo="Catálogo de defectos"
							derecha={
								<Boton chico icono={Plus} onClick={() => setNuevo(true)}>
									Agregar defecto
								</Boton>
							}
						>
							<Tabla
								nombre="Catálogo de defectos"
								filas={datos.catalogo}
								claveDeFila={(defecto) => defecto.defecto_id}
								columnas={[
									{ clave: "defecto", encabezado: "Defecto", celda: (defecto) => defecto.nombre },
									{
										clave: "operaciones",
										encabezado: "Operaciones donde pasa",
										celda: (defecto) => defecto.operaciones.join(", "),
									},
								]}
							/>
						</Seccion>
						<VentanaDefectoNuevo abierta={nuevo} alCerrar={() => setNuevo(false)} operaciones={datos.operaciones} />
					</>
				)}
			</SegunConsulta>
		</PaginaDeCalidad>
	);
}

/**
 * Una tabla de tasa: Operación o Persona · Rechazadas · Tasa · Más común.
 * @param props El nombre de la primera columna y sus renglones.
 */
function TablaDeTasa({ nombre, filas }: { nombre: string; filas: readonly Tasa[] }) {
	if (filas.length === 0) return <EstadoDePantalla tipo="vacio" texto="Sin rechazos" />;
	return (
		<Tabla
			nombre={`Por ${nombre.toLocaleLowerCase("es-MX")}`}
			filas={filas}
			claveDeFila={(fila) => fila.nombre}
			columnas={[
				{ clave: "nombre", encabezado: nombre, celda: (fila) => <b>{fila.nombre}</b> },
				{ clave: "rechazadas", encabezado: "Rechazadas", alinear: "derecha", celda: (fila) => fila.rechazadas },
				{
					clave: "tasa",
					encabezado: "Tasa",
					celda: (fila) => (
						<span className="flex items-center gap-3">
							<b className="w-12 tabular-nums">{fila.tasa.toFixed(1)}%</b>
							<span className="w-24">
								<BarraAvance
									segmentos={[
										{ etiqueta: "Tasa", valor: fila.contra_la_mas_alta, color: fila.roja ? "rojo" : "ambar" },
										{ etiqueta: "Hasta la más alta", valor: 1 - fila.contra_la_mas_alta, color: "gris" },
									]}
								/>
							</span>
						</span>
					),
				},
				{ clave: "comun", encabezado: "Más común", celda: (fila) => fila.mas_comun },
			]}
		/>
	);
}
