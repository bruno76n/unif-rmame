/**
 * El cajón del cliente nuevo y de los datos del cliente: su ficha, su escuela (en el alta), su lista y su crédito (al
 * editar); «Dar de alta» (o «Dar de alta y usar en el pedido»), «Guardar cambios» y «Dar de baja» con su ventana.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Cliente nuevo y Datos del cliente», «Ventanas»)
 *
 * Lo capturado se revisa con el esquema del contrato de la acción; los mensajes de cada campo son los suyos, y los
 * candados de la baja (pedidos abiertos, saldo) los dice la acción.
 */

import {
	crearCliente,
	darBajaCliente,
	editarCliente,
	tiposDeCliente,
} from "@uniformame/compartido/contratos/ventas/clientes";
import { clienteVentas } from "@uniformame/compartido/contratos/ventas/consultas-clientes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que da la consulta. */
type DelCliente = z.infer<typeof clienteVentas.resultado>;

/** Los campos de la ficha, como se capturan. */
interface Ficha {
	nombre: string;
	tipo: string;
	escuela_id: string;
	municipio: string;
	direccion_entrega: string;
	contacto: string;
	telefono: string;
	correo: string;
	rfc: string;
}

/** Cómo se lee cada tipo de cliente. */
const textosDeTipo: Readonly<Record<(typeof tiposDeCliente)[number], string>> = {
	escuela: "Escuela",
	mayorista: "Mayorista",
	empresa_otro: "Empresa u otro",
};

/** Los campos de texto de la ficha, con su etiqueta. */
const camposDeTexto: readonly [keyof Ficha, string][] = [
	["municipio", "Municipio"],
	["direccion_entrega", "Dirección de entrega"],
	["contacto", "Contacto"],
	["telefono", "Teléfono"],
	["correo", "Correo (opcional)"],
	["rfc", "RFC (opcional)"],
];

/**
 * Dice si un nombre es de un campo de la ficha (el error de la API o del esquema nombra su campo).
 * @param campo El nombre.
 */
function esCampoDeFicha(campo: string): campo is keyof Ficha {
	return [
		"nombre",
		"tipo",
		"escuela_id",
		"municipio",
		"direccion_entrega",
		"contacto",
		"telefono",
		"correo",
		"rfc",
	].includes(campo);
}

/**
 * Lo capturado sin los campos vacíos (los opcionales que no se escribieron).
 * @param ficha Lo capturado.
 */
function sinVacios(ficha: Partial<Ficha>): Record<string, string> {
	return Object.fromEntries(Object.entries(ficha).filter(([, valor]) => valor !== undefined && valor.trim() !== ""));
}

/**
 * El formulario del cliente con lo que dio su consulta.
 * @param props Lo de la consulta, si se abrió desde un pedido y qué hacer al cerrar.
 */
