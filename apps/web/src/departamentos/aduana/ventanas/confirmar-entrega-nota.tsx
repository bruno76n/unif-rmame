/**
 * La ventana «Confirmar entrega de {NV}» desde En tránsito: «{cliente} · {n} piezas», sin el total (Aduana nunca ve
 * pesos), y «Quién recibió». «Confirmar entrega» llama `ventas.confirmar_entrega` con la versión de la nota.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Ventanas») y docs/interfaz/fabrica/ventas.md («Ventanas»)
 *
 * Es la misma ventana que la de Ventas, con lo que trae `inventario.en_transito`: Aduana no lee la consulta de la nota
 * de Ventas, que es de su departamento.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { enTransito } from "@uniformame/compartido/contratos/inventario/aduana";
import { confirmarEntrega } from "@uniformame/compartido/contratos/ventas/notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../comun.tsx";

/** La nota de un despacho en tránsito. */
type Nota = NonNullable<z.infer<typeof enTransito.resultado>["renglones"][number]["nota"]>;

/** El formulario: quién recibió, con el esquema del contrato. */
const formularioDeEntrega = z.object({ recibio_nombre: confirmarEntrega.entrada.shape.recibio_nombre });

/**
 * La ventana para confirmar la entrega de una nota en camino.
 * @param props La nota y cómo cerrar la ventana.
 */
export function VentanaConfirmarEntregaNota({ nota, alCerrar }: { nota: Nota; alCerrar: () => void }) {
	const { enviar, enviando, choco } = useEnvio(confirmarEntrega);
	const conConexion = useConConexion();
	const formulario = useForm<z.input<typeof formularioDeEntrega>>({
		resolver: zodResolver(formularioDeEntrega),
		defaultValues: { recibio_nombre: "" },
	});
	const confirmar = formulario.handleSubmit(async ({ recibio_nombre }) => {
		const salio = await enviar({ datos: { nota_id: nota.nota_id, recibio_nombre }, version: nota.version }, (falla) => {
			const error = falla.campos.recibio_nombre;
			if (error !== undefined) formulario.setError("recibio_nombre", { message: error });
		});
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Confirmar entrega de ${nota.folio}`}
			subtitulo={`${nota.cliente} · ${plural(nota.piezas, "pieza", "piezas")}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void confirmar()}>
					Confirmar entrega
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void confirmar(evento)}>
				{choco ? <EstadoDePantalla tipo="choque" documento={nota.folio} /> : null}
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
