/**
 * La pestaña Desarrollo de producto: «De la solicitud al producto en catálogo» con «{n} diseños en proceso» y «Nueva
 * solicitud»; el tablero de cinco columnas con su color y su conteo, cada tarjeta abre el cajón del desarrollo
 * (`?cajon=desarrollo&id=`) y la recién registrada sale marcada un momento (`?marcado=`); y «Descartados» abajo.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Desarrollo de producto»)
 */

import { tableroDeDesarrollos } from "@uniformame/compartido/contratos/patronaje/tablero-de-desarrollos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccion } from "../direccion.ts";
import { PaginaDePatronaje } from "../pagina.tsx";
import { VentanaNuevaSolicitud } from "../ventanas/nueva-solicitud.tsx";

/** Lo que regresa `patronaje.desarrollos`. */
type Tablero = z.infer<typeof tableroDeDesarrollos.resultado>;

/** Cuánto dura marcada la tarjeta recién registrada. */
const marcadaPorMs = 4000;

/** El punto de color de cada columna. */
const puntos: Readonly<Record<string, string>> = {
	gris: "bg-estado-gris",
	azul: "bg-estado-azul",
	morado: "bg-estado-morado",
	ambar: "bg-estado-ambar",
	verde: "bg-estado-verde",
};

/** La pestaña Desarrollo de producto. */
export function PestanaDesarrollo() {
	const consulta = useConsulta(tableroDeDesarrollos, {});
	const [nueva, setNueva] = useState(false);
	return (
		<PaginaDePatronaje activa="desarrollo">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h2 className="m-0 font-bold text-subtitulo">De la solicitud al producto en catálogo</h2>
					{consulta.data === undefined ? null : (
						<p className="m-0 text-tinta2">
							{consulta.data.en_proceso} {consulta.data.en_proceso === 1 ? "diseño" : "diseños"} en proceso
						</p>
					)}
				</div>
				<Boton icono={Plus} chico onClick={() => setNueva(true)}>
					Nueva solicitud
				</Boton>
			</header>
			<SegunConsulta consulta={consulta}>
				{(tablero) => (
					<>
						<TableroDeDesarrollos tablero={tablero} />
						<VentanaNuevaSolicitud abierta={nueva} opciones={tablero.opciones} alCerrar={() => setNueva(false)} />
					</>
				)}
			</SegunConsulta>
		</PaginaDePatronaje>
	);
}

/**
 * Las cinco columnas y los descartados.
 * @param props El tablero.
 */
function TableroDeDesarrollos({ tablero }: { tablero: Tablero }) {
	const { leer, ir } = useDireccion();
	const marcado = leer("marcado");
	// La tarjeta recién registrada se marca un momento y luego se quita de la dirección.
	useEffect(() => {
		if (marcado === undefined) return;
		document.querySelector(`[data-desarrollo="${marcado}"]`)?.scrollIntoView({ block: "center" });
		const quitar = window.setTimeout(() => ir({ marcado: undefined }), marcadaPorMs);
		return () => window.clearTimeout(quitar);
	}, [marcado, ir]);
	return (
		<>
			<div className="grid grid-cols-5 gap-3 overflow-x-auto max-menu:grid-cols-[repeat(5,minmax(220px,1fr))]">
				{tablero.columnas.map((columna) => (
					<section
						key={columna.etapa}
						aria-label={columna.nombre}
						className="flex flex-col gap-2 rounded-grande bg-riel p-3"
					>
						<header className="flex items-center gap-2">
							<span aria-hidden="true" className={`size-2.5 rounded-full ${puntos[columna.color] ?? ""}`} />
							<h3 className="m-0 font-bold">{columna.nombre}</h3>
							<span className="ml-auto text-tinta2 tabular-nums">{columna.tarjetas.length}</span>
						</header>
						{columna.tarjetas.length === 0 ? (
							<p className="m-0 py-4 text-center text-etiqueta text-tinta3">Nada en esta etapa</p>
						) : (
							columna.tarjetas.map((tarjeta) => (
								<button
									key={tarjeta.desarrollo_id}
									type="button"
									data-desarrollo={tarjeta.desarrollo_id}
									onClick={() => ir({ cajon: "desarrollo", id: tarjeta.desarrollo_id })}
									className={`flex flex-col gap-1 rounded-mediano bg-panel p-3 text-left shadow-panel hover:bg-suave ${
										marcado === tarjeta.desarrollo_id ? "ring-2 ring-marca" : ""
									}`}
								>
									<span className="flex justify-between gap-2 text-etiqueta text-tinta3">
										<b className="tabular-nums">{tarjeta.folio}</b>
										<span>{tarjeta.desde}</span>
									</span>
									<b className="text-tinta">{tarjeta.prenda}</b>
									<span className="flex items-center gap-1.5 text-etiqueta text-tinta2">
										<span
											aria-hidden="true"
											className="size-2.5 rounded-full border border-linea2"
											style={tarjeta.para.color === null ? undefined : { backgroundColor: tarjeta.para.color }}
										/>
										{tarjeta.para.nombre}
									</span>
									{tarjeta.muestra === null ? null : (
										<span className="text-etiqueta text-tinta2">{tarjeta.muestra}</span>
									)}
								</button>
							))
						)}
					</section>
				))}
			</div>
			{tablero.descartados.length === 0 ? null : (
				<section className="flex flex-col gap-3">
					<h2 className="m-0 font-bold text-titulo-seccion">Descartados</h2>
					<div className="rounded-grande bg-panel p-4 shadow-panel">
						<Tabla
							nombre="Descartados"
							filas={tablero.descartados}
							claveDeFila={(descartado) => descartado.folio}
							columnas={[
								{
									clave: "diseno",
									encabezado: "Diseño",
									celda: (descartado) => <DosRenglones arriba={descartado.prenda} abajo={descartado.folio} />,
								},
								{ clave: "para", encabezado: "Para", celda: (descartado) => descartado.para },
								{
									clave: "desde",
									encabezado: "Desde, con quién",
									celda: (descartado) => <DosRenglones arriba={descartado.desde} abajo={descartado.por} />,
								},
								{ clave: "motivo", encabezado: "Motivo", celda: (descartado) => descartado.motivo },
							]}
						/>
					</div>
				</section>
			)}
		</>
	);
}
