/**
 * El inicio de cada persona: a la izquierda su producción («Hoy llevas», la semana, las barras por hora y sus últimos
 * tres registros, o sus operaciones si todavía no registra); a la derecha «Escanear bulto», «Falla de máquina», «Tomar
 * consumible» y «Bultos para ti».
 * Fase 20 · docs/interfaz/tablet.md («Inicio de cada persona»)
 */

import { Mosaico, TarjetaDeBulto } from "@uniformame/interfaz/tablet/botones";
import { BarrasPorHora, CifraGrande } from "@uniformame/interfaz/tablet/produccion";
import { Package, ScanLine, Wrench } from "lucide-react";
import type { BultoParaTi, ProduccionDeLaPersona, RegistroReciente } from "../copia/lecturas.ts";

/** Cómo se lee la marca de un registro reciente, con su tono. */
const marcas: Readonly<Record<NonNullable<RegistroReciente["marca"]>, { texto: string; clase: string }>> = {
	guardada: { texto: "guardada aquí", clase: "font-bold text-texto-advertencia" },
	cancelado: { texto: "Cancelado", clase: "font-bold text-tinta3" },
	apartado: { texto: "No entró: avisa al encargado", clase: "font-bold text-texto-error" },
};

/**
 * El inicio de una persona.
 * @param props Su producción, sus bultos y qué hacer con cada botón.
 */
export function Inicio({
	produccion,
	bultos,
	alEscanear,
	alFalla,
	alConsumible,
	alAbrirBulto,
}: {
	produccion: ProduccionDeLaPersona;
	bultos: readonly BultoParaTi[];
	alEscanear: () => void;
	alFalla: () => void;
	alConsumible: () => void;
	alAbrirBulto: (bulto: BultoParaTi) => void;
}) {
	return (
		<div className="grid h-full grid-cols-[minmax(300px,.85fr)_minmax(0,1.4fr)] gap-5.5 max-menu:h-auto max-menu:grid-cols-1">
			<section className="flex min-h-0 flex-col rounded-tablet bg-panel p-5.5 shadow-panel">
				<small className="font-semibold text-[16px] text-tinta3">Hoy llevas</small>
				<CifraGrande cifra={produccion.hoy} unidad="piezas" />
				<p className="m-0 mt-2 font-semibold text-tinta2">{produccion.semana.toLocaleString("es-MX")} esta semana</p>
				{produccion.barras.length === 0 ? null : (
					<BarrasPorHora
						barras={produccion.barras.map((barra) => ({ hora: String(barra.hora), piezas: barra.piezas }))}
					/>
				)}
				{produccion.ultimos.length === 0 ? (
					<p className="m-0 mt-4.5 border-linea border-t pt-3.5 font-medium text-[15px] text-tinta2">
						<b className="block">Tus operaciones</b>
						{produccion.operaciones.join(" · ")}
					</p>
				) : (
					<ul className="m-0 mt-4.5 list-none border-linea border-t p-0 pt-3.5 font-medium text-[15px] text-tinta2">
						{produccion.ultimos.map((registro) => (
							<li key={registro.id} className="py-1">
								{registro.texto}
								{registro.marca === null ? null : (
									<span className={marcas[registro.marca].clase}> · {marcas[registro.marca].texto}</span>
								)}
							</li>
						))}
					</ul>
				)}
			</section>
			<section className="flex min-h-0 flex-col">
				<div className="grid grid-cols-[1.3fr_1fr_1fr] gap-3.5">
					<Mosaico icono={ScanLine} titulo="Escanear bulto" principal onClick={alEscanear} />
					<Mosaico icono={Wrench} titulo="Falla de máquina" onClick={alFalla} />
					<Mosaico icono={Package} titulo="Tomar consumible" onClick={alConsumible} />
				</div>
				<h2 className="mt-6 mb-3 font-bold text-[20px]">Bultos para ti</h2>
				{bultos.length === 0 ? (
					<p className="m-0 rounded-[14px] bg-panel p-7 text-center font-semibold text-[18px] text-tinta3 shadow-panel">
						Ningún bulto espera tu operación ahorita
					</p>
				) : (
					<div className="grid min-h-0 grid-cols-2 gap-3 overflow-auto pb-1">
						{bultos.map((bulto) => (
							<TarjetaDeBulto
								key={`${bulto.bultoId}:${bulto.flujoOperacionId}`}
								folio={bulto.folio}
								prenda={bulto.prendaYTalla}
								operacion={bulto.operacion}
								listas={bulto.listas}
								textoDeListas={bulto.listas === 1 ? "lista para ti" : "listas para ti"}
								tono={bulto.tono}
								onClick={() => alAbrirBulto(bulto)}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
