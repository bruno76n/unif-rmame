/**
 * La ventana «Nota de crédito para {NV}»: el cliente y el total, «Qué pasó», «De cuánto» y las piezas que regresan por
 * talla (opcional). Llama a `ventas.pedir_nota_credito`; la autoriza Dirección.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Ventanas») y docs/modulos/ventas/notas-de-credito.md
 */

import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { pedirNotaCredito } from "@uniformame/compartido/contratos/ventas/notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** Un renglón de la nota que puede regresar. */
interface LineaQueRegresa {
	nota_entrega_linea_id: string;
	prenda: string;
	talla: string;
	pueden_regresar: number;
}

/**
 * La ventana para pedir una nota de crédito de una nota entregada.
 * @param props La nota, su folio, su cliente con su total, sus renglones y qué hacer al cerrar.
 */
export function VentanaNotaCredito({
	notaId,
	folio,
	subtitulo,
	lineas,
	alCerrar,
}: {
	notaId: string;
	folio: string;
	subtitulo: string;
	lineas: readonly LineaQueRegresa[];
	alCerrar: () => void;
}) {
	const { enviar, enviando } = useEnvio(pedirNotaCredito);
	const conConexion = useConConexion();
	const [quePaso, setQuePaso] = useState("");
	const [monto, setMonto] = useState("");
	const [piezas, setPiezas] = useState<Record<string, string>>({});
	const [errores, setErrores] = useState<Record<string, string>>({});
	const confirmar = async () => {
		const regresan = lineas
			.map((linea) => ({
				nota_entrega_linea_id: linea.nota_entrega_linea_id,
				cantidad: Number(piezas[linea.nota_entrega_linea_id] ?? "0"),
			}))
			.filter((linea) => linea.cantidad !== 0);
		// Lo capturado se revisa con el mismo esquema que la API.
		const revisado = pedirNotaCredito.entrada.safeParse({
			nota_id: notaId,
			que_paso: quePaso,
			monto_centavos: pesosACentavos(monto) ?? Number.NaN,
			...(regresan.length === 0 ? {} : { piezas: regresan }),
		});
		if (!revisado.success) {
			setErrores(
				Object.fromEntries(revisado.error.issues.map((problema) => [String(problema.path[0] ?? ""), problema.message])),
			);
			return;
		}
		setErrores({});
		const salio = await enviar({ datos: revisado.data }, setErrores);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo={`Nota de crédito para ${folio}`}
			subtitulo={subtitulo}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void confirmar()}>
					Mandar a Dirección
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Campo
					enVentana
					etiqueta="Qué pasó"
					value={quePaso}
					error={errores.que_paso}
					onChange={(evento) => setQuePaso(evento.target.value)}
				/>
				<Campo
					enVentana
					etiqueta="De cuánto"
					inputMode="decimal"
					placeholder="$"
					value={monto}
					error={errores.monto_centavos}
					onChange={(evento) => setMonto(evento.target.value)}
				/>
				<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
					<legend className="pb-2 font-semibold text-etiqueta text-tinta2">Piezas que regresan</legend>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
						{lineas.map((linea) => (
							<Campo
								key={linea.nota_entrega_linea_id}
								enVentana
								etiqueta={`${linea.prenda} · ${linea.talla} (hasta ${linea.pueden_regresar})`}
								inputMode="numeric"
								value={piezas[linea.nota_entrega_linea_id] ?? ""}
								onChange={(evento) => setPiezas({ ...piezas, [linea.nota_entrega_linea_id]: evento.target.value })}
							/>
						))}
					</div>
					{errores.piezas === undefined ? null : (
						<p role="alert" className="m-0 text-etiqueta text-texto-error">
							{errores.piezas}
						</p>
					)}
				</fieldset>
			</div>
		</Ventana>
	);
}
