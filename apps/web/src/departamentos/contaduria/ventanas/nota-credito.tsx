/**
 * La ventana «Llegó su nota de crédito»: «{FP} · {diferencia} por aclarar», el folio de la nota y su archivo
 * (opcional). «Guardar» sube el archivo y llama a `contaduria.registrar_nota_credito_proveedor` con su `archivo_id` y la
 * versión de la factura; si la subida falla, el aviso dice por qué y lo capturado se queda.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/facturas-de-proveedor.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import type { conciliacionFacturasDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pagar";
import { registrarNotaCreditoProveedor } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { CampoDeArchivo } from "@uniformame/interfaz/captura/campo-de-archivo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { aceptaDe, useSubidaAlMandar } from "../../../comun/subida.ts";
import { useEnvio } from "../envio.ts";

/** Una factura de la lista. */
type Factura = z.infer<typeof conciliacionFacturasDeContaduria.resultado>["renglones"][number];

/** El formulario: el folio de la nota, con el esquema del contrato. */
const formularioDeNota = z.object({ folio_nota: registrarNotaCreditoProveedor.entrada.shape.folio_nota });

/**
 * La ventana para registrar la nota de crédito del proveedor que aclara la diferencia de una factura autorizada.
 * @param props La factura y qué hacer al cerrar.
 */
export function VentanaNotaCreditoProveedor({ factura, alCerrar }: { factura: Factura; alCerrar: () => void }) {
	const { enviar, enviando, choco } = useEnvio(registrarNotaCreditoProveedor);
	const conConexion = useConConexion();
	const { subir, subiendo } = useSubidaAlMandar("factura_proveedor", "contaduria");
	const [archivo, setArchivo] = useState<File | null>(null);
	const [errorDelArchivo, setErrorDelArchivo] = useState<string | undefined>(undefined);
	const formulario = useForm<z.input<typeof formularioDeNota>>({
		resolver: zodResolver(formularioDeNota),
		defaultValues: { folio_nota: "" },
	});
	const guardar = formulario.handleSubmit(async ({ folio_nota }) => {
		if (factura.factura_proveedor_id === null || factura.version === null) return;
		// El archivo se sube primero; si no se pudo, ya lo avisó y no se guarda.
		const archivoId = archivo === null ? undefined : await subir(archivo);
		if (archivo !== null && archivoId === undefined) return;
		const salio = await enviar(
			{
				datos: {
					factura_proveedor_id: factura.factura_proveedor_id,
					folio_nota,
					...(archivoId === undefined ? {} : { archivo_id: archivoId }),
				},
				version: factura.version,
			},
			(campos) => {
				setErrorDelArchivo(campos.archivo_id);
				if (campos.folio_nota !== undefined) formulario.setError("folio_nota", { message: campos.folio_nota });
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Llegó su nota de crédito"
			subtitulo={`${factura.folio ?? ""} · ${montoEnPantalla(factura.autorizada?.diferencia_centavos)} por aclarar`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando || subiendo} onClick={() => void guardar()}>
					Guardar
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
				{choco ? <EstadoDePantalla tipo="choque" documento={factura.folio ?? "La factura"} /> : null}
				<Campo
					enVentana
					etiqueta="Folio de la nota de crédito"
					autoComplete="off"
					error={formulario.formState.errors.folio_nota?.message}
					{...formulario.register("folio_nota")}
				/>
				<CampoDeArchivo
					enVentana
					etiqueta="Archivo de la nota (opcional)"
					acepta={aceptaDe.notaCredito}
					archivo={archivo}
					error={errorDelArchivo}
					alEscoger={(escogido) => {
						setArchivo(escogido);
						setErrorDelArchivo(undefined);
					}}
				/>
			</form>
		</Ventana>
	);
}
