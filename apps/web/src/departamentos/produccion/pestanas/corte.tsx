/**
 * La pestaña Corte: a la izquierda, «Lotes por cortar»; a la derecha, la captura del escogido (`?cortar={id}`; sin él,
 * el último que escogió esta cuenta o el primero por fecha de corte). Sin receta no se corta: solo el panel «Falta la
 * receta». Con receta: los avisos, los rollos de cada tela con su línea, lo que quedó del último, las piezas por talla,
 * quién cortó, las cifras de la tela principal y el pie con lo que pasa con lo que quedó y «Cerrar corte».
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Corte»)
 *
 * Lo que se calcula mientras se escribe sale del paquete compartido (`corte-en-pantalla.ts`); la acción lo repite al
 * cerrar. Al cerrar, abre Lotes con el lote marcado.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { capturaDeCorte } from "@uniformame/compartido/contratos/produccion/captura-corte";
import { cerrarCorte } from "@uniformame/compartido/contratos/produccion/corte";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { Plus, Scissors, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { leerFalla, useAccion, useConsulta, volverALeer } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import {
	type CapturaDelCorte,
	type CorteCapturado,
	cifrasDelCorte,
	corteNuevo,
	datosDelCierre,
	loQuePideLaReceta,
	piezasPorTalla,
	rollosPuestos,
	type TelaCapturada,
	tela0,
	telaEnPantalla,
} from "../corte-en-pantalla.ts";
import { enOtroDepartamento } from "../cuenta.ts";
import { rutasDeProduccion, useDireccion } from "../direccion.ts";
import { loQueCambiaEnProduccion } from "../invalidar.ts";
import { PaginaDeProduccion } from "../pagina.tsx";

/** La etiqueta de la receta en el encabezado de la captura. */
const etiquetaDeReceta = {
	verificada: { texto: "Receta verificada", color: "verde" },
	sin_verificar: { texto: "Sin verificar", color: "ambar" },
	sin_receta: { texto: "Sin receta", color: "rojo" },
} as const;

/**
 * El último lote que escogió esta cuenta en Corte, guardado en este navegador.
 * @param correo El correo de la cuenta.
 */
function llaveDelUltimo(correo: string): string {
	return `produccion.corte.ultimo.${correo}`;
}

