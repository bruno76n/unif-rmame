/**
 * Servicios de Mantenimiento: arriba «Servicios de técnicos externos», el año (se puede cambiar), lo que suman en ese
 * año y «Registrar servicio»; abajo la tabla, del más reciente al más viejo, con «Ver más». Los renglones no abren nada.
 * Sin servicios: «Sin servicios en {año}».
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Servicios»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";

import { serviciosDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { usePaginas } from "../comun.tsx";
import { useDireccionDeMantenimiento } from "../direccion.ts";
import { VentanaServicio } from "../ventanas/servicio.tsx";

/** Una página de la consulta. */
type PaginaDeServicios = z.infer<typeof serviciosDeMantenimiento.resultado>;

/**
 * La tabla de los servicios.
 * @param props Los servicios.
 */
function TablaDeServicios({ servicios }: { servicios: PaginaDeServicios["renglones"] }) {
	return (
		<Tabla
			nombre="Servicios"
			filas={servicios}
			claveDeFila={(servicio) => servicio.servicio_id}
			columnas={[
				{
					clave: "servicio",
					encabezado: "Servicio",
					celda: (servicio) => <DosRenglones arriba={servicio.folio} abajo={textoDeDiaCorto(servicio.fecha)} />,
				},
				{
					clave: "maquina",
					encabezado: "Máquina",
					celda: (servicio) => <DosRenglones arriba={servicio.maquina} abajo={servicio.maquina_folio} />,
				},
				{ clave: "tecnico", encabezado: "Técnico", celda: (servicio) => servicio.tecnico },
				{ clave: "que", encabezado: "Qué se hizo", celda: (servicio) => servicio.que_se_hizo },
				{
					clave: "costo",
					encabezado: "Costo",
					alinear: "derecha",
					celda: (servicio) => montoEnPantalla(servicio.costo_centavos),
				},
				{
					clave: "paro",
					encabezado: "Paro",
					alinear: "derecha",
					celda: (servicio) => `${servicio.horas_paro} h`,
				},
			]}
		/>
	);
}

/**
 * Servicios de Mantenimiento.
 * @param props El año de la dirección; sin él, el actual.
 */
export function ServiciosDeMantenimiento({ anio }: { anio: number | undefined }) {
	const { navegar } = useDireccionDeMantenimiento();
	const conConexion = useConConexion();
	const [registrando, setRegistrando] = useState(false);
	const paginas = usePaginas(serviciosDeMantenimiento, anio === undefined ? {} : { anio });
	return (
		<SegunConsulta consulta={paginas}>
			{({ pages }) => {
				const [primera] = pages;
				if (primera === undefined) return null;
				const servicios = pages.flatMap((pagina) => pagina.renglones);
				const { resumen } = primera;
				return (
					<Panel
						titulo={
							<span className="flex flex-col">
								Servicios de técnicos externos
								<span className="font-semibold text-etiqueta text-tinta3">
									{`${resumen.servicios} en el año · ${montoEnPantalla(resumen.total_centavos)} · ${plural(resumen.horas_paro, "hora", "horas")} de paro`}
								</span>
							</span>
						}
						derecha={
							<>
								<Selector
									etiqueta="Año"
									value={String(primera.anio)}
									opciones={primera.anios.map((uno) => ({ valor: String(uno), texto: String(uno) }))}
									onChange={(evento) => navegar({ anio: Number(evento.target.value) })}
								/>
								<Boton chico icono={Plus} disabled={!conConexion} onClick={() => setRegistrando(true)}>
									Registrar servicio
								</Boton>
							</>
						}
					>
						{servicios.length === 0 ? (
							<EstadoDePantalla tipo="vacio" texto={`Sin servicios en ${primera.anio}`} />
						) : (
							<div className="flex flex-col gap-3">
								<TablaDeServicios servicios={servicios} />
								{paginas.hasNextPage ? (
									<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
										Ver más
									</Boton>
								) : null}
							</div>
						)}
						{registrando ? <VentanaServicio alCerrar={() => setRegistrando(false)} /> : null}
					</Panel>
				);
			}}
		</SegunConsulta>
	);
}
