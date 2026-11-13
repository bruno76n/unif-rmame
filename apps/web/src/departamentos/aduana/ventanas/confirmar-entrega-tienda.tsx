/**
 * La ventana «Confirmar entrega en {tienda}», de un despacho a una tienda sin caja, con la hoja firmada en la mano:
 * «Recibió» (la encargada que firmó, 3 letras o más) y «Llegó completo», o «Llegó con diferencias» con cuántas llegaron
 * de cada renglón, aunque sea 0. «Confirmar entrega» llama `inventario.entregar_a_tienda_sin_caja`.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Ventanas») y docs/modulos/inventario/surtido-y-despachos.md (regla 9)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import type { enTransito } from "@uniformame/compartido/contratos/inventario/aduana";
import { entregarATiendaSinCaja } from "@uniformame/compartido/contratos/inventario/despachos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../comun.tsx";

/** Un despacho en tránsito. */
type Despacho = z.infer<typeof enTransito.resultado>["renglones"][number];

/** El formulario: quién firmó, con el esquema del contrato. */
const formularioDeFirma = z.object({ recibio_nombre: entregarATiendaSinCaja.entrada.shape.recibio_nombre });

/**
 * La ventana para confirmar la entrega en una tienda sin caja.
 * @param props El despacho y cómo cerrar la ventana.
 */
export function VentanaConfirmarEntregaTienda({ despacho, alCerrar }: { despacho: Despacho; alCerrar: () => void }) {
	const { enviar, enviando, choco } = useEnvio(entregarATiendaSinCaja);
	const conConexion = useConConexion();
	const [conDiferencias, setConDiferencias] = useState(false);
	const [llegaron, setLlegaron] = useState<Readonly<Record<string, string>>>({});
	const formulario = useForm<z.input<typeof formularioDeFirma>>({
		resolver: zodResolver(formularioDeFirma),
		defaultValues: { recibio_nombre: "" },
	});
	const todosContados = despacho.renglones.every((renglon) => /^\d+$/.test(llegaron[renglon.traspaso_linea_id] ?? ""));
	const confirmar = formulario.handleSubmit(async ({ recibio_nombre }) => {
		const salio = await enviar(
			{
				datos: {
					despacho_id: despacho.despacho_id,
					recibio_nombre,
					modo: conDiferencias ? "con_diferencias" : "completo",
					...(conDiferencias
						? {
								renglones: despacho.renglones.map((renglon) => ({
									traspaso_linea_id: renglon.traspaso_linea_id,
									piezas: Number(llegaron[renglon.traspaso_linea_id] ?? "0"),
								})),
							}
						: {}),
				},
				version: despacho.version,
			},
			(falla) => {
				const error = falla.campos.recibio_nombre;
				if (error !== undefined) formulario.setError("recibio_nombre", { message: error });
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo={`Confirmar entrega en ${despacho.tienda ?? ""}`}
			subtitulo={`${despacho.folio} · ${despacho.cantidad}`}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || (conDiferencias && !todosContados)}
					onClick={() => void confirmar()}
				>
					Confirmar entrega
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void confirmar(evento)}>
				{choco ? <EstadoDePantalla tipo="choque" documento={despacho.folio} /> : null}
				<Campo
					enVentana
					etiqueta="Recibió"
					autoComplete="off"
					error={formulario.formState.errors.recibio_nombre?.message}
					{...formulario.register("recibio_nombre")}
				/>
				<Interruptor etiqueta="Llegó con diferencias" prendido={conDiferencias} alCambiar={setConDiferencias} />
				{conDiferencias ? (
					<div className="flex flex-col gap-2">
						<TextoConTono tono="ambar">Escribe cuántas llegaron de cada prenda, aunque sea 0</TextoConTono>
						{despacho.renglones.map((renglon) => (
							<Campo
								key={renglon.traspaso_linea_id}
								enVentana
								etiqueta={`${renglon.prenda} · salieron ${renglon.piezas}`}
								inputMode="numeric"
								value={llegaron[renglon.traspaso_linea_id] ?? ""}
								onChange={(evento) =>
									setLlegaron((antes) => ({ ...antes, [renglon.traspaso_linea_id]: evento.target.value }))
								}
							/>
						))}
					</div>
				) : null}
			</form>
		</Ventana>
	);
}
