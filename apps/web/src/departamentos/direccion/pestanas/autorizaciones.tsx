/**
 * La pestaña Autorizaciones de Dirección: los filtros por tipo, una tarjeta por autorización que espera (con
 * «Rechazar» y «Autorizar») y la tabla de las resueltas, que solo se lee.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Autorizaciones»)
 *
 * La tarjeta muestra lo que la consulta trae armado: su folio AU- (el que nombra el choque de versión), qué se pide, su detalle, «Lo pidió {persona}», «Pedida por ti» y
 * «{n} días esperando». Si la cuenta no la puede decidir (un alta de usuario sin ser la dueña), los botones van
 * apagados con el porqué.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	type autorizaciones,
	nombreDelTipoDeAutorizacion,
} from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Check } from "lucide-react";
import type { z } from "zod";

/** Lo que trae `direccion.autorizaciones`. */
type Datos = z.infer<typeof autorizaciones.resultado>;
/** Una autorización que espera. */
export type PorAutorizar = Datos["por_autorizar"][number];
/** Una resuelta. */
type Resuelta = Datos["resueltas"][number];

/** Cómo se dice cada resultado y su color. */
const resultado = {
	autorizada: { texto: "Autorizado", color: "verde" },
	rechazada: { texto: "Rechazado", color: "rojo" },
	cancelada: { texto: "Cancelada", color: "rojo" },
} as const;

/** Lo que recibe la pestaña. */
export interface PropsDeAutorizaciones {
	datos: Datos;
	/** El tipo del filtro, de la dirección; «todas» sin filtro. */
	filtro: string;
	alEscogerFiltro: (filtro: string) => void;
	/** Si se puede decidir ahora (con conexión y sin otra decisión en camino). */
	puede: boolean;
	alAutorizar: (autorizacion: PorAutorizar) => void;
	alRechazar: (autorizacion: PorAutorizar) => void;
}

/**
 * La tarjeta de una autorización que espera.
 * @param props La autorización, si se puede decidir ahora y qué hacer con cada botón.
 */
function TarjetaDeAutorizacion({
	autorizacion,
	puede,
	alAutorizar,
	alRechazar,
}: { autorizacion: PorAutorizar } & Pick<PropsDeAutorizaciones, "puede" | "alAutorizar" | "alRechazar">) {
	const apagada = !puede || !autorizacion.puede_decidir;
	return (
		<Tarjeta nombre={autorizacion.resumen}>
			<header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span className="font-bold text-etiqueta text-tinta2 uppercase">
					{nombreDelTipoDeAutorizacion[autorizacion.tipo]}
				</span>
				<span className="text-etiqueta text-tinta3">
					<b className="font-bold text-tinta2 tabular-nums">{autorizacion.folio}</b> · {autorizacion.departamento} ·{" "}
					{textoDeDiaCorto(autorizacion.pedida_el)}
					{autorizacion.esperando === null ? null : (
						<>
							{" · "}
							<span className="font-bold text-texto-advertencia">{autorizacion.esperando}</span>
						</>
					)}
				</span>
			</header>
			<b className="font-bold text-subtitulo leading-snug">{autorizacion.resumen}</b>
			{autorizacion.detalle === null ? null : <span className="text-tinta2">{autorizacion.detalle}</span>}
			<footer className="mt-2 flex flex-wrap items-center gap-3">
				{autorizacion.pedida_por === null ? null : (
					<span className="text-etiqueta text-tinta2">Lo pidió {autorizacion.pedida_por}</span>
				)}
				{autorizacion.pedida_por_ti ? (
					<span className="font-bold text-etiqueta text-texto-advertencia">Pedida por ti</span>
				) : null}
				{autorizacion.no_puede_porque === null ? null : (
					<span className="text-etiqueta text-tinta3">{autorizacion.no_puede_porque}</span>
				)}
				<span className="ml-auto flex gap-2">
					<Boton chico variante="fantasma" disabled={apagada} onClick={() => alRechazar(autorizacion)}>
						Rechazar
					</Boton>
					<Boton chico variante="principal" icono={Check} disabled={apagada} onClick={() => alAutorizar(autorizacion)}>
						Autorizar
					</Boton>
				</span>
			</footer>
		</Tarjeta>
	);
}

/**
 * La celda del resultado de una resuelta: su estado, el motivo abajo y si la pidió y autorizó la misma persona.
 * @param props La resuelta.
 */
function Resultado({ resuelta }: { resuelta: Resuelta }) {
	const suyo = resultado[resuelta.resultado];
	return (
		<span className="flex flex-col items-start gap-1 py-1">
			<Estado texto={suyo.texto} color={suyo.color} />
			{resuelta.motivo === null ? null : <span className="text-etiqueta text-tinta2">{resuelta.motivo}</span>}
			{resuelta.misma_persona ? (
				<span className="text-etiqueta text-tinta2">pedida y autorizada por la misma persona</span>
			) : null}
		</span>
	);
}

/**
 * La pestaña Autorizaciones.
 * @param props Los datos, el filtro y qué hacer con cada botón.
 */
export function PestanaAutorizaciones({
	datos,
	filtro,
	alEscogerFiltro,
	puede,
	alAutorizar,
	alRechazar,
}: PropsDeAutorizaciones) {
	return (
		<>
			<Filtros
				nombre="Filtrar autorizaciones"
				activo={filtro}
				alEscoger={alEscogerFiltro}
				filtros={datos.filtros.map((uno) => ({ clave: uno.tipo ?? "todas", texto: uno.nombre, conteo: uno.cuantas }))}
			/>
			{datos.por_autorizar.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Nada espera tu autorización" bien />
			) : (
				<div className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
					{datos.por_autorizar.map((autorizacion) => (
						<TarjetaDeAutorizacion
							key={autorizacion.id}
							autorizacion={autorizacion}
							puede={puede}
							alAutorizar={alAutorizar}
							alRechazar={alRechazar}
						/>
					))}
				</div>
			)}
			<section aria-labelledby="titulo-resueltas" className="rounded-grande bg-panel p-5 shadow-panel">
				<h2 id="titulo-resueltas" className="m-0 mb-3 font-bold text-subtitulo">
					Resueltas
				</h2>
				<Tabla
					nombre="Resueltas"
					filas={datos.resueltas}
					claveDeFila={(resuelta) => resuelta.id}
					columnas={[
						{ clave: "fecha", encabezado: "Fecha", celda: (resuelta) => textoDeDiaCorto(resuelta.resuelta_el) },
						{ clave: "que", encabezado: "Qué", celda: (resuelta) => nombreDelTipoDeAutorizacion[resuelta.tipo] },
						{ clave: "detalle", encabezado: "Detalle", celda: (resuelta) => resuelta.resumen },
						{ clave: "resultado", encabezado: "Resultado", celda: (resuelta) => <Resultado resuelta={resuelta} /> },
					]}
				/>
			</section>
		</>
	);
}
