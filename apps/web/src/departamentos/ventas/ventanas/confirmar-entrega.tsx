/**
 * La ventana «Confirmar entrega de {NV}»: el cliente, las piezas y el total (sin total desde Aduana) y «Quién recibió».
 * Llama a `ventas.confirmar_entrega` con la versión de la nota.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Ventanas») y docs/modulos/ventas/notas-de-entrega.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { notaEntregaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { confirmarEntrega } from "@uniformame/compartido/contratos/ventas/notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** El formulario: quién recibió, con el esquema del contrato. */
const formularioDeEntrega = z.object({ recibio_nombre: confirmarEntrega.entrada.shape.recibio_nombre });

/**
 * La ventana para confirmar la entrega de una nota en camino.
 * @param props La nota y qué hacer al cerrar.
 */
export function VentanaConfirmarEntrega({ notaId, alCerrar }: { notaId: string; alCerrar: () => void }) {
	const nota = useConsulta(notaEntregaVentas, { nota_id: notaId });
	const { enviar, enviando, choco } = useEnvio(confirmarEntrega);
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof formularioDeEntrega>>({
		resolver: zodResolver(formularioDeEntrega),
		defaultValues: { recibio_nombre: "" },
	});
	const datos = nota.data;
	const confirmar = formulario.handleSubmit(async ({ recibio_nombre }) => {
		if (datos === undefined) return;
		const salio = await enviar({ datos: { nota_id: notaId, recibio_nombre }, version: datos.version }, (campos) => {
			if (campos.recibio_nombre !== undefined)
				formulario.setError("recibio_nombre", { message: campos.recibio_nombre });
		});
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Confirmar entrega de ${datos?.folio ?? ""}`}
			{...(datos === undefined
				? {}
				: {
						subtitulo: [
							datos.cliente.nombre,
							`${datos.piezas.toLocaleString("es-MX")} piezas`,
							...(datos.total_centavos === undefined ? [] : [enPesos(datos.total_centavos)]),
						].join(" · "),
					})}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || datos === undefined}
					onClick={() => void confirmar()}
				>
					Confirmar entrega
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void confirmar(evento)}>
				{choco && datos !== undefined ? <EstadoDePantalla tipo="choque" documento={datos.folio} /> : null}
				<Campo
					enVentana
					etiqueta="Quién recibió"
					autoComplete="off"
					error={formulario.formState.errors.recibio_nombre?.message}
					{...formulario.register("recibio_nombre")}
				/>
			</form>
		</Ventana>
	);
}
