/**
 * Lo que comparten Despacho e Inventario en aduana: qué es lo que está en aduana (su título con «Sale hoy» o «Sale
 * mañana», «{folio} · {detalle}» y, si toca, «Etiquetas por imprimir») y su botón: «Despachar» y «Sin nota» abren el
 * cajón Despachar; «Ver pedido» lleva a Empaque en línea; «Ver» abre el cajón, que dice que espera a Calidad; y
 * «Devolver al proveedor» abre su ventana.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho» e «Inventario en aduana»)
 */

import { Boton } from "@uniformame/interfaz/botones/boton";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Send } from "lucide-react";
import { type PartidaEnAduana, textosDelBoton, useAbrir } from "../comun.tsx";

/**
 * Qué es lo que está en aduana, en dos renglones.
 * @param props Lo que está en aduana.
 */
export function QueEs({ partida }: { partida: PartidaEnAduana }) {
	return (
		<DosRenglones
			arriba={
				<span className="flex flex-wrap items-baseline gap-2">
					{partida.titulo}
					{partida.sale === null ? null : <TextoConTono tono="rojo">{partida.sale}</TextoConTono>}
				</span>
			}
			abajo={
				<span className="flex flex-wrap items-baseline gap-2">
					{`${partida.folio} · ${partida.detalle}`}
					{partida.etiquetas_por_imprimir ? <TextoConTono tono="ambar">Etiquetas por imprimir</TextoConTono> : null}
				</span>
			}
		/>
	);
}

/**
 * El botón de lo que está en aduana.
 * @param props Lo que está en aduana y qué hacer con «Devolver al proveedor».
 */
export function BotonDePartida({
	partida,
	alDevolver,
}: {
	partida: PartidaEnAduana;
	alDevolver?: ((partida: PartidaEnAduana) => void) | undefined;
}) {
	const abrir = useAbrir();
	/** Lo que hace el botón. */
	const tocar = () => {
		if (partida.boton === "devolver") alDevolver?.(partida);
		else if (partida.boton === "ver_pedido") abrir({ a: "empaque", id: partida.traspaso_id });
		else abrir({ a: "despachar", id: partida.traspaso_id });
	};
	return (
		<Boton chico {...(partida.boton === "despachar" ? { icono: Send } : {})} onClick={tocar}>
			{textosDelBoton[partida.boton]}
		</Boton>
	);
}