function FormularioDeCliente({
	datos,
	desdePedido,
	alCerrar,
}: {
	datos: DelCliente;
	desdePedido: boolean;
	alCerrar: (clienteId?: string) => void;
}) {
	const cliente = datos.cliente;
	const formulario = useForm<Ficha>({
		defaultValues: {
			nombre: cliente?.nombre ?? "",
			tipo: cliente?.tipo ?? "",
			escuela_id: "",
			municipio: cliente?.municipio ?? "",
			direccion_entrega: cliente?.direccion_entrega ?? "",
			contacto: cliente?.contacto ?? "",
			telefono: cliente?.telefono ?? "",
			correo: cliente?.correo ?? "",
			rfc: cliente?.rfc ?? "",
		},
	});
	const conConexion = useConConexion();
	const crear = useEnvio(crearCliente);
	const editar = useEnvio(editarCliente);
	const baja = useEnvio(darBajaCliente);
	const [dandoDeBaja, setDandoDeBaja] = useState(false);
	const tipo = formulario.watch("tipo");
	const nombre = formulario.watch("nombre");
	/** Pone en cada campo su mensaje, el del contrato o el de la API. */
	const marcar = (campos: Record<string, string>) => {
		for (const [campo, mensaje] of Object.entries(campos)) {
			if (esCampoDeFicha(campo)) formulario.setError(campo, { message: mensaje });
		}
	};
	const guardar = formulario.handleSubmit(async (ficha) => {
		if (cliente === null) {
			const revisado = crearCliente.entrada.safeParse({
				...sinVacios(ficha),
				...(desdePedido ? { desde_pedido: true } : {}),
			});
			if (!revisado.success) {
				marcar(
					Object.fromEntries(revisado.error.issues.map((problema) => [String(problema.path[0]), problema.message])),
				);
				return;
			}
			const hecho = await crear.enviar({ datos: revisado.data }, marcar);
			if (hecho !== undefined) alCerrar(hecho.cliente_id);
			return;
		}
		// Al editar solo viaja lo que cambió; un opcional que se borra va vacío.
		const cambiados = Object.fromEntries(
			(["nombre", "municipio", "direccion_entrega", "contacto", "telefono", "correo", "rfc"] as const)
				.filter((campo) => (ficha[campo] ?? "") !== (cliente[campo] ?? ""))
				.map((campo) => [
					campo,
					ficha[campo].trim() === "" && ["contacto", "correo", "rfc"].includes(campo) ? null : ficha[campo],
				]),
		);
		const revisado = editarCliente.entrada.safeParse({ cliente_id: cliente.cliente_id, ...cambiados });
		if (!revisado.success) {
			marcar(Object.fromEntries(revisado.error.issues.map((problema) => [String(problema.path[0]), problema.message])));
			return;
		}
		const hecho = await editar.enviar({ datos: revisado.data, version: cliente.version }, marcar);
		if (hecho !== undefined) alCerrar();
	});
	const errores = formulario.formState.errors;
	const enviando = crear.enviando || editar.enviando;
	return (
		<>
			<Cajon
				abierto
				alCerrar={() => alCerrar()}
				conCambios={formulario.formState.isDirty}
				contexto={
					cliente === null
						? `Cliente nuevo${desdePedido ? " · Regresa al pedido" : ""}`
						: `Datos del cliente · ${textosDeTipo[cliente.tipo]}`
				}
				titulo={nombre === "" ? "Cliente nuevo" : nombre}
				{...(cliente === null || cliente.de_baja
					? {}
					: {
							pieIzquierda: (
								<Boton variante="peligro" disabled={!conConexion} onClick={() => setDandoDeBaja(true)}>
									Dar de baja
								</Boton>
							),
						})}
				accion={
					<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void guardar()}>
						{cliente !== null ? "Guardar cambios" : desdePedido ? "Dar de alta y usar en el pedido" : "Dar de alta"}
					</Boton>
				}
			>
				<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
					{editar.choco && cliente !== null ? <EstadoDePantalla tipo="choque" documento={cliente.nombre} /> : null}
					<Campo etiqueta="Nombre" error={errores.nombre?.message} {...formulario.register("nombre")} />
					{cliente === null ? (
						<Selector
							etiqueta="Tipo"
							vacio="Escoge el tipo"
							opciones={tiposDeCliente.map((valor) => ({ valor, texto: textosDeTipo[valor] }))}
							error={errores.tipo?.message}
							{...formulario.register("tipo")}
						/>
					) : null}
					{cliente === null && tipo === "escuela" ? (
						<Selector
							etiqueta="Escuela"
							vacio="Escuela nueva, con su nombre"
							opciones={datos.escuelas.map((escuela) => ({ valor: escuela.escuela_id, texto: escuela.nombre }))}
							error={errores.escuela_id?.message}
							{...formulario.register("escuela_id")}
						/>
					) : null}
					{cliente?.escuela == null ? null : <Dato etiqueta="Escuela">{cliente.escuela}</Dato>}
					{camposDeTexto.map(([campo, etiqueta]) => (
						<Campo
							key={campo}
							etiqueta={etiqueta}
							{...(campo === "telefono" ? { inputMode: "numeric" as const } : {})}
							error={errores[campo]?.message}
							{...formulario.register(campo)}
						/>
					))}
					{cliente === null ? (
						<p className="m-0 text-tinta2">
							Compra con precios de mayoreo hasta que Catálogo le ponga su lista. Nace sin crédito: el límite lo pone
							Contaduría.
						</p>
					) : (
						<div className="grid grid-cols-2 gap-4">
							<Dato etiqueta="Lista de precios">{cliente.lista}</Dato>
							<Dato etiqueta="Crédito">
								<Estado texto={cliente.credito.texto} color={cliente.credito.color} />
							</Dato>
						</div>
					)}
				</form>
			</Cajon>
			{dandoDeBaja && cliente !== null ? (
				<VentanaConMotivo
					titulo={`Dar de baja a ${cliente.nombre}`}
					textoAccion="Dar de baja"
					enviando={baja.enviando}
					alCerrar={() => setDandoDeBaja(false)}
					alConfirmar={async (motivo) => {
						let error: string | undefined;
						const hecho = await baja.enviar(
							{ datos: { cliente_id: cliente.cliente_id, motivo }, version: cliente.version },
							(campos) => {
								error = campos.motivo;
							},
						);
						if (hecho !== undefined) {
							setDandoDeBaja(false);
							alCerrar();
						}
						return error;
					}}
				>
					<p className="m-0 text-tinta2">Ya no sale para pedidos nuevos. Sus pedidos, notas y pagos se conservan.</p>
				</VentanaConMotivo>
			) : null}
		</>
	);
}

/**
 * El cajón del cliente: el alta (sin cliente) o sus datos.
 * @param props El cliente, si se abrió desde un pedido y qué hacer al cerrar (con el cliente nuevo, si nació).
 */
export function CajonCliente({
	clienteId,
	desdePedido = false,
	alCerrar,
}: {
	clienteId?: string;
	desdePedido?: boolean;
	alCerrar: (clienteId?: string) => void;
}) {
	const consulta = useConsulta(clienteVentas, clienteId === undefined ? {} : { cliente_id: clienteId });
	if (consulta.data === undefined) {
		return (
			<Cajon abierto alCerrar={() => alCerrar()} titulo="">
				<SegunConsulta consulta={consulta}>{() => null}</SegunConsulta>
			</Cajon>
		);
	}
	return <FormularioDeCliente datos={consulta.data} desdePedido={desdePedido} alCerrar={alCerrar} />;
}
