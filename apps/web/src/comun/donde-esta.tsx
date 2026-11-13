/**
 * «¿Dónde está?», la búsqueda de la barra superior para Aduana, Bodega y Dirección (atajo: la tecla /). Con un código
 * de 4 dígitos o más, o prenda y talla, salen hasta 5 variantes con sus piezas en cada ubicación, el total, lo
 * comprometido, lo libre y lo que se está moviendo con su folio.
 * Fase 19 · docs/interfaz/comunes.md («¿Dónde está?», «`inventario.donde_esta`»)
 */

import { dondeEsta } from "@uniformame/compartido/contratos/inventario/armazon";
import { unirClases } from "@uniformame/interfaz/clases";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useConsulta } from "./api.tsx";

/** Los ejemplos para tocar cuando no hay texto. */
const ejemplos = ["polo 12", "pants marino", "102041"];

/** Cuánto se espera después de la última tecla antes de buscar. */
const esperaDeTecleo = 250;

/** La búsqueda «¿Dónde está?». */
export function DondeEsta() {
	const [texto, setTexto] = useState("");
	const [buscado, setBuscado] = useState("");
	const [abierta, setAbierta] = useState(false);
	const campo = useRef<HTMLInputElement>(null);
	// La tecla / la abre desde cualquier lugar, salvo cuando se está escribiendo en otro campo.
	useEffect(() => {
		const alTeclear = (evento: KeyboardEvent) => {
			const enCampo = evento.target instanceof HTMLInputElement || evento.target instanceof HTMLTextAreaElement;
			if (evento.key === "/" && !enCampo) {
				evento.preventDefault();
				campo.current?.focus();
			}
			if (evento.key === "Escape") setAbierta(false);
		};
		window.addEventListener("keydown", alTeclear);
		return () => window.removeEventListener("keydown", alTeclear);
	}, []);
	useEffect(() => {
		const reloj = setTimeout(() => setBuscado(texto.trim()), esperaDeTecleo);
		return () => clearTimeout(reloj);
	}, [texto]);
	const resultado = useConsulta(dondeEsta, { texto: buscado, limite: 5 }, buscado.length > 0);
	return (
		<div className="relative w-full min-w-0 max-w-[480px] max-telefono:max-w-none">
			<label className="flex h-11 items-center gap-2.5 rounded-mediano border border-linea2 bg-panel px-3.5 text-tinta3 focus-within:border-marca focus-within:ring-3 focus-within:ring-marca/20">
				<Search aria-hidden="true" size={18} strokeWidth={1.9} />
				<span className="sr-only">¿Dónde está?</span>
				<input
					ref={campo}
					value={texto}
					onChange={(evento) => setTexto(evento.target.value)}
					onFocus={() => setAbierta(true)}
					placeholder="¿Dónde está? Prenda y talla, o código"
					className="min-w-0 flex-1 bg-transparent text-tinta outline-none placeholder:text-tinta3"
				/>
				<kbd className="rounded-chico bg-riel px-2 font-bold text-tinta3 text-xs max-telefono:hidden">/</kbd>
			</label>
			{abierta ? (
				<section
					aria-label="Resultados de ¿Dónde está?"
					className="absolute top-13 right-0 left-0 z-40 max-h-[70vh] overflow-y-auto rounded-grande bg-panel p-2 shadow-flotante max-telefono:fixed max-telefono:right-4 max-telefono:left-4"
				>
					{buscado === "" ? (
						<div className="p-3 text-tinta2">
							<div className="flex flex-wrap gap-2">
								{ejemplos.map((ejemplo) => (
									<button
										key={ejemplo}
										type="button"
										onClick={() => setTexto(ejemplo)}
										className="rounded-full border border-linea2 px-3 py-1 font-semibold text-sm hover:bg-suave"
									>
										{ejemplo}
									</button>
								))}
							</div>
						</div>
					) : resultado.data === undefined ? (
						<div className="p-3 text-tinta2">
							{resultado.isError ? "No se pudo buscar. Intenta otra vez" : "Buscando…"}
						</div>
					) : resultado.data.variantes.length === 0 ? (
						<div className="p-3 font-semibold text-tinta2">No encontré «{buscado}»</div>
					) : (
						resultado.data.variantes.map((variante) => (
							<article key={variante.variante_id} className="border-linea border-b p-3 last:border-b-0">
								<header className="mb-2 flex justify-between gap-3">
									<b className="font-bold">
										{variante.prenda}, talla {variante.talla}
									</b>
									<span className="font-mono text-tinta3 text-xs">{variante.codigo}</span>
								</header>
								<div className="grid grid-cols-6 overflow-hidden rounded-mediano bg-suave max-telefono:grid-cols-3">
									{variante.ubicaciones.map((ubicacion) => (
										<div key={ubicacion.codigo} className="px-2.5 py-2">
											<small className="block whitespace-nowrap font-semibold text-tinta3 text-xs">
												{ubicacion.nombre}
											</small>
											<b
												className={unirClases(
													"font-bold text-base tabular-nums",
													ubicacion.piezas === 0 && "text-linea2",
												)}
											>
												{ubicacion.piezas}
											</b>
										</div>
									))}
								</div>
								<footer className="mt-2 flex flex-wrap gap-4 text-etiqueta text-tinta2">
									<span>
										Total <b className="text-tinta tabular-nums">{variante.total}</b>
									</span>
									<span>
										Comprometidas <b className="text-tinta tabular-nums">{variante.comprometidas}</b>
									</span>
									<span>
										Libres <b className="text-tinta tabular-nums">{variante.libres}</b>
									</span>
									{variante.en_camino.map((traspaso) => (
										<span key={traspaso.folio}>
											{traspaso.folio}: {traspaso.piezas} a {traspaso.destino}
										</span>
									))}
								</footer>
							</article>
						))
					)}
				</section>
			) : null}
		</div>
	);
}
