/**
 * El cajón del desarrollo (ancho), que se abre con `?cajon=desarrollo&id={desarrollo}`: «{DS} · {escuela o Básico o
 * general}» y la prenda; la barra de pasos; los datos («Cliente» o «Para», «Solicitó», «Muestra», «En catálogo»); la
 * «Ficha técnica básica»; sin escuela y en aprobación, su autorización; el «Historial»; y los botones de su etapa, que
 * llegan de `patronaje.desarrollo` y llaman sus acciones tal cual.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Cajones»: Del desarrollo) y docs/modulos/patronaje/desarrollos.md
 */

import { useQueryClient } from "@tanstack/react-query";
import {
	empezarMuestra,
	entregarMuestra,
	registrarAprobacionCliente,
} from "@uniformame/compartido/contratos/patronaje/desarrollos";
import { desarrolloDePatronaje } from "@uniformame/compartido/contratos/patronaje/tablero-de-desarrollos";
import { Pasos } from "@uniformame/interfaz/avance/pasos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { type ReactNode, useState } from "react";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta, volverALeer } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { direcciones, useDireccion } from "../direccion.ts";
import { loQueCambiaEnPatronaje } from "../invalidar.ts";
import { type DesarrolloConMotivo, VentanaMotivoDelDesarrollo } from "../ventanas/motivo-del-desarrollo.tsx";

/** Lo que regresa `patronaje.desarrollo`. */
type Desarrollo = z.infer<typeof desarrolloDePatronaje.resultado>;

/** Los pasos de la barra, en su orden. */
const pasos = ["Solicitud", "Muestra", "Aprobación", "Ficha técnica", "En catálogo"];

/** El cajón de un desarrollo. */
export function CajonDesarrollo() {
	const { abierto, cerrar } = useDireccion();
	const desarrolloId = abierto("desarrollo");
	const consulta = useConsulta(
		desarrolloDePatronaje,
		{ desarrollo_id: desarrolloId ?? "" },
		desarrolloId !== undefined,
	);
	const datos = consulta.data;
	const [ventana, setVentana] = useState<"cambios" | "descartar" | null>(null);
	const conMotivo: DesarrolloConMotivo | null =
		datos === undefined
			? null
			: {
					desarrollo_id: datos.desarrollo_id,
					folio: datos.folio,
					version: datos.version,
					prenda: datos.prenda,
					para: datos.para.nombre,
				};
	return (
		<>
			<Cajon
				abierto={desarrolloId !== undefined}
				alCerrar={cerrar}
				ancho
				contexto={datos === undefined ? "Desarrollo" : `${datos.folio} · ${datos.para.nombre}`}
				titulo={datos?.prenda ?? ""}
				{...(datos?.botones.includes("descartar") === true
					? {
							pieIzquierda: (
								<Boton variante="peligro" onClick={() => setVentana("descartar")}>
									Descartar con motivo
								</Boton>
							),
						}
					: {})}
				{...(datos === undefined
					? {}
					: { accion: <BotonesDeLaEtapa datos={datos} alPedirCambios={() => setVentana("cambios")} /> })}
			>
				{consulta.isPending ? (
					<EstadoDePantalla tipo="cargando" />
				) : datos === undefined ? (
					<EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />
				) : (
					<CuerpoDelDesarrollo datos={datos} />
				)}
			</Cajon>
			<VentanaMotivoDelDesarrollo
				cual="cambios"
				desarrollo={ventana === "cambios" ? conMotivo : null}
				alCerrar={() => setVentana(null)}
			/>
			<VentanaMotivoDelDesarrollo
				cual="descartar"
				desarrollo={ventana === "descartar" ? conMotivo : null}
				alCerrar={() => setVentana(null)}
			/>
		</>
	);
}

/**
 * Un dato del cajón: su nombre en chico y su valor.
 * @param props El nombre y el valor.
 */
function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-mediano bg-suave p-3">
			<dt className="text-etiqueta text-tinta3">{nombre}</dt>
			<dd className="m-0 font-semibold text-tinta">{children}</dd>
		</div>
	);
}

/**
 * Los pasos, los datos, la ficha técnica, la autorización y el historial.
 * @param props Lo que regresa la consulta.
 */
