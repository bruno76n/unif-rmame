/**
 * Reabasto de Bodega: los cuatro grupos (Traspaso, Traspaso y fabricación, Fabricación y Sugerido a producción) con su
 * color, su número y su descripción; cada renglón con su variante, su ubicación («hay {n} · mínimo {m}») y su propuesta
 * («{n} en camino» · «Mover {n} desde bodega» · «Fabricar {n}» · «{n} pedidas a producción») y sus botones: «Mover {n}»
 * y «A producción». El encabezado de Traspaso trae «Traspasar todo desde bodega · {n}».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Reabasto»)
 *
 * La cuenta llega hecha de `inventario.reabasto`; la pantalla solo la muestra y manda lo que dice.
 */

import type { gruposDeReabasto, reabastoDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { moverATienda, sugerirFabricar } from "@uniformame/compartido/contratos/inventario/reabasto";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio, VarianteEnDosRenglones } from "../comun.tsx";
import { useDireccionDeBodega } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Reabasto = z.infer<typeof reabastoDeBodega.resultado>;

/** Un renglón. */
type Renglon = Reabasto["grupos"][number]["renglones"][number];

/** El nombre, el color y la descripción de cada grupo. */
const grupos: Readonly<
	Record<
		(typeof gruposDeReabasto)[number],
		{ titulo: string; color: "verde" | "ambar" | "rojo" | "pizarra"; texto: string }
	>
> = {
	traspaso: { titulo: "Traspaso", color: "verde", texto: "existencia en bodega" },
	traspaso_y_fabricacion: { titulo: "Traspaso y fabricación", color: "ambar", texto: "existencia insuficiente" },
	fabricacion: { titulo: "Fabricación", color: "rojo", texto: "sin existencia en bodega" },
	sugerido: { titulo: "Sugerido a producción", color: "pizarra", texto: "en revisión de producción" },
};

/**
 * La propuesta de un renglón, en su orden y separada por «·».
 * @param props El renglón.
 */
function Propuesta({ renglon }: { renglon: Renglon }) {
	const partes = [
		{ clave: "camino", texto: renglon.en_camino > 0 ? `${renglon.en_camino} en camino` : null, gris: true },
		{ clave: "mover", texto: renglon.mover > 0 ? `Mover ${renglon.mover} desde bodega` : null, gris: false },
		{ clave: "fabricar", texto: renglon.fabricar > 0 ? `Fabricar ${renglon.fabricar}` : null, gris: false },
		{ clave: "pedidas", texto: renglon.pedidas > 0 ? `${renglon.pedidas} pedidas a producción` : null, gris: true },
	].filter((parte) => parte.texto !== null);
	return (
		<span className="flex flex-wrap gap-1">
			{partes.map((parte, indice) => (
				<span key={parte.clave}>
					{indice > 0 ? "· " : null}
					{parte.gris ? <TextoConTono tono="normal">{parte.texto}</TextoConTono> : parte.texto}
				</span>
			))}
		</span>
	);
}

/**
 * Reabasto de Bodega.
 * @param props Lo que regresa `inventario.reabasto`.
 */
export function ReabastoDeBodega({ datos }: { datos: Reabasto }) {
	const { abrir } = useDireccionDeBodega();
	const conConexion = useConConexion();
	const mover = useEnvio(moverATienda);
	const sugerir = useEnvio(sugerirFabricar);
	const [plegados, setPlegados] = useState<readonly string[]>([]);
	const ocupado = !conConexion || mover.enviando || sugerir.enviando;
	if (datos.grupos.length === 0) {
		return <EstadoDePantalla tipo="vacio" texto="Todas las ubicaciones están sobre su mínimo" bien />;
	}
	/** Mueve de Bodega lo que dice la cuenta de unos renglones. */
	const moverRenglones = (renglones: readonly Renglon[]) =>
		void mover.enviar({
			datos: {
				renglones: renglones.map((renglon) => ({
					variante_id: renglon.variante_id,
					ubicacion_destino_id: renglon.ubicacion_id,
					piezas: renglon.mover,
				})),
			},
		});
	return (
		<div className="flex flex-col gap-4">
			{datos.grupos.map((grupo) => {
				const { titulo, color, texto } = grupos[grupo.clave];
				const todo = grupo.renglones.reduce((suma, renglon) => suma + renglon.mover, 0);
				return (
					<GrupoPlegable
						key={grupo.clave}
						titulo={`${titulo} · ${texto}`}
						color={color}
						cuantos={String(grupo.renglones.length)}
						abierto={!plegados.includes(grupo.clave)}
						alCambiar={(abierto) =>
							setPlegados((antes) =>
								abierto ? antes.filter((clave) => clave !== grupo.clave) : [...antes, grupo.clave],
							)
						}
					>
						{grupo.clave === "traspaso" ? (
							<div className="flex justify-end">
								<Boton chico variante="principal" disabled={ocupado} onClick={() => moverRenglones(grupo.renglones)}>
									{`Traspasar todo desde bodega · ${todo}`}
								</Boton>
							</div>
						) : null}
						<Tabla
							nombre={titulo}
							filas={grupo.renglones}
							claveDeFila={(renglon) => `${renglon.variante_id}:${renglon.ubicacion_id}`}
							alTocarFila={(renglon) => abrir("variante", renglon.variante_id)}
							columnas={[
								{
									clave: "variante",
									encabezado: "Variante",
									celda: (renglon) => <VarianteEnDosRenglones variante={renglon} />,
								},
								{
									clave: "ubicacion",
									encabezado: "Ubicación",
									celda: (renglon) => (
										<span className="flex flex-col">
											<span>{renglon.ubicacion}</span>
											{renglon.en_cero ? (
												<TextoConTono tono="rojo">{`en cero · mínimo ${renglon.minimo}`}</TextoConTono>
											) : (
												<TextoConTono tono="normal">{`hay ${renglon.libres} · mínimo ${renglon.minimo}`}</TextoConTono>
											)}
										</span>
									),
								},
								{ clave: "propuesta", encabezado: "Propuesta", celda: (renglon) => <Propuesta renglon={renglon} /> },
								{
									clave: "botones",
									encabezado: "",
									alinear: "derecha",
									celda: (renglon) => (
										<span className="flex justify-end gap-2">
											{renglon.mover > 0 ? (
												<Boton chico disabled={ocupado} onClick={() => moverRenglones([renglon])}>
													{`Mover ${renglon.mover}`}
												</Boton>
											) : null}
											{renglon.fabricar > 0 ? (
												<Boton
													chico
													disabled={ocupado}
													onClick={() =>
														void sugerir.enviar({
															datos: {
																renglones: [
																	{
																		variante_id: renglon.variante_id,
																		ubicacion_id: renglon.ubicacion_id,
																		piezas: renglon.fabricar,
																	},
																],
															},
														})
													}
												>
													A producción
												</Boton>
											) : null}
										</span>
									),
								},
							]}
						/>
					</GrupoPlegable>
				);
			})}
		</div>
	);
}
