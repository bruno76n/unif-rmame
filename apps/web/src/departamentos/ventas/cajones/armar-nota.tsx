/**
 * El cajón «Armar nota de entrega» (ancho): los datos del pedido y, por prenda, lo listo en aduana con una casilla por
 * talla (todo lo listo, «Todas» o «Ninguna»), los totales con el anticipo y «Crear nota {NV}».
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Armar nota de entrega (ancho)») y docs/modulos/ventas/notas-de-entrega.md
 *
 * Es una captura: cerrarla con cambios pregunta antes. Sin nada listo no se abre: «Nada listo en aduana para este
 * pedido». El anticipo que se aplica sale de `anticipoAplicado`, la misma cuenta de la acción al armarla.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { anticipoAplicado, totalDe } from "@uniformame/compartido/calculos/ventas";
import { ErrorDeLaApi } from "@uniformame/compartido/cliente/cliente";
import { armarNotaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { armarNotaEntrega } from "@uniformame/compartido/contratos/ventas/notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que da la consulta. */
type Armado = z.infer<typeof armarNotaVentas.resultado>;

/**
 * Lo listo de cada talla, que es con lo que abre la captura.
 * @param armado Lo de la consulta.
 */
function todoLoListo(armado: Armado): Record<string, string> {
	return Object.fromEntries(
		armado.prendas.flatMap((prenda) => prenda.tallas.map((talla) => [talla.variante_id, String(talla.listas)])),
	);
}

/**
 * El error de una casilla: no es número entero, o pasa de lo listo.
 * @param texto Lo escrito.
 * @param listas Lo listo de esa talla.
 */
function errorDeCasilla(texto: string, listas: number): string | undefined {
	if (texto.trim() === "") return undefined;
	const piezas = Number(texto);
	if (!Number.isInteger(piezas) || piezas < 0) return "Número entero";
	return piezas > listas ? `Hay ${listas}` : undefined;
}

/**
 * La captura de la nota, con lo que dio su consulta.
 * @param props Lo de la consulta y qué hacer al cerrar.
 */