function CuerpoDelDesarrollo({ datos }: { datos: Desarrollo }) {
	const { irA } = useDireccion();
	const enCatalogo = datos.datos.en_catalogo;
	return (
		<div className="flex flex-col gap-5">
			{datos.paso < 0 ? null : <Pasos pasos={pasos} actual={datos.paso} />}
			<dl className="m-0 grid grid-cols-4 gap-3 max-telefono:grid-cols-2">
				<Dato nombre={datos.con_escuela ? "Cliente" : "Para"}>{datos.para.nombre}</Dato>
				<Dato nombre="Solicitó">{datos.datos.solicito}</Dato>
				<Dato nombre="Muestra">{datos.datos.muestra}</Dato>
				<Dato nombre="En catálogo">
					{enCatalogo === null ? (
						"Todavía no"
					) : (
						<Boton variante="fantasma" chico onClick={() => irA(direcciones.receta(enCatalogo.producto_id))}>
							{enCatalogo.nombre}
						</Boton>
					)}
				</Dato>
			</dl>
			<section className="flex flex-col gap-2">
				<h3 className="m-0 font-bold text-subtitulo">Ficha técnica básica</h3>
				<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
					<dt className="font-semibold text-tinta2">Qué pidieron</dt>
					<dd className="m-0">{datos.ficha.que_pidieron === "" ? "—" : datos.ficha.que_pidieron}</dd>
					<dt className="font-semibold text-tinta2">Tela</dt>
					<dd className="m-0">{datos.ficha.tela}</dd>
					<dt className="font-semibold text-tinta2">Tallas</dt>
					<dd className="m-0">{datos.ficha.tallas}</dd>
					<dt className="font-semibold text-tinta2">Receta</dt>
					<dd className="m-0">{datos.ficha.receta}</dd>
				</dl>
			</section>
			{datos.autorizacion === null ? null : <p className="m-0 font-semibold text-tinta2">{datos.autorizacion}</p>}
			<section className="flex flex-col gap-2">
				<h3 className="m-0 font-bold text-subtitulo">Historial</h3>
				<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
					{datos.historial.map((paso) => (
						<li key={paso.paso_id} className="flex justify-between gap-4 py-2">
							<span>
								<b>{paso.quien}</b> {paso.que}
							</span>
							<time className="whitespace-nowrap text-tinta3">{paso.fecha}</time>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

/**
 * Los botones de la etapa, a la derecha del pie: cada uno llama su acción con la versión del desarrollo; si otro lo
 * cambió mientras se veía, se vuelve a leer.
 * @param props Lo que regresa la consulta y qué hacer al pedir cambios.
 */
function BotonesDeLaEtapa({ datos, alPedirCambios }: { datos: Desarrollo; alPedirCambios: () => void }) {
	const conConexion = useConConexion();
	const consultas = useQueryClient();
	const { irA } = useDireccion();
	const empezar = useAccion(empezarMuestra, loQueCambiaEnPatronaje);
	const entregar = useAccion(entregarMuestra, loQueCambiaEnPatronaje);
	const aprobar = useAccion(registrarAprobacionCliente, loQueCambiaEnPatronaje);
	const ocupado = !conConexion || empezar.isPending || entregar.isPending || aprobar.isPending;
	const peticion = { datos: { desarrollo_id: datos.desarrollo_id }, version: datos.version };
	// Con un choque, se vuelve a leer el desarrollo como quedó.
	const alFallar = { onError: () => void volverALeer(consultas, loQueCambiaEnPatronaje) };
	const choque = [empezar, entregar, aprobar].some(
		(accion) => accion.error !== null && leerFalla(accion.error).tipo === "choque",
	);
	const enCatalogo = datos.datos.en_catalogo;
	return (
		<span className="flex flex-wrap items-center justify-end gap-2">
			{choque ? (
				<span className="text-etiqueta text-texto-advertencia">{`${datos.folio} cambió mientras lo veías`}</span>
			) : null}
			{datos.botones.includes("pedir_cambios") ? (
				<Boton disabled={ocupado} onClick={alPedirCambios}>
					{datos.con_escuela ? "Pidió cambios" : "Pidieron cambios"}
				</Boton>
			) : null}
			{datos.botones.includes("empezar_muestra") ? (
				<Boton variante="principal" disabled={ocupado} onClick={() => empezar.mutate(peticion, alFallar)}>
					Empezar muestra
				</Boton>
			) : null}
			{datos.botones.includes("entregar_muestra") ? (
				<Boton variante="principal" disabled={ocupado} onClick={() => entregar.mutate(peticion, alFallar)}>
					{datos.con_escuela ? "Muestra entregada al cliente" : "Muestra lista para aprobar"}
				</Boton>
			) : null}
			{datos.botones.includes("aprobo_cliente") ? (
				<Boton variante="principal" disabled={ocupado} onClick={() => aprobar.mutate(peticion, alFallar)}>
					El cliente aprobó
				</Boton>
			) : null}
			{datos.botones.includes("alta_en_catalogo") ? (
				<Boton variante="principal" onClick={() => irA(direcciones.altaEnCatalogo(datos.desarrollo_id))}>
					Dar de alta en catálogo
				</Boton>
			) : null}
			{datos.botones.includes("abrir_receta") && enCatalogo !== null ? (
				<Boton variante="principal" onClick={() => irA(direcciones.receta(enCatalogo.producto_id))}>
					Abrir receta
				</Boton>
			) : null}
		</span>
	);
}
