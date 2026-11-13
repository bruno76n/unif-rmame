/**
 * La ventana «No la encuentro»: «{prenda} talla {t} · apartada para {PE o W}» (con un selector si el pedido aparta más
 * de una prenda) y «Nota» (opcional). «No la encuentro» llama `inventario.no_la_encuentro` con la reserva.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Ventanas») y
 * docs/modulos/inventario/entregas-y-devoluciones-de-clientes.md («`inventario.no_la_encuentro`»)
 */

import type { pendientesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { noLaEncuentro } from "@uniformame/compartido/contratos/inventario/despachos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../comun.tsx";

/** Un renglón de Pendientes con lo apartado. */
type Renglon = z.infer<typeof pendientesDeBodega.resultado>["renglones"][number];

/**
 * La ventana «No la encuentro».
 * @param props El pedido por surtir y cómo cerrar la ventana.
 */
export function VentanaNoLaEncuentro({ renglon, alCerrar }: { renglon: Renglon; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(noLaEncuentro);
	const [reservaId, setReservaId] = useState(renglon.apartadas[0]?.reserva_id ?? "");
	const [nota, setNota] = useState("");
	const pieza = renglon.apartadas.find((apartada) => apartada.reserva_id === reservaId);
	const documento = renglon.titulo.split(" · ")[0] ?? "";
	const mandar = async () => {
		const salio = await enviar({
			datos: { reserva_id: reservaId, ...(nota.trim() === "" ? {} : { nota: nota.trim() }) },
		});
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="No la encuentro"
			{...(pieza === undefined
				? {}
				: { subtitulo: `${pieza.prenda} talla ${pieza.talla} · apartada para ${documento}` })}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || pieza === undefined}
					onClick={() => void mandar()}
				>
					No la encuentro
				</Boton>
			}
		>
			<div className="flex flex-col gap-3">
				{renglon.apartadas.length > 1 ? (
					<Selector
						etiqueta="Prenda"
						enVentana
						opciones={renglon.apartadas.map((apartada) => ({
							valor: apartada.reserva_id,
							texto: `${apartada.prenda} talla ${apartada.talla}`,
						}))}
						value={reservaId}
						onChange={(evento) => setReservaId(evento.target.value)}
					/>
				) : null}
				<Campo
					etiqueta="Nota"
					enVentana
					maxLength={200}
					autoComplete="off"
					value={nota}
					onChange={(evento) => setNota(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
