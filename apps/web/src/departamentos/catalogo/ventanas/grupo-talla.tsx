/**
 * La ventana de un grupo de tallas: su nombre, sus tallas en orden (subir, bajar, quitar y «Agregar talla») y «Guardar»
 * → `catalogo.guardar_grupo_talla`, que recibe el grupo completo. Una talla que ya usan productos no se renombra ni se
 * quita: lo dice el servidor con su error.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Escuelas y tallas») y docs/modulos/catalogo/tallas-y-tipos-de-prenda.md
 */

import { guardarGrupoTalla } from "@uniformame/compartido/contratos/catalogo/tallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { errorDeCampo, esperar, type Salida, useAccionDeCatalogo } from "../acciones.ts";

/** Un grupo que se edita. */
export interface GrupoQueSeEdita {
	id: string;
	version: number;
	nombre: string;
	tallas: readonly { id: string; nombre: string }[];
}

/** Una talla en la ventana: la que ya existe lleva su id. */
interface TallaEnEdicion {
	clave: string;
	talla_id?: string;
	nombre: string;
}

/**
 * La ventana de un grupo de tallas: nuevo si no trae grupo.
 * @param props El grupo (o ninguno), si está abierta y qué hacer al cerrar.
 */
export function VentanaGrupoTalla({
	grupo,
	abierta,
	alCerrar,
}: {
	grupo?: GrupoQueSeEdita | undefined;
	abierta: boolean;
	alCerrar: () => void;
}) {
	const [nombre, setNombre] = useState(grupo?.nombre ?? "");
	const [tallas, setTallas] = useState<TallaEnEdicion[]>(
		(grupo?.tallas ?? []).map((talla) => ({ clave: talla.id, talla_id: talla.id, nombre: talla.nombre })),
	);
	const [salida, setSalida] = useState<Salida<unknown>>();
	const accion = useAccionDeCatalogo(guardarGrupoTalla);
	const conConexion = useConConexion();
	const mover = (desde: number, hacia: number) =>
		setTallas((antes) => {
			const nuevas = [...antes];
			const [movida] = nuevas.splice(desde, 1);
			if (movida !== undefined) nuevas.splice(hacia, 0, movida);
			return nuevas;
		});
	const guardar = async () => {
		const resultado = await esperar(
			accion.mutateAsync({
				datos: {
					...(grupo === undefined ? {} : { grupo_talla_id: grupo.id, version: grupo.version }),
					nombre,
					tallas: tallas.map((talla, orden) => ({
						...(talla.talla_id === undefined ? {} : { talla_id: talla.talla_id }),
						nombre: talla.nombre,
						orden,
					})),
				},
			}),
		);
		setSalida(resultado);
		if (resultado.bien) alCerrar();
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo={grupo === undefined ? "Agregar grupo" : grupo.nombre}
			accion={
				<Boton disabled={accion.isPending || !conConexion} onClick={() => void guardar()}>
					Guardar
				</Boton>
			}
		>
			<div className="flex flex-col gap-3">
				<Campo
					etiqueta="Nombre del grupo"
					enVentana
					value={nombre}
					error={errorDeCampo(salida, "nombre")}
					onChange={(evento) => setNombre(evento.target.value)}
				/>
				<ol className="m-0 flex list-none flex-col gap-2 p-0">
					{tallas.map((talla, lugar) => (
						<li key={talla.clave} className="flex items-end gap-2">
							<div className="flex-1">
								<Campo
									etiqueta={`Talla ${lugar + 1}`}
									enVentana
									value={talla.nombre}
									onChange={(evento) =>
										setTallas((antes) =>
											antes.map((una) => (una.clave === talla.clave ? { ...una, nombre: evento.target.value } : una)),
										)
									}
								/>
							</div>
							<Boton
								chico
								variante="fantasma"
								icono={ArrowUp}
								aria-label="Subir"
								disabled={lugar === 0}
								onClick={() => mover(lugar, lugar - 1)}
							/>
							<Boton
								chico
								variante="fantasma"
								icono={ArrowDown}
								aria-label="Bajar"
								disabled={lugar === tallas.length - 1}
								onClick={() => mover(lugar, lugar + 1)}
							/>
							<Boton
								chico
								variante="fantasma"
								icono={X}
								aria-label="Quitar"
								onClick={() => setTallas((antes) => antes.filter((una) => una.clave !== talla.clave))}
							/>
						</li>
					))}
				</ol>
				{errorDeCampo(salida, "tallas") === undefined ? null : (
					<p className="m-0 text-texto-error">{errorDeCampo(salida, "tallas")}</p>
				)}
				<div>
					<Boton
						chico
						variante="secundario"
						icono={Plus}
						onClick={() => setTallas((antes) => [...antes, { clave: crypto.randomUUID(), nombre: "" }])}
					>
						Agregar talla
					</Boton>
				</div>
			</div>
		</Ventana>
	);
}
