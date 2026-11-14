/**
 * La ventana «Mandar a {tienda}», para una tienda sin caja: «{prenda} · talla {t}», «{n} libres en bodega» y «Piezas».
 * «Mandar» llama `inventario.mover_a_tienda` con las piezas que se escriben.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Variante) y docs/modulos/inventario/minimos-y-reabasto.md
 * (regla 12)
 */

import type { detalleDeVariante } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { moverATienda } from "@uniformame/compartido/contratos/inventario/reabasto";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/**
 * La ventana «Mandar a {tienda}».
 * @param props La variante, la tienda y cómo cerrar la ventana.
 */
export function VentanaMandarATienda({
	detalle,
	tienda,
	alCerrar,
}: {
	detalle: z.infer<typeof detalleDeVariante.resultado>;
	tienda: { ubicacion_id: string; nombre: string };
	alCerrar: () => void;
}) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(moverATienda);
	const [piezas, setPiezas] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	const numero = Number(piezas);
	const listo = Number.isInteger(numero) && numero > 0;
	const mandar = async () => {
		const salio = await enviar(
			{
				datos: {
					renglones: [{ variante_id: detalle.variante_id, ubicacion_destino_id: tienda.ubicacion_id, piezas: numero }],
				},
			},
			(falla) => setError(falla.campos["renglones.0.piezas"] ?? falla.mensaje),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Mandar a ${tienda.nombre}`}
			subtitulo={`${detalle.prenda} · talla ${detalle.talla} · ${detalle.libres_en_bodega} libres en bodega`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando || !listo} onClick={() => void mandar()}>
					Mandar
				</Boton>
			}
		>
			<Campo
				etiqueta="Piezas"
				enVentana
				inputMode="numeric"
				value={piezas}
				error={error}
				onChange={(evento) => setPiezas(evento.target.value.replace(/\D/g, ""))}
			/>
		</Ventana>
	);
}
