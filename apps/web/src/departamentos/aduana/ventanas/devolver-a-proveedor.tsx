/**
 * La ventana «Devolver a {proveedor}», desde el renglón «Regresa a {proveedor}» de Inventario en aduana: «{cantidad}
 * {unidad} de {material} de {OC}». Si es tela, los rollos de esa orden que están en aduana, con una casilla cada uno,
 * y la suma de lo escogido; si no, la cantidad, que tiene que ser lo que regresa. «Devolver al proveedor» llama
 * `inventario.devolver_a_proveedor`; el aviso de abajo dice lo que regresa, y si los rollos no suman lo de más.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Ventanas»)
 */

import { devolverAProveedor } from "@uniformame/compartido/contratos/inventario/recepciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { type PartidaEnAduana, useEnvio } from "../comun.tsx";

/**
 * La ventana «Devolver a {proveedor}».
 * @param props Lo que regresa, del renglón de Inventario en aduana, y cómo cerrar la ventana.
 */
export function VentanaDevolverAProveedor({ partida, alCerrar }: { partida: PartidaEnAduana; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(devolverAProveedor);
	const [marcados, setMarcados] = useState<readonly string[]>([]);
	const [cantidad, setCantidad] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	const { devolucion } = partida;
	if (devolucion === null) return null;
	const suma = devolucion.rollos
		.filter((rollo) => marcados.includes(rollo.rollo_id))
		.reduce((total, rollo) => total + Number(rollo.metros), 0);
	const listo = devolucion.es_tela ? marcados.length > 0 : cantidad.trim() !== "";
	/** Devuelve los rollos escogidos, o la cantidad. */
	const devolver = async () => {
		const salio = await enviar(
			{
				datos: {
					traspaso_id: partida.traspaso_id,
					...(devolucion.es_tela ? { rollo_ids: [...marcados] } : { cantidad: cantidad.trim() }),
				},
				version: partida.version,
			},
			(falla) => setError(falla.campos.cantidad ?? falla.campos.rollo_ids),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Devolver a ${devolucion.proveedor}`}
			subtitulo={`${devolucion.cantidad} ${devolucion.unidad} de ${devolucion.material} de ${devolucion.orden}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando || !listo} onClick={() => void devolver()}>
					Devolver al proveedor
				</Boton>
			}
		>
			{choco ? <EstadoDePantalla tipo="choque" documento={partida.folio} /> : null}
			{devolucion.es_tela ? (
				<div className="flex flex-col gap-2">
					{devolucion.rollos.map((rollo) => (
						<Casilla
							key={rollo.rollo_id}
							etiqueta={`${rollo.folio} · ${rollo.metros} m`}
							marcada={marcados.includes(rollo.rollo_id)}
							alCambiar={(marcada) =>
								setMarcados((antes) =>
									marcada ? [...antes, rollo.rollo_id] : antes.filter((suyo) => suyo !== rollo.rollo_id),
								)
							}
						/>
					))}
					<b className="font-bold tabular-nums">{`${Number(suma.toFixed(3))} m`}</b>
				</div>
			) : (
				<Campo
					etiqueta={`Cantidad, en ${devolucion.unidad}`}
					enVentana
					inputMode="decimal"
					value={cantidad}
					error={error}
					onChange={(evento) => setCantidad(evento.target.value)}
				/>
			)}
		</Ventana>
	);
}
