/**
 * La ventana «Reclamo nuevo», con `calidad.opciones_reclamo`: Cliente · «Código de la prenda» (con él se ven la prenda
 * y la talla) · Lote (los revisados de esa prenda; si hay uno, ya puesto) · Nota de entrega (opcional) · Defecto ·
 * «Operación que lo causó» · «Quién la hizo» (propone quien más piezas hizo) · Piezas · «Qué dice el cliente».
 * «Registrar reclamo» llama `calidad.registrar_reclamo` y deja escogido el reclamo con su rastreo.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Reclamo nuevo»)
 *
 * Los lotes, las operaciones y la persona que se propone llegan de la consulta: la pantalla solo los ofrece.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { opcionesDeReclamo } from "@uniformame/compartido/contratos/calidad/consultas-reclamos";
import { registrarReclamo } from "@uniformame/compartido/contratos/calidad/reclamos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { loQueCambiaEnCalidad } from "../invalidar.ts";

/** Lo que captura la ventana. */
type Captura = z.input<typeof registrarReclamo.entrada>;

/** Lo de un campo opcional: vacío no viaja. */
const opcional = { setValueAs: (valor: string) => (valor === "" ? undefined : valor) };

/** La captura vacía. */
const vacia: Captura = {
	origen: "cliente_externo",
	codigo: "",
	lote_id: "",
	defecto_id: "",
	flujo_operacion_id: "",
	piezas: 1,
	que_dice_cliente: "",
};

/**
 * La ventana del reclamo nuevo.
 * @param props Si está abierta, qué hacer al cerrarla y qué hacer con el reclamo registrado.
 */
