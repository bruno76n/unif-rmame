/**
 * Registrar una operación: el bulto con su prenda, su lote y para quién; la operación con «Cambiar»; el tope y de dónde
 * sale; los contadores «Buenas» (empieza en el tope) y «Dañadas» (en 0); la tarifa si la dueña la muestra; y «Registrar
 * {n} pieza(s)», apagado en 0 o arriba del tope. «Cambiar» lista las operaciones del bulto con piezas listas: primero
 * las que hace de base la persona.
 * Fase 20 · docs/interfaz/tablet.md («Registrar una operación»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { plural } from "@uniformame/compartido/calculos/textos";
import { BotonGrande, BotonVolver, Opcion } from "@uniformame/interfaz/tablet/botones";
import { Contador, MensajeDeTablet } from "@uniformame/interfaz/tablet/captura";
import { Check } from "lucide-react";
import { useState } from "react";
import type { PasoDelBulto } from "../copia/lecturas.ts";

/** Lo del bulto que muestra Registrar. */
export interface BultoARegistrar {
	folio: string;
	prendaYTalla: string;
	/** «{para quién} · {lote}». */
	deQuien: string;
	/** Las operaciones del bulto, con su tope. */
	pasos: readonly PasoDelBulto[];
}

/**
 * Las operaciones con piezas listas, para «Cambiar»: primero las de base de la persona, luego las demás en su orden.
 * @param pasos Las operaciones del bulto.
 * @param personaId La persona.
 */
function conListas(pasos: readonly PasoDelBulto[], personaId: string): PasoDelBulto[] {
	const listas = pasos.filter((paso) => paso.tope > 0);
	return [
		...listas.filter((paso) => paso.personaBaseId === personaId),
		...listas.filter((paso) => paso.personaBaseId !== personaId),
	];
}

/**
 * Registrar una operación.
 * @param props El bulto, la operación con que abre, la persona, la tarifa y qué hacer al registrar y al volver.
 */
export function Registrar({
	bulto,
	flujoOperacionId,
	personaId,
	tarifaDe,
	alRegistrar,
	alVolver,
}: {
	bulto: BultoARegistrar;
	flujoOperacionId: string;
	personaId: string;
	/** La tarifa de una operación: en centavos, nula si no tiene, o sin definir si no se muestra. */
	tarifaDe: (flujoOperacionId: string) => number | null | undefined;
	alRegistrar: (registro: { flujoOperacionId: string; buenas: number; danadas: number }) => void;
	alVolver: () => void;
}) {
	const [operacionId, setOperacionId] = useState(flujoOperacionId);
	const paso = bulto.pasos.find((suyo) => suyo.flujoOperacionId === operacionId);
	const [buenas, setBuenas] = useState(paso?.tope ?? 0);
	const [danadas, setDanadas] = useState(0);
	const [cambiando, setCambiando] = useState(false);
	if (paso === undefined) return null;
	if (cambiando) {
		return (
			<section className="mx-auto flex max-w-225 flex-col gap-4.5">
				<BotonVolver onClick={() => setCambiando(false)}>Volver</BotonVolver>
				<h1 className="m-0 text-tablet-titulo tracking-tight">¿Qué operación?</h1>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
					{conListas(bulto.pasos, personaId).map((otro) => (
						<Opcion
							key={otro.flujoOperacionId}
							titulo={otro.operacion}
							detalle={plural(otro.tope, "lista", "listas")}
							{...(otro.personaBaseId === personaId ? { tono: "suya" as const } : {})}
							onClick={() => {
								setOperacionId(otro.flujoOperacionId);
								setBuenas(otro.tope);
								setDanadas(0);
								setCambiando(false);
							}}
						/>
					))}
				</div>
			</section>
		);
	}
	const piezas = buenas + danadas;
	const pasa = piezas > paso.tope;
	const tarifa = tarifaDe(paso.flujoOperacionId);
	return (
		<section className="mx-auto flex max-w-225 flex-col gap-4.5">
			<BotonVolver onClick={alVolver}>Volver</BotonVolver>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<b className="text-[16px] text-tinta3">{bulto.folio}</b>
					<h1 className="my-0.5 text-tablet-titulo tracking-tight">{bulto.prendaYTalla}</h1>
					<span className="font-semibold text-[16px] text-tinta2">{bulto.deQuien}</span>
				</div>
				<div className="rounded-[14px] bg-tinta px-4.5 py-3 text-white">
					<small className="block font-semibold text-[13px] text-linea2">Operación</small>
					<b className="text-[24px]">{paso.operacion}</b>
					{tarifa === undefined ? null : (
						<small className="block font-semibold text-[13px] text-linea2">
							{tarifa === null ? "Sin tarifa todavía" : `${enPesos(tarifa)} por pieza`}
						</small>
					)}
					<button
						type="button"
						className="mt-1 block font-bold text-aviso-bien underline"
						onClick={() => setCambiando(true)}
					>
						Cambiar
					</button>
				</div>
			</div>
			<MensajeDeTablet tono="azul">
				Tope <b className="text-[34px] font-extrabold tabular-nums">{paso.tope}</b> {paso.deDonde}
			</MensajeDeTablet>
			<div className="grid grid-cols-2 gap-3.5 max-telefono:grid-cols-1">
				<Contador etiqueta="Buenas" valor={buenas} alCambiar={setBuenas} tono="bien" />
				<Contador etiqueta="Dañadas" valor={danadas} alCambiar={setDanadas} tono="mal" />
			</div>
			{pasa ? (
				<MensajeDeTablet tono="rojo">
					No puede pasar de {paso.tope}: es lo que salió de la operación anterior
				</MensajeDeTablet>
			) : null}
			<BotonGrande
				icono={Check}
				disabled={piezas === 0 || pasa}
				onClick={() => alRegistrar({ flujoOperacionId: paso.flujoOperacionId, buenas, danadas })}
			>
				Registrar {plural(piezas, "pieza", "piezas")}
			</BotonGrande>
		</section>
	);
}
