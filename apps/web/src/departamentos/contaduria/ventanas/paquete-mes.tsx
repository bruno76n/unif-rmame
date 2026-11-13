/**
 * La ventana «Paquete de {mes}»: lo que recibe el contador, en vivo mientras no se manda y congelado después; la nómina
 * en «••••» sin «ven sueldos y tarifas». «Marcar como enviado» llama a `contaduria.marcar_paquete_enviado`.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Paquete de {mes}») y docs/modulos/contaduria/contador-y-cuadres.md
 */

import { paqueteMes } from "@uniformame/compartido/contratos/contaduria/consultas-gastos-contador";
import { marcarPaqueteEnviado } from "@uniformame/compartido/contratos/contaduria/contador";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** Un renglón del paquete. */
type Renglon = z.infer<typeof paqueteMes.resultado>["renglones"][number];

/**
 * El monto de un renglón con su signo: «+$184,300», «−$96,420»; la nómina sin el permiso, «••••».
 * @param renglon El renglón.
 */
function montoConSigno(renglon: Renglon): string {
	const monto = renglon.es_nomina ? renglon.total_nomina_centavos : renglon.monto_centavos;
	if (renglon.es_nomina && monto === undefined) return "••••";
	const signo = renglon.signo === "ingreso" ? "+" : renglon.signo === "egreso" ? "−" : "";
	return `${signo}${montoEnPantalla(monto)}`;
}

/**
 * La ventana del paquete de un mes.
 * @param props El paquete y qué hacer al cerrar.
 */
export function VentanaPaqueteMes({ paqueteId, alCerrar }: { paqueteId: string; alCerrar: () => void }) {
	const consulta = useConsulta(paqueteMes, { paquete_contador_id: paqueteId });
	const { enviar, enviando, choco } = useEnvio(marcarPaqueteEnviado);
	const conConexion = useConConexion();
	const paquete = consulta.data;
	const marcar = async () => {
		if (paquete === undefined) return;
		const salio = await enviar({ datos: { paquete_contador_id: paqueteId }, version: paquete.version });
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo={`Paquete de ${paquete?.mes_texto ?? ""}`}
			subtitulo="Lo que recibe el contador."
			accion={
				paquete === undefined || paquete.enviado ? undefined : (
					<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void marcar()}>
						Marcar como enviado
					</Boton>
				)
			}
		>
			<SegunConsulta consulta={consulta} renglones={6}>
				{(datos) => (
					<div className="flex flex-col gap-3">
						{choco ? <EstadoDePantalla tipo="choque" documento={`El paquete de ${datos.mes_texto}`} /> : null}
						<Tabla
							nombre={`Paquete de ${datos.mes_texto}`}
							filas={datos.renglones}
							claveDeFila={(renglon) => `${renglon.concepto}-${renglon.de_meses_anteriores}`}
							columnas={[
								{
									clave: "concepto",
									encabezado: "Concepto",
									celda: (renglon) =>
										renglon.de_meses_anteriores ? `${renglon.concepto} · de meses anteriores` : renglon.concepto,
								},
								{ clave: "monto", encabezado: "Monto", alinear: "derecha", celda: montoConSigno },
								{
									clave: "documentos",
									encabezado: "Documentos",
									alinear: "derecha",
									celda: (renglon) => renglon.documentos.toLocaleString("es-MX"),
								},
							]}
						/>
						<span className="text-etiqueta text-tinta3">
							Va con los comprobantes de cada gasto y las facturas de proveedor del mes.
						</span>
					</div>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
