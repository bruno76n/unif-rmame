/**
 * La ventana «Pasar a bodega» (pantalla nueva: la muestra no la tiene): lo listo en aduana del pedido por talla, cuánto
 * pasa de cada una y el motivo. Llama a `ventas.pasar_a_bodega` con la versión del pedido.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Ventanas», «Lo que no se copia de la muestra») y
 * docs/modulos/ventas/notas-de-entrega.md (regla 7)
 */

import { pasarABodega } from "@uniformame/compartido/contratos/ventas/notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** Lo listo de una talla. */
interface ListoDeTalla {
	variante_id: string;
	prenda: string;
	talla: string;
	listas: number;
}

/**
 * La ventana para pasar a bodega lo listo que el cliente ya no quiere.
 * @param props El pedido, su folio y su versión, lo listo por talla y qué hacer al cerrar.
 */
export function VentanaPasarABodega({
	pedidoId,
	folio,
	version,
	listo,
	alCerrar,
}: {
	pedidoId: string;
	folio: string;
	version: number;
	listo: readonly ListoDeTalla[];
	alCerrar: () => void;
}) {
	const { enviar, enviando, choco } = useEnvio(pasarABodega);
	const conConexion = useConConexion();
	const [piezas, setPiezas] = useState<Record<string, string>>({});
	const [motivo, setMotivo] = useState("");
	const [errores, setErrores] = useState<Record<string, string>>({});
	const renglones = listo
		.map((talla) => ({ variante_id: talla.variante_id, piezas: Number(piezas[talla.variante_id] ?? "0") }))
		.filter((renglon) => renglon.piezas !== 0);
	const confirmar = async () => {
		// Lo capturado se revisa con el mismo esquema que la API.
		const revisado = pasarABodega.entrada.safeParse({ pedido_id: pedidoId, renglones, motivo });
		if (!revisado.success) {
			setErrores(
				Object.fromEntries(revisado.error.issues.map((problema) => [String(problema.path[0] ?? ""), problema.message])),
			);
			return;
		}
		setErrores({});
		const salio = await enviar({ datos: revisado.data, version }, setErrores);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo="Pasar a bodega"
			subtitulo={`Lo listo en aduana de ${folio} que el cliente ya no quiere`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || renglones.length === 0 || motivo.trim() === ""}
					onClick={() => void confirmar()}
				>
					Pasar a bodega
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				{choco ? <EstadoDePantalla tipo="choque" documento={folio} /> : null}
				<div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
					{listo.map((talla) => (
						<Campo
							key={talla.variante_id}
							enVentana
							etiqueta={`${talla.prenda} · ${talla.talla} (de ${talla.listas})`}
							inputMode="numeric"
							value={piezas[talla.variante_id] ?? ""}
							onChange={(evento) => setPiezas({ ...piezas, [talla.variante_id]: evento.target.value })}
						/>
					))}
				</div>
				{errores.renglones === undefined ? null : (
					<p role="alert" className="m-0 text-etiqueta text-texto-error">
						{errores.renglones}
					</p>
				)}
				<Campo
					enVentana
					etiqueta="Motivo"
					value={motivo}
					error={errores.motivo}
					onChange={(evento) => setMotivo(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