function CapturaDeNota({ armado, alCerrar }: { armado: Armado; alCerrar: () => void }) {
	const inicial = todoLoListo(armado);
	const [piezas, setPiezas] = useState(inicial);
	const [error, setError] = useState<string | undefined>(undefined);
	const [saliendo, setSaliendo] = useState(false);
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(armarNotaEntrega);
	const conCambios = !saliendo && JSON.stringify(piezas) !== JSON.stringify(inicial);
	const pregunta = usePreguntarAntesDeSalir(conCambios);
	useEffect(() => {
		if (saliendo) alCerrar();
	}, [saliendo, alCerrar]);
	const tallas = armado.prendas.flatMap((prenda) => prenda.tallas);
	const cantidad = (varianteId: string) => Number(piezas[varianteId] ?? "0") || 0;
	const totalPiezas = tallas.reduce((total, talla) => total + cantidad(talla.variante_id), 0);
	const importe = totalDe(
		tallas.map((talla) => ({
			cantidad: cantidad(talla.variante_id),
			precioUnitarioCentavos: talla.precio_unitario_centavos ?? 0,
		})),
	);
	const anticipo = anticipoAplicado(armado.anticipo_disponible_centavos ?? 0, importe);
	const conErrores = tallas.some(
		(talla) => errorDeCasilla(piezas[talla.variante_id] ?? "", talla.listas) !== undefined,
	);
	const crear = async () => {
		const revisado = armarNotaEntrega.entrada.safeParse({
			pedido_id: armado.pedido_id,
			renglones: tallas
				.filter((talla) => cantidad(talla.variante_id) > 0)
				.map((talla) => ({ variante_id: talla.variante_id, cantidad: cantidad(talla.variante_id) })),
		});
		if (!revisado.success) {
			setError(revisado.error.issues[0]?.message);
			return;
		}
		setError(undefined);
		const hecho = await enviar({ datos: revisado.data, version: armado.version }, (campos) =>
			setError(Object.values(campos)[0]),
		);
		if (hecho !== undefined) setSaliendo(true);
	};
	return (
		<>
			<Cajon
				abierto
				ancho
				conCambios={conCambios}
				alCerrar={() => setSaliendo(true)}
				contexto={`Nota de entrega nueva ${armado.folio} · Del pedido ${armado.folio_pedido}`}
				titulo={armado.cliente.nombre}
				pieIzquierda={
					<Boton variante="fantasma" onClick={() => setSaliendo(true)}>
						Cancelar
					</Boton>
				}
				accion={
					<Boton
						variante="principal"
						icono={Receipt}
						disabled={!conConexion || enviando || conErrores}
						onClick={() => void crear()}
					>
						Crear nota {armado.folio}
					</Boton>
				}
			>
				<div className="flex flex-col gap-5">
					{choco ? <EstadoDePantalla tipo="choque" documento={armado.folio_pedido} /> : null}
					{error === undefined ? null : <Recuadro color="ambar">{error}</Recuadro>}
					<section className="grid grid-cols-2 gap-4">
						<Dato etiqueta="Entrega del pedido">
							{armado.entrega.texto} <TextoConTono tono={armado.entrega.tono}>{armado.entrega.cuando}</TextoConTono>
						</Dato>
						<Dato etiqueta="Forma de pago">{armado.forma_pago}</Dato>
						<Dato etiqueta="Notas anteriores">
							{armado.notas_anteriores.length === 0 ? "—" : armado.notas_anteriores.join(", ")}
						</Dato>
						<Dato etiqueta="Anticipo disponible">
							{armado.anticipo_disponible_centavos === 0 ? "—" : montoEnPantalla(armado.anticipo_disponible_centavos)}
						</Dato>
					</section>
					<section className="flex flex-col gap-3">
						<TituloDeBloque titulo="Qué sale en esta nota" detalle="Lo que está listo en aduana" />
						{armado.prendas.map((prenda) => (
							<article
								key={prenda.producto_id}
								aria-label={prenda.nombre}
								className="flex flex-col gap-3 rounded-grande border border-linea p-4"
							>
								<header className="flex items-start justify-between gap-3">
									<div>
										<b className="font-bold">{prenda.nombre}</b>
										<p className="m-0 text-etiqueta text-tinta2">{prenda.linea}</p>
									</div>
									<div className="flex gap-2">
										<Boton
											chico
											onClick={() =>
												setPiezas({
													...piezas,
													...Object.fromEntries(
														prenda.tallas.map((talla) => [talla.variante_id, String(talla.listas)]),
													),
												})
											}
										>
											Todas
										</Boton>
										<Boton
											chico
											onClick={() =>
												setPiezas({
													...piezas,
													...Object.fromEntries(prenda.tallas.map((talla) => [talla.variante_id, "0"])),
												})
											}
										>
											Ninguna
										</Boton>
									</div>
								</header>
								<div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
									{prenda.tallas.map((talla) => (
										<div key={talla.variante_id} className="flex flex-col gap-1 rounded-mediano bg-suave p-2">
											<Campo
												etiqueta={talla.talla}
												inputMode="numeric"
												value={piezas[talla.variante_id] ?? ""}
												error={errorDeCasilla(piezas[talla.variante_id] ?? "", talla.listas)}
												onChange={(evento) => setPiezas({ ...piezas, [talla.variante_id]: evento.target.value })}
											/>
											<span className="text-etiqueta text-tinta3">de {talla.listas}</span>
										</div>
									))}
								</div>
							</article>
						))}
					</section>
					<section className="ml-auto flex w-72 flex-col gap-2 max-telefono:w-full">
						<div className="flex justify-between">
							<span>Piezas</span>
							<b className="tabular-nums">{totalPiezas.toLocaleString("es-MX")}</b>
						</div>
						<div className="flex justify-between">
							<span>Importe</span>
							<b className="tabular-nums">{enPesos(importe)}</b>
						</div>
						{anticipo === 0 ? null : (
							<div className="flex justify-between">
								<span>Anticipo aplicado</span>
								<b className="tabular-nums">−{enPesos(anticipo)}</b>
							</div>
						)}
						<div className="flex justify-between border-linea border-t pt-2 font-bold text-subtitulo">
							<span>Por cobrar</span>
							<span className="tabular-nums">{enPesos(importe - anticipo)}</span>
						</div>
					</section>
				</div>
			</Cajon>
			{pregunta}
		</>
	);
}

/**
 * El cajón para armar una nota de entrega de un pedido.
 * @param props El pedido y qué hacer al cerrar.
 */
export function CajonArmarNota({ pedidoId, alCerrar }: { pedidoId: string; alCerrar: () => void }) {
	const consulta = useConsulta(armarNotaVentas, { pedido_id: pedidoId });
	const [leido, setLeido] = useState<Armado | undefined>(undefined);
	useEffect(() => {
		if (leido === undefined && consulta.data !== undefined) setLeido(consulta.data);
	}, [consulta.data, leido]);
	if (leido !== undefined) return <CapturaDeNota armado={leido} alCerrar={alCerrar} />;
	const nadaListo = consulta.error instanceof ErrorDeLaApi && consulta.error.respuesta.codigo === "nada_listo";
	return (
		<Cajon abierto ancho alCerrar={alCerrar} contexto="Nota de entrega nueva" titulo="">
			{nadaListo ? (
				<EstadoDePantalla tipo="vacio" texto="Nada listo en aduana para este pedido" />
			) : (
				<SegunConsulta consulta={consulta}>{() => null}</SegunConsulta>
			)}
		</Cajon>
	);
}