export function VentanaReclamoNuevo({
	abierta,
	alCerrar,
	alRegistrar,
}: {
	abierta: boolean;
	alCerrar: () => void;
	alRegistrar: (reclamoId: string) => void;
}) {
	const conConexion = useConConexion();
	const formulario = useForm<Captura>({ resolver: zodResolver(registrarReclamo.entrada), defaultValues: vacia });
	const registrar = useAccion(registrarReclamo, loQueCambiaEnCalidad);
	const [clienteTexto, setClienteTexto] = useState("");
	// Al abrir, vacía.
	useEffect(() => {
		if (!abierta) return;
		formulario.reset(vacia);
		setClienteTexto("");
		registrar.reset();
	}, [abierta, formulario, registrar.reset]);
	const [clienteId, codigo, defectoId, loteId, flujoOperacionId] = formulario.watch([
		"cliente_id",
		"codigo",
		"defecto_id",
		"lote_id",
		"flujo_operacion_id",
	]);
	const consulta = useConsulta(
		opcionesDeReclamo,
		{
			cliente_texto: clienteTexto,
			codigo,
			...(clienteId === undefined ? {} : { cliente_id: clienteId }),
			...(defectoId === "" ? {} : { defecto_id: defectoId }),
			...(loteId === "" ? {} : { lote_id: loteId }),
		},
		abierta,
		// Mientras llegan las opciones de lo nuevo escrito, se quedan las de antes: si la lista se vaciara un momento,
		// el selector perdería el lote ya escogido.
		true,
	);
	const opciones = consulta.data;
	// Si hay un solo lote revisado de esa prenda, ya puesto.
	useEffect(() => {
		const [unico] = opciones?.lotes ?? [];
		if (opciones?.lotes.length === 1 && unico !== undefined && formulario.getValues("lote_id") === "") {
			formulario.setValue("lote_id", unico.id);
		}
	}, [opciones?.lotes, formulario]);
	// La operación: la primera que suele causar el defecto en ese lote, con la persona que se propone.
	useEffect(() => {
		const operaciones = opciones?.operaciones ?? [];
		if (operaciones.some((operacion) => operacion.id === formulario.getValues("flujo_operacion_id"))) return;
		const [primera] = operaciones;
		formulario.setValue("flujo_operacion_id", primera?.id ?? "");
		formulario.setValue("persona_id", primera?.persona_id ?? undefined);
	}, [opciones?.operaciones, formulario]);
	const falla = registrar.error === null ? null : leerFalla(registrar.error);
	const errorDe = (campo: keyof Captura) =>
		formulario.formState.errors[campo]?.message ?? (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	/** El cliente escogido: el de la lista cuyo nombre es lo escrito. */
	const alEscribirCliente = (texto: string) => {
		setClienteTexto(texto);
		const cliente = opciones?.clientes.find((uno) => uno.nombre === texto);
		formulario.setValue("cliente_id", cliente?.id);
	};
	const opcionesDe = (lista: readonly { id: string; nombre: string }[] | undefined) =>
		(lista ?? []).map((una) => ({ valor: una.id, texto: una.nombre }));
	return (
		<Ventana
			abierta={abierta}
			alCerrar={alCerrar}
			titulo="Reclamo nuevo"
			ancha
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || registrar.isPending}
					onClick={formulario.handleSubmit((datos) =>
						registrar.mutate({ datos }, { onSuccess: (resultado) => alRegistrar(resultado.reclamo_id) }),
					)}
				>
					Registrar reclamo
				</Boton>
			}
		>
			<div className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Campo
					etiqueta="Cliente"
					enVentana
					list="clientes-del-reclamo"
					value={clienteTexto}
					autoComplete="off"
					error={errorDe("cliente_id")}
					onChange={(evento) => alEscribirCliente(evento.target.value)}
				/>
				<datalist id="clientes-del-reclamo">
					{(opciones?.clientes ?? []).map((cliente) => (
						<option key={cliente.id} value={cliente.nombre} />
					))}
				</datalist>
				<div className="flex flex-col gap-1">
					<Campo
						etiqueta="Código de la prenda"
						enVentana
						inputMode="numeric"
						maxLength={6}
						error={errorDe("codigo")}
						{...formulario.register("codigo")}
					/>
					{opciones?.prenda == null ? null : (
						<span className="text-etiqueta text-tinta2">{opciones.prenda.titulo}</span>
					)}
				</div>
				<Selector
					etiqueta="Lote"
					enVentana
					vacio="Escoge el lote"
					opciones={opcionesDe(opciones?.lotes)}
					error={errorDe("lote_id")}
					{...formulario.register("lote_id")}
				/>
				<Selector
					etiqueta="Nota de entrega"
					enVentana
					vacio="Sin nota de entrega"
					opciones={opcionesDe(opciones?.notas)}
					{...formulario.register("nota_entrega_id", opcional)}
				/>
				<Selector
					etiqueta="Defecto"
					enVentana
					vacio="Escoge el defecto"
					opciones={opcionesDe(opciones?.defectos)}
					error={errorDe("defecto_id")}
					{...formulario.register("defecto_id")}
				/>
				<Selector
					etiqueta="Operación que lo causó"
					enVentana
					vacio="Escoge la operación"
					opciones={opcionesDe(opciones?.operaciones)}
					error={errorDe("flujo_operacion_id")}
					{...formulario.register("flujo_operacion_id", {
						onChange: (evento: { target: { value: string } }) =>
							formulario.setValue(
								"persona_id",
								opciones?.operaciones.find((operacion) => operacion.id === evento.target.value)?.persona_id ??
									undefined,
							),
					})}
				/>
				<Selector
					etiqueta="Quién la hizo"
					enVentana
					vacio="Escoge a la persona"
					opciones={opcionesDe(opciones?.personas)}
					error={errorDe("persona_id")}
					value={formulario.watch("persona_id") ?? ""}
					onChange={(evento) =>
						formulario.setValue("persona_id", evento.target.value === "" ? undefined : evento.target.value)
					}
				/>
				<Campo
					etiqueta="Piezas"
					enVentana
					type="number"
					min={1}
					error={errorDe("piezas")}
					{...formulario.register("piezas", { valueAsNumber: true })}
				/>
				<div className="col-span-2 max-telefono:col-span-1">
					<Campo
						etiqueta="Qué dice el cliente"
						enVentana
						maxLength={500}
						error={errorDe("que_dice_cliente")}
						{...formulario.register("que_dice_cliente")}
					/>
				</div>
				{flujoOperacionId === "" && loteId !== "" && defectoId !== "" && opciones !== undefined ? (
					<div className="col-span-2 max-telefono:col-span-1">
						<LineaDeAviso tono="advertencia">Ninguna operación de ese lote suele causar ese defecto.</LineaDeAviso>
					</div>
				) : null}
			</div>
		</Ventana>
	);
}
