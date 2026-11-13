/**
 * La ventana «Adjuntar documento» del contador externo: el archivo (PDF, imagen, XML o ZIP), su tipo y su mes,
 * opcionales. «Adjuntar documento» sube el archivo y llama a `contaduria.adjuntar_documento_contador` con su
 * `archivo_id` («Documento guardado»); si la subida falla, el aviso dice por qué y lo capturado se queda.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Contador externo») y docs/modulos/contaduria/contador-y-cuadres.md
 */

import { adjuntarDocumentoContador } from "@uniformame/compartido/contratos/contaduria/contador";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { CampoDeArchivo } from "@uniformame/interfaz/captura/campo-de-archivo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { aceptaDe, useSubidaAlMandar } from "../../../comun/subida.ts";
import { useEnvio } from "../envio.ts";

/** Un tipo de documento del contador, como lo recibe la acción. */
type Tipo = NonNullable<z.input<typeof adjuntarDocumentoContador.entrada>["tipo"]>;

/** Los tipos que se escogen, con su texto. */
const tipos: readonly { valor: Tipo; texto: string }[] = [
	{ valor: "declaracion", texto: "Declaración" },
	{ valor: "acuse", texto: "Acuse" },
	{ valor: "facturas", texto: "Facturas" },
	{ valor: "documento", texto: "Documento" },
];

/**
 * El tipo escogido, si es uno de la lista.
 * @param valor Lo del selector.
 */
function tipoDe(valor: string): Tipo | undefined {
	return tipos.find((tipo) => tipo.valor === valor)?.valor;
}

/**
 * La ventana para guardar un documento que regresó el contador.
 * @param props Qué hacer al cerrar.
 */
export function VentanaAdjuntarDocumento({ alCerrar }: { alCerrar: () => void }) {
	const { enviar, enviando } = useEnvio(adjuntarDocumentoContador);
	const conConexion = useConConexion();
	const { subir, subiendo } = useSubidaAlMandar("documento_contador", "contaduria");
	const [archivo, setArchivo] = useState<File | null>(null);
	const [tipo, setTipo] = useState("");
	const [mes, setMes] = useState("");
	const [errores, setErrores] = useState<Record<string, string>>({});
	/** Sube el archivo y lo guarda con su tipo y su mes. */
	const adjuntar = async () => {
		// Sin archivo, la acción dice qué falta; si la subida no se pudo, ya lo avisó y no se guarda.
		const archivoId = archivo === null ? "" : await subir(archivo);
		if (archivoId === undefined) return;
		const escogido = tipoDe(tipo);
		const salio = await enviar(
			{
				datos: {
					archivo_id: archivoId,
					...(escogido === undefined ? {} : { tipo: escogido }),
					// El mes del selector es «AAAA-MM»; la acción recibe su primer día.
					...(mes === "" ? {} : { mes: `${mes}-01` }),
				},
			},
			setErrores,
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Adjuntar documento"
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando || subiendo} onClick={() => void adjuntar()}>
					Adjuntar documento
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<CampoDeArchivo
					enVentana
					etiqueta="Documento"
					acepta={aceptaDe.documentoContador}
					archivo={archivo}
					error={errores.archivo_id}
					alEscoger={setArchivo}
				/>
				<Selector
					enVentana
					etiqueta="Tipo (opcional)"
					vacio="Sin tipo"
					opciones={tipos}
					value={tipo}
					error={errores.tipo}
					onChange={(evento) => setTipo(evento.target.value)}
				/>
				<Campo
					enVentana
					type="month"
					etiqueta="Mes (opcional)"
					value={mes}
					error={errores.mes}
					onChange={(evento) => setMes(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
