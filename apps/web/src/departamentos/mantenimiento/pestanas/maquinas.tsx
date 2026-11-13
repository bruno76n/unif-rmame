/**
 * Máquinas de Mantenimiento: arriba «{n} máquinas» y «Nueva máquina»; un grupo plegable por área con sus máquinas
 * (nombre y folio, tipo y marca, serie, quién la trae, último servicio y estado), cada renglón abre el cajón Máquina; y
 * abajo «Dadas de baja», solo para leer.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Máquinas»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";

import type { maquinasDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useDireccionDeMantenimiento } from "../direccion.ts";
import { VentanaMaquinaNueva } from "../ventanas/maquina-nueva.tsx";

/** Lo que regresa la consulta. */
type Maquinas = z.infer<typeof maquinasDeMantenimiento.resultado>;

/** Una máquina de un área. */
type MaquinaDeArea = Maquinas["areas"][number]["maquinas"][number];

/**
 * Las máquinas de un área.
 * @param props Sus máquinas y qué hacer al tocar una.
 */
function TablaDeMaquinas({ maquinas, alTocar }: { maquinas: readonly MaquinaDeArea[]; alTocar: (id: string) => void }) {
	return (
		<Tabla
			nombre="Máquinas"
			filas={maquinas}
			claveDeFila={(maquina) => maquina.maquina_id}
			alTocarFila={(maquina) => alTocar(maquina.maquina_id)}
			columnas={[
				{
					clave: "maquina",
					encabezado: "Máquina",
					celda: (maquina) => <DosRenglones arriba={maquina.nombre} abajo={maquina.folio} />,
				},
				{
					clave: "tipo",
					encabezado: "Tipo y marca",
					celda: (maquina) => <DosRenglones arriba={maquina.tipo} abajo={maquina.marca_modelo} />,
				},
				{ clave: "serie", encabezado: "Serie", celda: (maquina) => maquina.serie ?? "—" },
				{ clave: "la_trae", encabezado: "La trae", celda: (maquina) => maquina.la_trae ?? "—" },
				{
					clave: "servicio",
					encabezado: "Último servicio",
					celda: (maquina) =>
						maquina.ultimo_servicio === null ? (
							"—"
						) : (
							<DosRenglones
								arriba={textoDeDiaCorto(maquina.ultimo_servicio.fecha)}
								abajo={maquina.ultimo_servicio.que_se_hizo}
							/>
						),
				},
				{
					clave: "estado",
					encabezado: "Estado",
					celda: (maquina) => <Estado texto={maquina.estado.texto} color={maquina.estado.color} />,
				},
			]}
		/>
	);
}

/**
 * Máquinas de Mantenimiento.
 * @param props Lo que regresa `mantenimiento.maquinas`.
 */
export function MaquinasDeMantenimiento({ datos }: { datos: Maquinas }) {
	const { abrir } = useDireccionDeMantenimiento();
	const conConexion = useConConexion();
	const [plegadas, setPlegadas] = useState<ReadonlySet<string>>(new Set());
	const [nueva, setNueva] = useState(false);
	return (
		<div className="flex flex-col gap-5">
			<Seccion
				titulo={plural(datos.activas, "máquina", "máquinas")}
				derecha={
					<Boton chico icono={Plus} disabled={!conConexion} onClick={() => setNueva(true)}>
						Nueva máquina
					</Boton>
				}
			>
				{datos.areas.map((area) => (
					<GrupoPlegable
						key={area.area_id}
						titulo={area.nombre}
						color="azul"
						cuantos={plural(area.maquinas.length, "máquina", "máquinas")}
						abierto={!plegadas.has(area.area_id)}
						alCambiar={(abierto) =>
							setPlegadas((antes) => {
								const despues = new Set(antes);
								if (abierto) despues.delete(area.area_id);
								else despues.add(area.area_id);
								return despues;
							})
						}
					>
						<Panel>
							<TablaDeMaquinas maquinas={area.maquinas} alTocar={(id) => abrir("maquina", id)} />
						</Panel>
					</GrupoPlegable>
				))}
			</Seccion>
			{datos.bajas.length === 0 ? null : (
				<Seccion titulo="Dadas de baja">
					<Panel>
						<Tabla
							nombre="Dadas de baja"
							filas={datos.bajas}
							claveDeFila={(baja) => baja.maquina_id}
							columnas={[
								{
									clave: "maquina",
									encabezado: "Máquina",
									celda: (baja) => <DosRenglones arriba={baja.nombre} abajo={baja.folio} />,
								},
								{ clave: "desde", encabezado: "Desde", celda: (baja) => textoDeDiaCorto(baja.desde) },
								{ clave: "motivo", encabezado: "Motivo", celda: (baja) => baja.motivo },
							]}
						/>
					</Panel>
				</Seccion>
			)}
			{nueva ? <VentanaMaquinaNueva alCerrar={() => setNueva(false)} /> : null}
		</div>
	);
}
