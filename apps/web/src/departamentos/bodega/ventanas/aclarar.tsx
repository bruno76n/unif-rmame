/**
 * La ventana «Aclarar {DF}». De recepción, «¿Qué pasó?»: «Llegó», «No salió», «Venía en otro» (pide su espejo) o «Se
 * perdió» (pide el motivo del ajuste). De material: «Ya se cubrió» (solo si ya no está en negativo) o «Ajuste» (con el
 * motivo del ajuste). Siempre, el motivo escrito. «Dar por aclarada» llama `inventario.aclarar_diferencia`.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Ventanas») y docs/modulos/inventario/diferencias-ajustes-y-mermas.md
 * («Cómo se aclara una de recepción»)
 *
 * Si una aclaración no aplica, lo dice la acción (`aclaracion_no_aplica`) en el aviso de abajo.
 */

import type { diferenciaPorAclarar } from "@uniformame/compartido/contratos/inventario/bodega";
import { aclararDiferencia } from "@uniformame/compartido/contratos/inventario/diferencias";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useLargoMinimoDelMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";

/** Una diferencia por aclarar. */
type PorAclarar = z.infer<typeof diferenciaPorAclarar>;

/** Una aclaración. */
type Aclaracion = z.input<typeof aclararDiferencia.entrada>["aclaracion"];

/** Las aclaraciones de una de recepción, con lo que quieren decir. */
const deRecepcion: readonly { valor: Aclaracion; texto: string }[] = [
	{ valor: "llego", texto: "Llegó: se contó mal al recibir, o llegó después" },
	{ valor: "no_salio", texto: "No salió: el origen mandó otra cantidad" },
	{ valor: "venia_en_otro", texto: "Venía en otro: se cruzó con otro traspaso o con otro lote" },
	{ valor: "perdida", texto: "Se perdió" },
];

/**
 * La ventana «Aclarar {DF}».
 * @param props La diferencia, los motivos de ajuste y cómo cerrar la ventana.
 */
export function VentanaAclarar({
	diferencia,
	motivos,
	alCerrar,
}: {
	diferencia: PorAclarar;
	motivos: readonly { id: string; nombre: string }[];
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const largoMinimo = useLargoMinimoDelMotivo();
	const { enviar, enviando, choco } = useEnvio(aclararDiferencia);
	const opciones = diferencia.es_material
		? [
				...(diferencia.sigue_en_negativo
					? []
					: [{ valor: "aclarada" as const, texto: "Ya se cubrió: llegó el material y cubrió el hueco" }]),
				{ valor: "ajuste" as const, texto: "Ajuste" },
			]
		: deRecepcion;
	const [aclaracion, setAclaracion] = useState<Aclaracion>(opciones[0]?.valor ?? "ajuste");
	const [espejo, setEspejo] = useState(diferencia.espejos[0]?.diferencia_id ?? "");
	const [motivoId, setMotivoId] = useState("");
	const [motivo, setMotivo] = useState("");
	const [errores, setErrores] = useState<Record<string, string>>({});
	const pideAjuste = aclaracion === "perdida" || aclaracion === "ajuste";
	const listo =
		motivo.trim().length >= largoMinimo &&
		(!pideAjuste || motivoId !== "") &&
		(aclaracion !== "venia_en_otro" || espejo !== "");
	const mandar = async () => {
		const salio = await enviar(
			{
				datos: {
					diferencia_id: diferencia.diferencia_id,
					aclaracion,
					motivo: motivo.trim(),
					...(aclaracion === "venia_en_otro" ? { otra_diferencia_id: espejo } : {}),
					...(pideAjuste ? { motivo_id: motivoId } : {}),
				},
				version: diferencia.version,
			},
			(falla) => setErrores(falla.campos),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo={`Aclarar ${diferencia.folio}`}
			subtitulo={`${diferencia.prenda} · ${diferencia.descripcion}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando || !listo} onClick={() => void mandar()}>
					Dar por aclarada
				</Boton>
			}
		>
			<div className="flex flex-col gap-3">
				{choco ? <EstadoDePantalla tipo="choque" documento={diferencia.folio} /> : null}
				<Selector
					etiqueta={diferencia.es_material ? "Cómo se aclara" : "¿Qué pasó?"}
					enVentana
					opciones={opciones}
					value={aclaracion}
					onChange={(evento) =>
						setAclaracion(opciones.find((opcion) => opcion.valor === evento.target.value)?.valor ?? aclaracion)
					}
				/>
				{aclaracion === "venia_en_otro" ? (
					<Selector
						etiqueta="Con qué diferencia se cruzó"
						enVentana
						vacio="Ninguna diferencia es su espejo"
						opciones={diferencia.espejos.map((suyo) => ({
							valor: suyo.diferencia_id,
							texto: `${suyo.folio} · ${suyo.descripcion}`,
						}))}
						value={espejo}
						error={errores.otra_diferencia_id}
						onChange={(evento) => setEspejo(evento.target.value)}
					/>
				) : null}
				{pideAjuste ? (
					<Selector
						etiqueta="Motivo del ajuste"
						enVentana
						vacio="Escoge el motivo"
						opciones={motivos.map((suyo) => ({ valor: suyo.id, texto: suyo.nombre }))}
						value={motivoId}
						error={errores.motivo_id}
						onChange={(evento) => setMotivoId(evento.target.value)}
					/>
				) : null}
				<Campo
					etiqueta="Motivo"
					enVentana
					maxLength={500}
					value={motivo}
					error={errores.motivo}
					onChange={(evento) => setMotivo(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
