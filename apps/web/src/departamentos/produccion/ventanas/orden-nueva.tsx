/**
 * La ventana «Orden de producción nueva» (ancha), con `produccion.opciones_orden_nueva`: Para («Temporada · bodega» o
 * una tienda activa), Prenda (las que pasan por el taller; sin receta, su aviso), piezas por talla (una casilla por
 * talla vigente, «especial» donde aplica y el total; la descontinuada, apagada: «ya no se fabrica»), «Para cuándo»
 * (propone la que da la consulta) y Motivo. «Levantar orden» llama `produccion.crear_orden`.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Ventanas»: «Orden de producción nueva»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { crearOrden } from "@uniformame/compartido/contratos/produccion/ordenes";
import { opcionesOrdenNueva } from "@uniformame/compartido/contratos/produccion/ordenes-de-produccion";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";
import { LineaDeAviso } from "../piezas.tsx";

/** Lo que se captura: la entrada de `produccion.crear_orden`. */
type Captura = z.input<typeof crearOrden.entrada>;

/**
 * La ventana de la orden nueva.
 * @param props Si está abierta y qué hacer al cerrarla.
 */
export function VentanaOrdenNueva({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const [texto, setTexto] = useState("");
	const opciones = useConsulta(opcionesOrdenNueva, { texto }, abierta);
	const formulario = useForm<Captura>({
		resolver: zodResolver(crearOrden.entrada),
		defaultValues: { ubicacion_destino_id: "", producto_id: "", tallas: [], fecha_entrega: "", motivo: "" },
	});
	const levantar = useAccion(crearOrden, loQueCambiaEnProduccion);
	const productoId = formulario.watch("producto_id");
	const tallas = formulario.watch("tallas");
	const prenda = opciones.data?.prendas.find((una) => una.producto_id === productoId);
	const propuesta = opciones.data?.entrega_propuesta;
	// «Para cuándo» propone la entrega que da la consulta; Para empieza en la temporada.
	useEffect(() => {
		if (!abierta || propuesta === undefined || formulario.getValues("fecha_entrega") !== "") return;
		formulario.setValue("fecha_entrega", propuesta);
		formulario.setValue("ubicacion_destino_id", opciones.data?.destinos[0]?.ubicacion_id ?? "");
	}, [abierta, propuesta, formulario, opciones.data]);
	// Al escoger la prenda, una casilla por talla que se fabrica, en cero.
	useEffect(() => {
		formulario.setValue(
			"tallas",
			(prenda?.tallas ?? [])
				.filter((talla) => !talla.descontinuada)
				.map((talla) => ({ variante_id: talla.variante_id, piezas: 0 })),
		);
	}, [prenda, formulario]);
	const falla = levantar.error === null ? null : leerFalla(levantar.error);
	const errorDe = (campo: keyof Captura) =>
		formulario.formState.errors[campo]?.message ?? (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	const total = tallas.reduce((suma, talla) => suma + (Number.isFinite(talla.piezas) ? talla.piezas : 0), 0);
	const cerrar = () => {
		formulario.reset();
		setTexto("");
		levantar.reset();
		alCerrar();
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			ancha
			titulo="Orden de producción nueva"
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || levantar.isPending}
					onClick={formulario.handleSubmit((datos) =>
						levantar.mutate(
							{ datos: { ...datos, ...(datos.motivo === "" ? { motivo: undefined } : {}) } },
							{ onSuccess: cerrar },
						),
					)}
				>
					Levantar orden
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Selector
					etiqueta="Para"
					enVentana
					opciones={(opciones.data?.destinos ?? []).map((destino) => ({
						valor: destino.ubicacion_id,
						texto: destino.nombre,
					}))}
					error={errorDe("ubicacion_destino_id")}
					{...formulario.register("ubicacion_destino_id")}
				/>
				<Campo etiqueta="Buscar prenda" enVentana value={texto} onChange={(evento) => setTexto(evento.target.value)} />
				<Selector
					etiqueta="Prenda"
					enVentana
					vacio="Escoge la prenda"
					opciones={(opciones.data?.prendas ?? []).map((una) => ({ valor: una.producto_id, texto: una.nombre }))}
					error={errorDe("producto_id")}
					{...formulario.register("producto_id")}
				/>
				{prenda !== undefined && !prenda.con_receta ? (
					<LineaDeAviso tono="error">Sin receta: no se corta hasta que Patronaje la capture</LineaDeAviso>
				) : null}
				{prenda === undefined ? null : (
					<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
						<legend className="mb-2 font-semibold text-etiqueta text-tinta2">Piezas por talla</legend>
						<div className="grid grid-cols-4 gap-3 max-telefono:grid-cols-2">
							{prenda.tallas.map((talla) => {
								const lugar = tallas.findIndex((una) => una.variante_id === talla.variante_id);
								return talla.descontinuada || lugar < 0 ? (
									<Campo
										key={talla.variante_id}
										etiqueta={`${talla.talla} · ya no se fabrica`}
										enVentana
										disabled
										value=""
									/>
								) : (
									<Campo
										key={talla.variante_id}
										etiqueta={talla.especial ? `${talla.talla} · especial` : talla.talla}
										enVentana
										type="number"
										min={0}
										inputMode="numeric"
										{...formulario.register(`tallas.${lugar}.piezas`, { valueAsNumber: true })}
									/>
								);
							})}
						</div>
						<span className="text-right font-semibold tabular-nums">Total: {total}</span>
						{errorDe("tallas") === undefined ? null : <LineaDeAviso tono="error">{errorDe("tallas")}</LineaDeAviso>}
					</fieldset>
				)}
				<Campo
					etiqueta="Para cuándo"
					enVentana
					type="date"
					error={errorDe("fecha_entrega")}
					{...formulario.register("fecha_entrega")}
				/>
				<Campo
					etiqueta="Motivo"
					enVentana
					maxLength={120}
					error={errorDe("motivo")}
					{...formulario.register("motivo")}
				/>
			</div>
		</Ventana>
	);
}
