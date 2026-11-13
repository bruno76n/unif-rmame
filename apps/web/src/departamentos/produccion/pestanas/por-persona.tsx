/**
 * La pestaña Producción por persona: la gente del Taller, de quien lleva más piezas hoy a quien lleva menos, con sus
 * operaciones, sus piezas de hoy (con su barra contra quien lleva más), las de esta semana y los lotes donde trabaja.
 * Sin tarifas ni importes, y sin botones.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Producción por persona»)
 */

import { produccionPorPersona } from "@uniformame/compartido/contratos/produccion/operaciones";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { PaginaDeProduccion } from "../pagina.tsx";

/**
 * Las iniciales de un nombre, para su avatar.
 * @param nombre El nombre.
 */
function iniciales(nombre: string): string {
	return nombre
		.split(" ")
		.slice(0, 2)
		.map((parte) => parte.charAt(0))
		.join("")
		.toLocaleUpperCase("es-MX");
}

/**
 * Unas piezas con su unidad: «1 pieza», «24 piezas».
 * @param piezas Cuántas.
 */
function piezasEnTexto(piezas: number): string {
	return `${piezas} ${piezas === 1 ? "pieza" : "piezas"}`;
}

/** La pestaña Producción por persona. */
export function PestanaPorPersona() {
	const consulta = useConsulta(produccionPorPersona, {});
	return (
		<PaginaDeProduccion activa="por-persona">
			<SegunConsulta consulta={consulta}>
				{({ personas }) => {
					if (personas.length === 0) return <EstadoDePantalla tipo="vacio" texto="Sin gente en el taller" />;
					const mayor = Math.max(...personas.map((persona) => persona.hoy));
					return (
						<section className="rounded-grande bg-panel p-4 shadow-panel">
							<Tabla
								nombre="Producción por persona"
								filas={personas}
								claveDeFila={(persona) => persona.persona_id}
								columnas={[
									{
										clave: "persona",
										encabezado: "Persona",
										celda: (persona) => (
											<span className="flex items-center gap-2.5">
												<span className="grid size-8 flex-none place-items-center rounded-full bg-riel font-bold text-etiqueta">
													{iniciales(persona.nombre)}
												</span>
												<span className="flex flex-col">
													<b>{persona.nombre}</b>
													<span className="text-etiqueta text-tinta2">{persona.puesto ?? ""}</span>
												</span>
											</span>
										),
									},
									{
										clave: "operaciones",
										encabezado: "Operaciones",
										celda: (persona) => persona.operaciones.join(", ") || "—",
									},
									{
										clave: "hoy",
										encabezado: "Hoy",
										alinear: "derecha",
										celda: (persona) => (
											<span className="flex min-w-28 flex-col items-end gap-1">
												{piezasEnTexto(persona.hoy)}
												<BarraAvance
													segmentos={[
														{ etiqueta: "Hoy", valor: persona.hoy, color: "azul" },
														{ etiqueta: "Quien lleva más", valor: Math.max(0, mayor - persona.hoy), color: "gris" },
													]}
												/>
											</span>
										),
									},
									{
										clave: "semana",
										encabezado: "Esta semana",
										alinear: "derecha",
										celda: (persona) => piezasEnTexto(persona.semana),
									},
									{
										clave: "lotes",
										encabezado: "Lotes donde trabaja",
										celda: (persona) => persona.lotes.join(", ") || "—",
									},
								]}
							/>
						</section>
					);
				}}
			</SegunConsulta>
		</PaginaDeProduccion>
	);
}
