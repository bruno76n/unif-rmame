/**
 * El cajón del pedido nuevo y de Modificar pedido (ancho): el cliente, la entrega, la forma de pago, las prendas con su
 * precio y sus piezas por talla, el buscador de prendas, los cambios de la versión, los totales y el pie según el modo.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido nuevo y Modificar pedido (ancho)»)
 *
 * Es una captura: cerrarla, cambiar de pestaña o salir por el menú con cambios pregunta antes. Lo capturado se revisa
 * con el mismo esquema del contrato antes de mandarlo; las reglas (el crédito, el precio, el mínimo, lo de más) las
 * revisa la acción, y su aviso o su error sale tal cual.
 */

import { useRouter } from "@tanstack/react-router";
import { centavosACampo, enPesos, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { precioUnitario, totalDe } from "@uniformame/compartido/calculos/ventas";
import {
	buscarPrendas,
	editorPedido,
	precioSugeridoVentas,
	type prendaDelEditor,
} from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import {
	confirmarPedido,
	formasDePago,
	guardarBorradorPedido,
	guardarVersionPedido,
} from "@uniformame/compartido/contratos/ventas/pedidos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Enlace } from "@uniformame/interfaz/botones/enlace";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon, textoCambiosSinGuardar } from "@uniformame/interfaz/contenedores/cajon";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Factory, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { consultar, useConsulta } from "../../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { useDireccionDeVentas } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { cambiosDeLaVersion } from "./cambios.ts";
import { CajonCliente } from "./cliente.tsx";

/** Lo que da la consulta del editor. */
type Editor = z.infer<typeof editorPedido.resultado>;

/** Una prenda del editor. */
type Prenda = z.infer<typeof prendaDelEditor>;

/** Una prenda como se captura: sus piezas por talla y su precio, en texto. */
interface PrendaCapturada {
	prenda: Prenda;
	precio: string;
	piezas: Record<string, string>;
}

/** Lo capturado del pedido. */
interface Captura {
	clienteId: string;
	fechaEntrega: string;
	formaPago: (typeof formasDePago)[number];
	prendas: PrendaCapturada[];
}

/**
 * Una prenda lista para capturar: sus piezas de hoy y su precio dado (o el sugerido).
 * @param prenda La prenda del editor.
 */
function paraCapturar(prenda: Prenda): PrendaCapturada {
	return {
		prenda,
		precio: centavosACampo(prenda.precio_dado_centavos ?? prenda.sugerido_centavos ?? null),
		piezas: Object.fromEntries(
			prenda.tallas.map((talla) => [talla.variante_id, talla.cantidad === 0 ? "" : String(talla.cantidad)]),
		),
	};
}

/**
 * La captura con que abre el editor: el pedido como está, o uno nuevo con su cliente y la forma de pago del parámetro.
 * @param editor Lo que da la consulta.
 * @param clienteId El cliente con que abre un pedido nuevo.
 */
function capturaInicial(editor: Editor, clienteId: string | undefined): Captura {
	return {
		clienteId: editor.pedido?.cliente_id ?? clienteId ?? "",
		fechaEntrega: editor.pedido?.fecha_entrega ?? "",
		formaPago: editor.pedido?.forma_pago ?? editor.forma_pago_inicial,
		prendas: editor.prendas.map(paraCapturar),
	};
}

/**
 * Los renglones que se mandan: por talla, las que llevan piezas y las que ya estaban en el pedido; con el precio dado
 * si es otro que el sugerido.
 * @param captura Lo capturado.
 */
function renglonesDe(captura: Captura) {
	return captura.prendas.flatMap(({ prenda, precio, piezas }) => {
		const dado = pesosACentavos(precio);
		const conPrecio = dado !== null && dado !== prenda.sugerido_centavos ? { precio_dado_centavos: dado } : {};
		return prenda.tallas.flatMap((talla) => {
			const texto = piezas[talla.variante_id] ?? "";
			const cantidad = texto.trim() === "" ? 0 : Number(texto);
			return cantidad === 0 && talla.cantidad === 0 ? [] : [{ variante_id: talla.variante_id, cantidad, ...conPrecio }];
		});
	});
}

/**
 * El importe y las piezas de una prenda capturada: lo que lleva por el precio de cada talla (con su recargo especial).
 * @param capturada La prenda.
 */
function cuentaDe(capturada: PrendaCapturada): { piezas: number; importe: number } {
	const precio = pesosACentavos(capturada.precio) ?? capturada.prenda.sugerido_centavos ?? 0;
	const renglones = capturada.prenda.tallas.map((talla) => ({
		cantidad: Number(capturada.piezas[talla.variante_id] ?? "0") || 0,
		precioUnitarioCentavos: precioUnitario(precio, talla.recargo_centavos ?? 0),
	}));
	return { piezas: renglones.reduce((suma, renglon) => suma + renglon.cantidad, 0), importe: totalDe(renglones) };
}

/**
 * El buscador de prendas: los grupos de `ventas.buscar_prendas` con «Agregar» o «Agregado».
 * @param props El cliente, las prendas ya agregadas, qué hacer al agregar una y al terminar.
 */
function BuscadorDePrendas({
	clienteId,
	cliente,
	agregadas,
	alAgregar,
	alTerminar,
}: {
	clienteId: string;
	cliente: string;
	agregadas: readonly string[];
	alAgregar: (productoId: string) => void;
	alTerminar: () => void;
}) {
	const [buscar, setBuscar] = useState("");
	const router = useRouter();
	const consulta = useConsulta(
		buscarPrendas,
		{ cliente_id: clienteId, ...(buscar === "" ? {} : { buscar }) },
		clienteId !== "",
	);
	return (
		<section aria-label="Buscar prenda" className="flex flex-col gap-3 rounded-grande border border-linea p-4">
			<div className="flex items-end gap-3">
				<div className="flex-1">
					<Buscador
						etiqueta="Buscar prenda"
						ayuda="Buscar prenda, escuela o sección"
						valor={buscar}
						alBuscar={setBuscar}
					/>
				</div>
				<Boton onClick={alTerminar}>Listo</Boton>
			</div>
			{clienteId === "" ? (
				<p className="m-0 text-tinta3">Primero escoge el cliente</p>
			) : consulta.data === undefined ? (
				<EstadoDePantalla tipo="cargando" renglones={3} />
			) : consulta.data.grupos.length === 0 ? (
				<p className="m-0 text-tinta3">Ninguna prenda se llama así</p>
			) : (
				consulta.data.grupos.map((grupo) => (
					<div key={grupo.clave} className="flex flex-col">
						<h4 className="m-0 py-2 font-bold text-etiqueta text-tinta3 uppercase">
							{grupo.titulo} {grupo.productos.length}
						</h4>
						{grupo.productos.map((producto) => {
							const agregada = agregadas.includes(producto.producto_id);
							return (
								<div key={producto.producto_id} className="flex items-center gap-3 border-linea border-t py-2">
									<div className="flex-1">
										<b className="font-semibold">{producto.nombre}</b>
										<p className="m-0 text-etiqueta text-tinta3">{producto.detalle}</p>
									</div>
									<div className="text-right">
										<b className="font-bold tabular-nums">
											{producto.precio_centavos === null ? "Sin precio" : montoEnPantalla(producto.precio_centavos)}
										</b>
										<p className="m-0 text-etiqueta text-tinta3">{producto.origen ?? ""}</p>
									</div>
									<Boton
										chico
										variante="fantasma"
										{...(agregada ? {} : { icono: Plus })}
										disabled={agregada}
										onClick={() => alAgregar(producto.producto_id)}
									>
										{agregada ? "Agregado" : "Agregar"}
									</Boton>
								</div>
							);
						})}
					</div>
				))
			)}
			{clienteId === "" ? null : (
				<div className="flex flex-wrap items-center justify-between gap-3 border-linea border-t pt-3">
					<span>¿Modelo nuevo para {cliente}?</span>
					<Boton chico icono={Plus} onClick={() => router.history.push("/catalogo")}>
						Crear a partir de otro producto
					</Boton>
				</div>
			)}
		</section>
	);
}

/**
 * Una prenda en el editor: su precio, su importe, quitarla y sus casillas por talla.
 * @param props La prenda capturada, si es una modificación, el tope de piezas y qué hacer al cambiarla o quitarla.
 */
function PrendaEnEditor({
	capturada,
	modificando,
	maximo,
	alCambiar,
	alQuitar,
}: {
	capturada: PrendaCapturada;
	modificando: boolean;
	maximo: number;
	alCambiar: (cambio: PrendaCapturada) => void;
	alQuitar: () => void;
}) {
	const { prenda } = capturada;
	const { piezas, importe } = cuentaDe(capturada);
	const dado = pesosACentavos(capturada.precio);
	return (
		<article aria-label={prenda.nombre} className="flex flex-col gap-3 rounded-grande border border-linea p-4">
			<header className="flex items-start gap-3">
				<div className="flex-1">
					<b className="font-bold">{prenda.nombre}</b>
					{prenda.sugerido_centavos === null ? (
						<p className="m-0 font-bold text-etiqueta text-estado-rojo">Sin precio para este cliente</p>
					) : (
						<p className="m-0 text-etiqueta text-tinta2">
							{prenda.escuela} · Sugerido {montoEnPantalla(prenda.sugerido_centavos)} · {prenda.origen}
						</p>
					)}
				</div>
				<div className="w-28">
					<Campo
						etiqueta="Precio"
						inputMode="decimal"
						value={capturada.precio}
						onChange={(evento) => alCambiar({ ...capturada, precio: evento.target.value })}
					/>
					{prenda.sugerido_centavos !== null && dado !== null && dado !== prenda.sugerido_centavos ? (
						<span className="text-etiqueta text-tinta3">Sugerido {montoEnPantalla(prenda.sugerido_centavos)}</span>
					) : null}
				</div>
				<div className="text-right">
					<b className="font-bold tabular-nums">{enPesos(importe)}</b>
					<p className="m-0 text-etiqueta text-tinta2">{piezas.toLocaleString("es-MX")} piezas</p>
				</div>
				<button
					type="button"
					aria-label={`Quitar ${prenda.nombre}`}
					title={prenda.se_quita ? undefined : "Ya tiene piezas entregadas o en aduana"}
					disabled={!prenda.se_quita}
					onClick={alQuitar}
					className="grid size-9 place-items-center rounded-mediano text-tinta2 hover:bg-suave disabled:opacity-40"
				>
					<X aria-hidden="true" size={18} strokeWidth={1.9} />
				</button>
			</header>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
				{prenda.tallas.map((talla) => (
					<div key={talla.variante_id} className="flex flex-col gap-1 rounded-mediano bg-suave p-2">
						<Campo
							etiqueta={talla.especial ? `${talla.talla} · especial` : talla.talla}
							inputMode="numeric"
							max={maximo}
							value={capturada.piezas[talla.variante_id] ?? ""}
							onChange={(evento) =>
								alCambiar({ ...capturada, piezas: { ...capturada.piezas, [talla.variante_id]: evento.target.value } })
							}
						/>
						{modificando && talla.minimo > 0 ? (
							<span className="text-etiqueta text-tinta3">mín. {talla.minimo}</span>
						) : null}
					</div>
				))}
			</div>
		</article>
	);
}

/**
 * El cuerpo del editor, con lo que dio su consulta.
 * @param props Lo de la consulta, los clientes de hoy, el pedido (si se modifica), el cliente con que abre y qué hacer
 * al salir.
 */
function Editor({
	editor,
	clientes,
	pedidoId,
	clienteInicial,
	alSalir,
}: {
	editor: Editor;
	clientes: Editor["clientes"];
	pedidoId: string | undefined;
	clienteInicial: string | undefined;
	alSalir: (destino?: { cajon: "mandar"; id: string }) => void;
}) {
	const inicial = capturaInicial(editor, clienteInicial);
	const [captura, setCaptura] = useState<Captura>(inicial);
	const [buscando, setBuscando] = useState(false);
	const [clienteNuevo, setClienteNuevo] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [saliendo, setSaliendo] = useState<{ destino?: { cajon: "mandar"; id: string } } | undefined>(undefined);
	const [descartando, setDescartando] = useState(false);
	const salio = useRef(false);
	const conConexion = useConConexion();
	const borrador = useEnvio(guardarBorradorPedido);
	const confirmar = useEnvio(confirmarPedido);
	const version = useEnvio(guardarVersionPedido);
	const enviando = borrador.enviando || confirmar.enviando || version.enviando;
	const conCambios = saliendo === undefined && JSON.stringify(captura) !== JSON.stringify(inicial);
	const pregunta = usePreguntarAntesDeSalir(conCambios);
	// Salir sin preguntar otra vez: primero se apaga la pregunta y luego se navega.
	useEffect(() => {
		if (saliendo === undefined || salio.current) return;
		salio.current = true;
		alSalir(saliendo.destino);
	}, [saliendo, alSalir]);
	const cliente = clientes.find((suyo) => suyo.cliente_id === captura.clienteId);
	const modo = editor.modo;
	const renglones = renglonesDe(captura);
	const totales = captura.prendas
		.map(cuentaDe)
		.reduce((suma, cuenta) => ({ piezas: suma.piezas + cuenta.piezas, importe: suma.importe + cuenta.importe }), {
			piezas: 0,
			importe: 0,
		});
	const cambios =
		modo === "confirmado"
			? cambiosDeLaVersion(
					captura.prendas.flatMap(({ prenda, piezas }) =>
						prenda.tallas.map((talla) => ({
							prenda: prenda.nombre,
							talla: talla.talla,
							antes: talla.cantidad,
							despues: Number(piezas[talla.variante_id] ?? "0") || 0,
						})),
					),
					{ antes: inicial.fechaEntrega, despues: captura.fechaEntrega },
					{ antes: inicial.formaPago, despues: captura.formaPago },
				)
			: [];
	/** Revisa lo capturado con el esquema del contrato: el primer error sale arriba. */
	const revisar = () => {
		const revisado = guardarBorradorPedido.entrada.safeParse({
			...(pedidoId === undefined ? {} : { pedido_id: pedidoId }),
			cliente_id: captura.clienteId,
			fecha_entrega: captura.fechaEntrega,
			forma_pago: captura.formaPago,
			renglones,
		});
		setError(revisado.success ? undefined : revisado.error.issues[0]?.message);
		return revisado.success ? revisado.data : undefined;
	};
	const alCampos = (campos: Record<string, string>) => setError(Object.values(campos)[0]);
	/** Manda lo capturado con la acción de cada botón. */
	const guardar = async (como: "borrador" | "confirmar" | "version", mandar = false) => {
		const datos = revisar();
		if (datos === undefined) return;
		const conVersion = editor.version === null ? {} : { version: editor.version };
		if (como === "borrador") {
			const hecho = await borrador.enviar({ datos, ...conVersion }, alCampos);
			if (hecho !== undefined) setSaliendo({});
			return;
		}
		if (como === "confirmar") {
			const hecho = await confirmar.enviar({ datos, ...conVersion }, alCampos);
			if (hecho !== undefined)
				setSaliendo(mandar && hecho.por_mandar > 0 ? { destino: { cajon: "mandar", id: hecho.pedido_id } } : {});
			return;
		}
		if (pedidoId === undefined || editor.version === null) return;
		const hecho = await version.enviar({ datos: { ...datos, pedido_id: pedidoId }, version: editor.version }, alCampos);
		if (hecho !== undefined)
			setSaliendo(mandar && hecho.por_mandar > 0 ? { destino: { cajon: "mandar", id: hecho.pedido_id } } : {});
	};
	const agregar = async (productoId: string) => {
		const { prenda } = await consultar(precioSugeridoVentas, {
			cliente_id: captura.clienteId,
			producto_id: productoId,
		});
		setCaptura((actual) => ({ ...actual, prendas: [...actual.prendas, paraCapturar(prenda)] }));
	};
	const titulo =
		modo === "nuevo"
			? `Pedido nuevo ${editor.folio}`
			: modo === "confirmado"
				? `Modificar pedido ${editor.folio} · pasa a versión ${editor.version_siguiente ?? ""}`
				: `Modificar pedido ${editor.folio}`;
	const pie =
		modo === "nuevo" ? (
			<div className="flex flex-wrap justify-end gap-2">
				<Boton disabled={!conConexion || enviando} onClick={() => void guardar("borrador")}>
					Guardar borrador
				</Boton>
				<Boton disabled={!conConexion || enviando} onClick={() => void guardar("confirmar")}>
					Guardar y confirmar
				</Boton>
				<Boton
					variante="principal"
					icono={Factory}
					disabled={!conConexion || enviando}
					onClick={() => void guardar("confirmar", true)}
				>
					Confirmar y mandar a producción
				</Boton>
			</div>
		) : modo === "borrador" ? (
			<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void guardar("borrador")}>
				Guardar cambios
			</Boton>
		) : (
			<div className="flex flex-wrap justify-end gap-2">
				<Boton disabled={!conConexion || enviando} onClick={() => void guardar("version")}>
					Guardar versión {editor.version_siguiente}
				</Boton>
				<Boton
					variante="principal"
					icono={Factory}
					disabled={!conConexion || enviando}
					onClick={() => void guardar("version", true)}
				>
					Guardar y mandar a producción
				</Boton>
			</div>
		);
	return (
		<>
			<Cajon
				abierto
				ancho
				conCambios={conCambios}
				alCerrar={() => setSaliendo({})}
				contexto={titulo}
				titulo={cliente?.nombre ?? "¿Para qué cliente?"}
				pieIzquierda={
					<Boton variante="fantasma" onClick={() => (conCambios ? setDescartando(true) : setSaliendo({}))}>
						{modo === "nuevo" ? "Descartar" : "Descartar cambios"}
					</Boton>
				}
				accion={pie}
			>
				<div className="flex flex-col gap-5">
					{borrador.choco || confirmar.choco || version.choco ? (
						<EstadoDePantalla tipo="choque" documento={editor.folio} />
					) : null}
					{error === undefined ? null : <Recuadro color="ambar">{error}</Recuadro>}
					<section className="grid grid-cols-3 gap-4 max-telefono:grid-cols-1">
						<div className="flex flex-col gap-2">
							<div className="flex items-end gap-2">
								{cliente === undefined ? null : <MuestraDeColor color={cliente.color} tamano="grande" />}
								<div className="flex-1">
									<Selector
										etiqueta="Cliente"
										vacio="Escoge un cliente"
										disabled={modo !== "nuevo" || captura.prendas.length > 0}
										value={captura.clienteId}
										opciones={clientes.map((suyo) => ({
											valor: suyo.cliente_id,
											texto: suyo.detenido ? `${suyo.nombre}, detenido por crédito` : suyo.nombre,
										}))}
										onChange={(evento) => {
											const escogido = clientes.find((suyo) => suyo.cliente_id === evento.target.value);
											if (escogido?.detenido === true) return;
											setCaptura({ ...captura, clienteId: evento.target.value });
										}}
									/>
								</div>
							</div>
							{modo === "nuevo" && captura.prendas.length === 0 ? (
								<Enlace onClick={() => setClienteNuevo(true)}>Cliente nuevo</Enlace>
							) : null}
						</div>
						<Campo
							etiqueta="Entrega"
							type="date"
							min={editor.hoy}
							value={captura.fechaEntrega}
							onChange={(evento) => setCaptura({ ...captura, fechaEntrega: evento.target.value })}
						/>
						<div className="flex flex-col gap-1.5">
							<span className="font-semibold text-etiqueta text-tinta2">Forma de pago</span>
							<div role="radiogroup" aria-label="Forma de pago" className="flex gap-1">
								{formasDePago.map((forma) => (
									<Boton
										key={forma}
										chico
										variante={captura.formaPago === forma ? "principal" : "secundario"}
										aria-pressed={captura.formaPago === forma}
										disabled={forma === "credito" && cliente !== undefined && !cliente.tiene_credito}
										onClick={() => setCaptura({ ...captura, formaPago: forma })}
									>
										{forma === "contado" ? "Contado" : forma === "anticipo" ? "Anticipo" : "Crédito"}
									</Boton>
								))}
							</div>
							{cliente !== undefined && !cliente.tiene_credito ? (
								<span className="text-etiqueta text-tinta3">
									Sin crédito: de contado o con anticipo hasta que Contaduría le ponga límite.
								</span>
							) : null}
						</div>
					</section>
					{cliente?.cerca_del_limite === true ? <Recuadro color="ambar">Cerca de su límite de crédito</Recuadro> : null}
					<section className="flex flex-col gap-3">
						<TituloDeBloque
							titulo="Prendas"
							detalle={`${captura.prendas.length} ${captura.prendas.length === 1 ? "producto" : "productos"} · ${totales.piezas.toLocaleString("es-MX")} piezas`}
						/>
						{captura.prendas.map((capturada, i) => (
							<PrendaEnEditor
								key={capturada.prenda.producto_id}
								capturada={capturada}
								modificando={modo !== "nuevo"}
								maximo={editor.piezas_max_talla}
								alCambiar={(cambio) =>
									setCaptura({ ...captura, prendas: captura.prendas.map((otra, j) => (j === i ? cambio : otra)) })
								}
								alQuitar={() => setCaptura({ ...captura, prendas: captura.prendas.filter((_, j) => j !== i) })}
							/>
						))}
						{buscando ? (
							<BuscadorDePrendas
								clienteId={captura.clienteId}
								cliente={cliente?.nombre ?? ""}
								agregadas={captura.prendas.map((capturada) => capturada.prenda.producto_id)}
								alAgregar={(productoId) => void agregar(productoId)}
								alTerminar={() => setBuscando(false)}
							/>
						) : (
							<Boton icono={Plus} onClick={() => setBuscando(true)}>
								Agregar prenda
							</Boton>
						)}
					</section>
					{cambios.length === 0 ? null : (
						<section className="flex flex-col gap-2">
							<TituloDeBloque titulo="Cambios de esta versión" />
							<ul className="m-0 flex flex-col gap-1 pl-5">
								{cambios.map((linea) => (
									<li key={linea}>{linea}</li>
								))}
							</ul>
						</section>
					)}
					<section className="ml-auto flex w-72 flex-col gap-2 max-telefono:w-full">
						<div className="flex justify-between">
							<span>Piezas</span>
							<b className="tabular-nums">{totales.piezas.toLocaleString("es-MX")}</b>
						</div>
						<div className="flex justify-between border-linea border-t pt-2 font-bold text-subtitulo">
							<span>Total</span>
							<span className="tabular-nums">{enPesos(totales.importe)}</span>
						</div>
						{captura.fechaEntrega === "" ? null : (
							<span className="text-right text-etiqueta text-tinta3">
								Entrega el {textoDeDiaCorto(captura.fechaEntrega)}
							</span>
						)}
					</section>
				</div>
			</Cajon>
			{pregunta}
			<Ventana
				abierta={descartando}
				alCerrar={() => setDescartando(false)}
				titulo={textoCambiosSinGuardar}
				accion={
					<Boton variante="peligro" onClick={() => setSaliendo({})}>
						Salir sin guardar
					</Boton>
				}
			/>
			{clienteNuevo ? (
				<CajonCliente
					desdePedido
					alCerrar={(clienteId) => {
						setClienteNuevo(false);
						if (clienteId !== undefined) setCaptura((actual) => ({ ...actual, clienteId }));
					}}
				/>
			) : null}
		</>
	);
}

