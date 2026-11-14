/**
 * El cajón Nuevo conteo o Conteo de diferencia (ancho). El conteo es ciego: la pantalla no dice lo que tiene el sistema.
 * En el nuevo, la ubicación (Bodega o Aduana) y la sección («Elige la sección que vas a contar»; cambiarla borra lo
 * contado); el de una diferencia trae solo su variante, en su ubicación. «Hora del conteo» (no después de ahora), «{n}
 * de {m}» contadas, la tabla con «Contado» (hasta 4 cifras), «Motivo del ajuste, si algo no cuadra» y «Guardar conteo»,
 * que llama `inventario.guardar_conteo`. Al guardar, el nuevo abre Conteos y ajustes; el de una diferencia se queda.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Nuevo conteo y Conteo de diferencia) y
 * docs/modulos/inventario/conteos.md (regla 1)
 */

import { detalleDeConteo } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { guardarConteo } from "@uniformame/compartido/contratos/inventario/diferencias";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeBodega } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleDeConteo.resultado>;

/**
 * Un momento como lo pide un campo `datetime-local`: «2026-11-13T09:30», en la hora de este aparato.
 * @param momento El momento.
 */
export function paraElCampo(momento: Date): string {
	const local = new Date(momento.getTime() - momento.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

/**
 * La tabla de lo que se cuenta: prenda y talla con su escuela, y «Contado».
 * @param props Las variantes, lo contado y cómo cambiarlo.
 */
export function TablaDeConteo({
	variantes,
	contados,
	alContar,
	encabezado,
}: {
	variantes: Detalle["variantes"];
	contados: Readonly<Record<string, string>>;
	alContar: (varianteId: string, texto: string) => void;
	encabezado: string;
}) {
	type Variante = Detalle["variantes"][number];
	return (
		<Tabla
			nombre="Lo que se cuenta"
			filas={variantes}
			claveDeFila={(variante: Variante) => variante.variante_id}
			columnas={[
				{
					clave: "variante",
					encabezado: "Prenda y talla",
					celda: (variante) => (
						<DosRenglones
							arriba={`${variante.prenda} · talla ${variante.talla}`}
							abajo={variante.con_movimientos ? "ya tiene movimientos: usa un conteo" : variante.escuela}
						/>
					),
				},
				{
					clave: "contado",
					encabezado,
					celda: (variante) => (
						<Campo
							etiqueta={`${encabezado} de ${variante.prenda} talla ${variante.talla}`}
							inputMode="numeric"
							maxLength={4}
							disabled={variante.con_movimientos}
							value={contados[variante.variante_id] ?? ""}
							onChange={(evento) => alContar(variante.variante_id, evento.target.value.replace(/\D/g, ""))}
						/>
					),
				},
			]}
		/>
	);
}

/**
 * El cajón del conteo.
 * @param props La diferencia que se cuenta (sin ella, un conteo nuevo) y cómo cerrar el cajón.
 */
export function CajonConteo({ diferenciaId, alCerrar }: { diferenciaId: string | undefined; alCerrar: () => void }) {
	const { navegar } = useDireccionDeBodega();
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(guardarConteo);
	const [ubicacionId, setUbicacionId] = useState("");
	const [seccionId, setSeccionId] = useState("");
	const [hora, setHora] = useState(() => paraElCampo(new Date()));
	const [contados, setContados] = useState<Readonly<Record<string, string>>>({});
	const [motivoId, setMotivoId] = useState("");
	const [motivoTexto, setMotivoTexto] = useState("");
	const [errores, setErrores] = useState<Record<string, string>>({});
	const [guardado, setGuardado] = useState(false);
	const consulta = useConsulta(
		detalleDeConteo,
		diferenciaId === undefined
			? { ...(seccionId === "" ? {} : { seccion_id: seccionId }) }
			: { diferencia_id: diferenciaId },
		true,
		true,
	);
	const detalle = consulta.data;
	const ubicacion = detalle?.diferencia?.ubicacion_id ?? (ubicacionId || detalle?.ubicaciones[0]?.id || "");
	const cuantos = Object.values(contados).filter((texto) => texto !== "").length;
	const cierre = useCierreDelCajon(cuantos > 0 && !guardado, alCerrar);
	// Ya guardado: el de una diferencia se queda en su pestaña; el nuevo abre Conteos y ajustes.
	useEffect(() => {
		if (!guardado) return;
		if (diferenciaId === undefined) navegar({}, "conteos");
		else cierre.alCerrar();
	}, [guardado, diferenciaId, navegar, cierre]);
	const guardar = async () => {
		const salio = await enviar(
			{
				datos: {
					ubicacion_id: ubicacion,
					...(diferenciaId === undefined ? { seccion_id: seccionId } : { diferencia_id: diferenciaId }),
					contado_en: new Date(hora).toISOString(),
					renglones: Object.entries(contados)
						.filter(([, texto]) => texto !== "")
						.map(([variante_id, texto]) => ({ variante_id, piezas: Number(texto) })),
					...(motivoId === "" ? {} : { motivo_id: motivoId }),
					...(motivoTexto.trim() === "" ? {} : { motivo_texto: motivoTexto.trim() }),
				},
			},
			(falla) => setErrores(falla.campos),
		);
		if (salio !== undefined) setGuardado(true);
	};
	return (
		<Cajon
			abierto
			ancho
			conCambios={cuantos > 0 && !guardado}
			alCerrar={cierre.alCerrar}
			contexto={
				diferenciaId === undefined
					? "Conteo físico"
					: detalle?.diferencia == null
						? ""
						: `${detalle.diferencia.folio} · ${detalle.diferencia.ubicacion}`
			}
			titulo={diferenciaId === undefined ? "Nuevo conteo" : "Conteo de diferencia"}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || cuantos === 0 || ubicacion === ""}
					onClick={() => void guardar()}
				>
					Guardar conteo
				</Boton>
			}
		>
			{choco ? <EstadoDePantalla tipo="choque" documento="El conteo" /> : null}
			<SegunConsulta consulta={consulta}>
				{(datos) => (
					<div className="flex flex-col gap-5">
						{diferenciaId === undefined ? (
							<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
								<Selector
									etiqueta="Ubicación"
									opciones={datos.ubicaciones.map((suya) => ({ valor: suya.id, texto: suya.nombre }))}
									value={ubicacion}
									onChange={(evento) => setUbicacionId(evento.target.value)}
								/>
								<Selector
									etiqueta="Sección"
									vacio="Elige la sección que vas a contar"
									opciones={datos.secciones.map((suya) => ({ valor: suya.id, texto: suya.nombre }))}
									value={seccionId}
									onChange={(evento) => {
										setSeccionId(evento.target.value);
										setContados({});
									}}
								/>
							</div>
						) : null}
						<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
							<Campo
								etiqueta="Hora del conteo"
								type="datetime-local"
								max={paraElCampo(new Date())}
								value={hora}
								error={errores.contado_en}
								onChange={(evento) => setHora(evento.target.value)}
							/>
							<CifraDeCajon numero={`${cuantos} de ${datos.variantes.length}`} nombre="contadas" />
						</div>
						<TablaDeConteo
							variantes={datos.variantes}
							contados={contados}
							encabezado="Contado"
							alContar={(varianteId, texto) => setContados((antes) => ({ ...antes, [varianteId]: texto }))}
						/>
						<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
							<Selector
								etiqueta="Motivo del ajuste, si algo no cuadra"
								vacio="Sin motivo"
								opciones={datos.motivos_ajuste.map((suyo) => ({ valor: suyo.id, texto: suyo.nombre }))}
								value={motivoId}
								error={errores.motivo_id}
								onChange={(evento) => setMotivoId(evento.target.value)}
							/>
							<Campo
								etiqueta="Lo que quieras agregar al motivo"
								maxLength={200}
								value={motivoTexto}
								onChange={(evento) => setMotivoTexto(evento.target.value)}
							/>
						</div>
					</div>
				)}
			</SegunConsulta>
			{cierre.pregunta}
		</Cajon>
	);
}
