/**
 * La ventana «Regresa a {proveedor}», en tela: «{cantidad} m de {material} · {OC}», los rollos de esa orden que están en
 * Bodega con su casilla y la suma de los marcados. «Surtir a aduana» llama `inventario.surtir_a_aduana` con los rollos.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Ventanas»)
 */

import type { pendientesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { surtirAAduana } from "@uniformame/compartido/contratos/inventario/despachos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../comun.tsx";

/** Un renglón de Pendientes con su devolución. */
type Renglon = z.infer<typeof pendientesDeBodega.resultado>["renglones"][number];

/**
 * La ventana «Regresa a {proveedor}».
 * @param props La devolución y cómo cerrar la ventana.
 */
export function VentanaRegresaAProveedor({ renglon, alCerrar }: { renglon: Renglon; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(surtirAAduana);
	const [marcados, setMarcados] = useState<readonly string[]>([]);
	const { devolucion } = renglon;
	const suma = renglon.rollos
		.filter((rollo) => marcados.includes(rollo.rollo_id))
		.reduce((total, rollo) => total + Number(rollo.metros), 0);
	const mandar = async () => {
		const salio = await enviar({
			datos: { documento_tipo: "devolucion_proveedor", documento_id: renglon.documento_id, rollo_ids: [...marcados] },
		});
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Regresa a ${devolucion?.proveedor ?? ""}`}
			subtitulo={`${devolucion?.cantidad ?? ""} m de ${devolucion?.material ?? ""} · ${devolucion?.oc ?? ""}`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || marcados.length === 0}
					onClick={() => void mandar()}
				>
					Surtir a aduana
				</Boton>
			}
		>
			<div className="flex flex-col gap-2">
				{renglon.rollos.map((rollo) => (
					<Casilla
						key={rollo.rollo_id}
						etiqueta={`${rollo.folio}${rollo.partida === null ? "" : ` · partida ${rollo.partida}`} · ${rollo.metros} m`}
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
		</Ventana>
	);
}