/**
 * El cajón del pedido nuevo (con o sin cliente) o de Modificar pedido.
 * @param props El pedido que se modifica, o el cliente con que abre uno nuevo, y qué hacer al cerrar.
 */
export function CajonEditorPedido({
	pedidoId,
	clienteId,
	alCerrar,
}: {
	pedidoId?: string;
	clienteId?: string;
	alCerrar: () => void;
}) {
	const { abrir } = useDireccionDeVentas();
	const consulta = useConsulta(editorPedido, {
		...(pedidoId === undefined ? {} : { pedido_id: pedidoId }),
		...(clienteId === undefined ? {} : { cliente_id: clienteId }),
	});
	// Lee el editor una vez: lo que llegue después (otra cuenta guardó) no pisa lo capturado; el choque lo avisa.
	const [leido, setLeido] = useState<Editor | undefined>(undefined);
	useEffect(() => {
		if (leido === undefined && consulta.data !== undefined) setLeido(consulta.data);
	}, [consulta.data, leido]);
	if (leido === undefined) {
		return (
			<Cajon abierto ancho alCerrar={alCerrar} contexto="Pedido" titulo="">
				{consulta.isError ? (
					<EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />
				) : (
					<EstadoDePantalla tipo="cargando" />
				)}
			</Cajon>
		);
	}
	return (
		<Editor
			editor={leido}
			clientes={consulta.data?.clientes ?? leido.clientes}
			pedidoId={pedidoId}
			clienteInicial={clienteId}
			alSalir={(destino) => (destino === undefined ? alCerrar() : abrir(destino.cajon, destino.id))}
		/>
	);
}