/** La pestaña Corte. */
export function PestanaCorte() {
	const { leer, ir } = useDireccion();
	const cuenta = useConsulta(armazon, {});
	const correo = cuenta.data?.cuenta.correo ?? "";
	const [guardado, setGuardado] = useState<string | null>(null);
	useEffect(() => setGuardado(correo === "" ? null : window.localStorage.getItem(llaveDelUltimo(correo))), [correo]);
	const elegido = leer("cortar") ?? guardado ?? undefined;
	const consulta = useConsulta(capturaDeCorte, elegido === undefined ? {} : { lote_id: elegido });
	// El último escogido ya no está por cortar: se olvida y se abre el primero.
	useEffect(() => {
		if (consulta.isError && leer("cortar") === undefined && guardado !== null) {
			window.localStorage.removeItem(llaveDelUltimo(correo));
			setGuardado(null);
		}
	}, [consulta.isError, leer, guardado, correo]);
	/** Escoge otro lote: empieza la captura de nuevo y se recuerda para esta cuenta. */
	const escoger = (loteId: string) => {
		if (correo !== "") window.localStorage.setItem(llaveDelUltimo(correo), loteId);
		ir({ cortar: loteId });
	};
	return (
		<PaginaDeProduccion activa="corte">
			<SegunConsulta consulta={consulta}>
				{({ lotes, captura }) => (
					<div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-5 max-menu:grid-cols-1">
						<Seccion titulo="Lotes por cortar" enPanel>
							{lotes.length === 0 ? (
								<EstadoDePantalla tipo="vacio" texto="No hay lotes por cortar." />
							) : (
								<ul className="m-0 flex list-none flex-col gap-1 p-0">
									{lotes.map((lote) => (
										<li key={lote.lote_id}>
											<button
												type="button"
												aria-current={captura?.lote_id === lote.lote_id ? "true" : undefined}
												onClick={() => escoger(lote.lote_id)}
												className={`flex w-full flex-col gap-1 rounded-mediano p-3 text-left hover:bg-suave ${
													captura?.lote_id === lote.lote_id ? "bg-marca-fondo" : ""
												}`}
											>
												<span className="flex items-center justify-between gap-2">
													<b>{lote.folio}</b>
													<span className={lote.corte_pronto ? "font-semibold text-texto-advertencia" : "text-tinta2"}>
														{lote.fecha_corte}
													</span>
												</span>
												<span>{lote.prenda}</span>
												<span className="text-etiqueta text-tinta2">{lote.detalle}</span>
												<span className="flex flex-wrap gap-1.5">
													{lote.tela === null ? null : <Estado texto={lote.tela.texto} color={lote.tela.color} />}
													{lote.receta === "verificada" ? null : <Estado {...etiquetaDeReceta[lote.receta]} />}
												</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</Seccion>
						{captura === null ? null : <Captura key={captura.lote_id} captura={captura} />}
					</div>
				)}
			</SegunConsulta>
		</PaginaDeProduccion>
	);
}

/**
 * La captura del corte de un lote.
 * @param props La captura que regresó `produccion.corte`.
 */
function Captura({ captura }: { captura: CapturaDelCorte }) {
	const router = useRouter();
	const tiene = useTieneDepartamento();
	const encabezado = (
		<header className="flex flex-col gap-1.5">
			<span className="font-semibold text-etiqueta text-tinta3">
				{captura.folio} · {captura.orden}
			</span>
			<h2 className="m-0 font-bold text-titulo-seccion">{captura.prenda}</h2>
			<span className="text-tinta2">
				{captura.para.tipo === "temporada" ? captura.para.linea : `${captura.para.nombre} · ${captura.para.linea}`}
			</span>
			<span className="flex flex-wrap gap-1.5">
				<Estado texto={captura.tela.texto} color={captura.tela.color} />
				<Estado {...etiquetaDeReceta[captura.receta]} />
			</span>
		</header>
	);
	if (captura.receta === "sin_receta" || captura.receta_version_id === null) {
		return (
			<section className="flex flex-col gap-4 rounded-grande bg-panel p-5 shadow-panel">
				{encabezado}
				<Seccion titulo="Falta la receta">
					<p className="m-0 text-tinta2">
						{tiene("patronaje")
							? `Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla. Se corta el ${captura.fecha_corte}.`
							: `Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla. Se corta el ${captura.fecha_corte}; Patronaje ya lo tiene en sus pendientes.`}
					</p>
					{tiene("patronaje") ? (
						<div>
							<Boton
								variante="principal"
								onClick={() => router.history.push(enOtroDepartamento.receta(captura.producto_id))}
							>
								Capturar receta
							</Boton>
						</div>
					) : null}
				</Seccion>
			</section>
		);
	}
	return <CapturaConReceta captura={captura} encabezado={encabezado} />;
}

/**
 * La captura de un lote con receta.
 * @param props La captura y su encabezado.
 */
function CapturaConReceta({ captura, encabezado }: { captura: CapturaDelCorte; encabezado: ReactNode }) {
	const { ir } = useDireccion();
	const avisar = useAvisar();
	const conConexion = useConConexion();
	const [capturado, setCapturado] = useState<CorteCapturado>(() => corteNuevo(captura));
	const [conCambios, setConCambios] = useState(false);
	const pregunta = usePreguntarAntesDeSalir(conCambios);
	const consultas = useQueryClient();
	const cerrar = useAccion(cerrarCorte, loQueCambiaEnProduccion);
	const falla = cerrar.error === null ? null : leerFalla(cerrar.error);
	const piezas = piezasPorTalla(captura, capturado.piezas);
	const totalDePiezas = Object.values(piezas).reduce((suma, una) => suma + una, 0);
	const { pide, piso } = loQuePideLaReceta(captura, piezas);
	const telas = captura.telas.map((tela) =>
		telaEnPantalla(captura, tela, capturado.telas[tela.material_id] ?? tela0, {
			pide: pide[tela.material_id] ?? 0n,
			piso: piso[tela.material_id] ?? 0n,
			piezas: totalDePiezas,
		}),
	);
	const cifras = cifrasDelCorte(
		telas.find((tela) => tela.tela.papel === "tela_principal"),
		totalDePiezas,
		captura.rendimiento_rojo,
	);
	/** Cambia lo capturado y marca que hay cambios sin guardar. */
	const cambiar = (cambio: (antes: CorteCapturado) => CorteCapturado) => {
		setCapturado(cambio);
		setConCambios(true);
	};
	/** Cambia lo capturado de una tela. */
	const cambiarTela = (materialId: string, cambio: (antes: TelaCapturada) => TelaCapturada) =>
		cambiar((antes) => ({
			...antes,
			telas: { ...antes.telas, [materialId]: cambio(antes.telas[materialId] ?? tela0) },
		}));
	/** Los rollos puestos de una tela, ya sin los automáticos: así se pueden cambiar. */
	const fijos = (materialId: string) => {
		const tela = captura.telas.find((una) => una.material_id === materialId);
		const capturada = capturado.telas[materialId] ?? tela0;
		return tela === undefined ? [] : rollosPuestos(tela, capturada, pide[materialId] ?? 0n);
	};
	const errorDeCampo = (campo: string) => (falla?.tipo === "regla" ? falla.campos[campo] : undefined);
	return (
		<section className="flex flex-col gap-5 rounded-grande bg-panel p-5 shadow-panel">
			{encabezado}
			{captura.receta === "sin_verificar" ? (
				<LineaDeAviso tono="info">Con este corte queda verificada la receta.</LineaDeAviso>
			) : null}
			{captura.aviso_version === null ? null : <LineaDeAviso tono="advertencia">{captura.aviso_version}</LineaDeAviso>}
			{falla?.tipo === "choque" ? <EstadoDePantalla tipo="choque" documento={captura.folio} /> : null}
			<Seccion titulo="Rollos">
				{telas.map((enPantalla) => {
					const { tela } = enPantalla;
					const capturada = capturado.telas[tela.material_id] ?? tela0;
					const puestos = enPantalla.rollos.map((rollo) => rollo.rolloId);
					return (
						<div
							key={tela.material_id}
							data-tela={tela.material_id}
							className="flex flex-col gap-3 border-linea border-t pt-3"
						>
							<b>
								{tela.nombre}
								{tela.papel === "tela_principal" ? null : (
									<span className="font-normal text-tinta2">
										{" "}
										{tela.papel === "combinacion" ? "combinación" : "forro"}
									</span>
								)}
							</b>
							{enPantalla.linea === null ? null : (
								<div className="flex flex-wrap items-center gap-3" data-metros-pide={enPantalla.linea.pide}>
									<LineaDeAviso tono={enPantalla.linea.alcanza ? "bien" : "error"}>
										{enPantalla.linea.texto}
									</LineaDeAviso>
									{enPantalla.agregar === null ? null : (
										<Boton
											chico
											icono={Plus}
											onClick={() =>
												cambiarTela(tela.material_id, (antes) => ({
													...antes,
													automaticos: false,
													quedaron: null,
													rollos: [...fijos(tela.material_id), enPantalla.agregar?.rolloId ?? ""],
												}))
											}
										>
											{enPantalla.agregar.texto}
										</Boton>
									)}
								</div>
							)}
							{enPantalla.rollos.map((rollo, i) => (
								<div
									key={rollo.rolloId}
									className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3 max-telefono:grid-cols-1"
								>
									<Selector
										etiqueta="Rollo…"
										value={rollo.rolloId}
										opciones={tela.rollos
											.filter((otro) => otro.rollo_id === rollo.rolloId || !puestos.includes(otro.rollo_id))
											.map((otro) => ({
												valor: otro.rollo_id,
												texto: `${otro.folio} · partida ${otro.partida ?? "—"} · ${Number(otro.metros)} m${otro.entregado ? " · entregado" : ""}`,
											}))}
										onChange={(evento) => {
											const nuevo = evento.target.value;
											const esElUltimo = i === enPantalla.rollos.length - 1;
											cambiarTela(tela.material_id, (antes) => ({
												...antes,
												automaticos: false,
												quedaron: esElUltimo ? null : antes.quedaron,
												rollos: fijos(tela.material_id).map((id, j) => (j === i ? nuevo : id)),
											}));
										}}
									/>
									<span
										className="pb-3 text-tinta2"
										data-metros-usados={rollo.usados}
										data-metros-quedan={rollo.quedan ?? undefined}
									>
										{rollo.texto}
									</span>
									{enPantalla.rollos.length > 1 ? (
										<Boton
											variante="fantasma"
											icono={X}
											aria-label={`Quitar ${tela.rollos.find((uno) => uno.rollo_id === rollo.rolloId)?.folio ?? ""}`}
											onClick={() =>
												cambiarTela(tela.material_id, (antes) => ({
													...antes,
													automaticos: false,
													quedaron: null,
													rollos: fijos(tela.material_id).filter((id) => id !== rollo.rolloId),
												}))
											}
										/>
									) : (
										<span />
									)}
								</div>
							))}
							{enPantalla.rollos.length === 0 ? null : (
								<div className="flex flex-wrap items-end gap-3">
									<div className="w-56">
										<Campo
											etiqueta={`Quedó del rollo ${enPantalla.quedo.folio}`}
											inputMode="decimal"
											value={capturada.quedaron ?? enPantalla.quedo.calculado}
											error={enPantalla.quedo.error ?? undefined}
											onChange={(evento) =>
												cambiarTela(tela.material_id, (antes) => ({ ...antes, quedaron: evento.target.value }))
											}
										/>
									</div>
									{enPantalla.quedo.cambiado ? (
										<span className="flex items-center gap-2 pb-3 text-tinta2">
											Cambiado · según la receta, {enPantalla.quedo.calculado} m
											<Boton
												chico
												variante="fantasma"
												onClick={() => cambiarTela(tela.material_id, (antes) => ({ ...antes, quedaron: null }))}
											>
												Volver a lo calculado
											</Boton>
										</span>
									) : (
										<span className="pb-3 text-tinta2">Según la receta</span>
									)}
									{enPantalla.pideSirve ? (
										<div className="pb-2">
											<Filtros
												nombre={`Lo que quedó de ${enPantalla.quedo.folio}`}
												filtros={[
													{ clave: "sirve", texto: "Sirve" },
													{ clave: "no_sirve", texto: "Ya no sirve" },
												]}
												activo={capturada.yaNoSirve ? "no_sirve" : "sirve"}
												alEscoger={(clave) =>
													cambiarTela(tela.material_id, (antes) => ({ ...antes, yaNoSirve: clave === "no_sirve" }))
												}
											/>
										</div>
									) : null}
								</div>
							)}
							{enPantalla.mezcla === null ? null : <LineaDeAviso tono="advertencia">{enPantalla.mezcla}</LineaDeAviso>}
							<div>
								<Boton
									chico
									icono={Plus}
									disabled={tela.rollos.every((otro) => puestos.includes(otro.rollo_id))}
									onClick={() => {
										const siguiente = tela.rollos.find((otro) => !puestos.includes(otro.rollo_id));
										if (siguiente === undefined) return;
										cambiarTela(tela.material_id, (antes) => ({
											...antes,
											automaticos: false,
											quedaron: null,
											rollos: [...fijos(tela.material_id), siguiente.rollo_id],
										}));
									}}
								>
									Agregar rollo
								</Boton>
							</div>
						</div>
					);
				})}
				{errorDeCampo("telas") === undefined ? null : <LineaDeAviso tono="error">{errorDeCampo("telas")}</LineaDeAviso>}
			</Seccion>
			<Seccion
				titulo="Piezas cortadas por talla"
				nota={`Planeado: ${captura.tallas.reduce((suma, talla) => suma + talla.planeadas, 0)}`}
			>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
					{captura.tallas.map((talla) => (
						<div key={talla.variante_id} className="flex flex-col gap-1">
							<Campo
								etiqueta={`Talla ${talla.talla}`}
								inputMode="numeric"
								maxLength={4}
								value={capturado.piezas[talla.variante_id] ?? ""}
								onChange={(evento) => {
									const valor = evento.target.value.replace(/\D/g, "").slice(0, 4);
									cambiar((antes) => ({ ...antes, piezas: { ...antes.piezas, [talla.variante_id]: valor } }));
								}}
							/>
							<span className="text-etiqueta text-tinta3">de {talla.planeadas}</span>
						</div>
					))}
				</div>
				{errorDeCampo("tallas") === undefined ? null : (
					<LineaDeAviso tono="error">{errorDeCampo("tallas")}</LineaDeAviso>
				)}
			</Seccion>
			<Seccion titulo="Cortó">
				<div className="max-w-80">
					<Selector
						etiqueta="¿Quién cortó?"
						value={capturado.cortadorId}
						opciones={captura.personas.map((persona) => ({ valor: persona.persona_id, texto: persona.nombre }))}
						error={errorDeCampo("corto_persona_id")}
						onChange={(evento) => cambiar((antes) => ({ ...antes, cortadorId: evento.target.value }))}
					/>
				</div>
			</Seccion>
			<div className="m-0 grid grid-cols-5 gap-4 rounded-mediano bg-suave p-4 max-telefono:grid-cols-2">
				<Dato etiqueta="Piezas">{cifras.piezas}</Dato>
				<Dato etiqueta="Metros usados">{cifras.usados}</Dato>
				<Dato etiqueta="Por pieza">{cifras.porPieza}</Dato>
				<Dato etiqueta="Patrón">{cifras.patron}</Dato>
				<Dato etiqueta="Contra el patrón">
					<span className={cifras.rojo ? "text-texto-error" : undefined}>{cifras.contraPatron}</span>
				</Dato>
			</div>
			<footer className="flex flex-wrap items-center gap-4 border-linea border-t pt-4">
				<ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1 p-0 text-tinta2">
					{telas.map((tela) => (
						<li key={tela.tela.material_id}>{tela.destino}</li>
					))}
				</ul>
				<Boton
					variante="principal"
					icono={Scissors}
					disabled={!conConexion || cerrar.isPending || telas.some((tela) => tela.quedo.error !== null)}
					onClick={() =>
						cerrar.mutate(
							{ datos: datosDelCierre(captura, capturado), version: captura.version },
							{
								onSuccess: () => {
									setConCambios(false);
									window.setTimeout(() => ir({ marcado: captura.lote_id }, rutasDeProduccion.lotes), 0);
								},
								onError: (error) => {
									const leida = leerFalla(error);
									// Con un choque, se vuelve a leer la captura y se conserva lo escrito.
									if (leida.tipo === "choque") void volverALeer(consultas, loQueCambiaEnProduccion);
									const primero = leida.tipo === "regla" ? Object.values(leida.campos)[0] : undefined;
									if (primero !== undefined) avisar(primero, "no_se_pudo");
								},
							},
						)
					}
				>
					Cerrar corte
				</Boton>
			</footer>
			{pregunta}
		</section>
	);
}
