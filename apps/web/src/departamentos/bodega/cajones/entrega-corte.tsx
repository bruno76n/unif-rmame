/**
 * El cajón Entrega al corte (ancho): «{L} · Corte {fecha}» y la prenda; las cifras (lo que pide la tela principal, los
 * metros marcados, en rojo si alguna tela no alcanza con sus propios rollos (`cadaTelaAlcanza`), y las piezas); una sección por cada tela por entregar con sus rollos de Bodega (los
 * sugeridos ya marcados); los avíos con si alcanzan; «Quién recibe»; y «Entregar al corte», que llama
 * `inventario.entregar_al_corte` con la versión de receta con que se calculó.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Entrega al corte) y docs/modulos/inventario/entregas-a-corte.md
 *
 * Los avisos que no detienen (la mezcla de partidas y lo que falta de una tela) los dice la acción al entregar.
 */

import { cadaTelaAlcanza } from "@uniformame/compartido/calculos/corte";
import { cantidadEnTexto } from "@uniformame/compartido/calculos/cuenta-material";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { detalleDeEntregaCorte } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { entregarAlCorte } from "@uniformame/compartido/contratos/inventario/corte";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleDeEntregaCorte.resultado>;

/**
 * El cuerpo del cajón: las telas con sus rollos, los avíos y quién recibe.
 * @param props El detalle, los rollos marcados y quién recibe, con cómo cambiarlos.
 */
function CuerpoDeEntrega({
	detalle,
	marcados,
	alMarcar,
	recibe,
	alRecibir,
}: {
	detalle: Detalle;
	marcados: ReadonlySet<string>;
	alMarcar: (rolloId: string, marcado: boolean) => void;
	recibe: string;
	alRecibir: (personaId: string) => void;
}) {
	// Por tela, sus rollos marcados: cada tela alcanza (o no) con los suyos.
	const porTela = detalle.telas.map((tela) => ({
		pide: BigInt(tela.metros_milesimos),
		rollos: tela.rollos
			.filter((rollo) => marcados.has(rollo.rollo_id))
			.map((rollo) => ({ rolloId: rollo.rollo_id, milesimos: BigInt(rollo.milesimos) })),
	}));
	const elegidos = porTela.flatMap((tela) => tela.rollos);
	const milesimos = elegidos.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
	type Avio = Detalle["avios"][number];
	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
				<CifraDeCajon numero={`${detalle.metros_principal} m`} nombre="necesita el corte" />
				<CifraDeCajon
					numero={`${cantidadEnTexto(milesimos)} m`}
					nombre={`en ${elegidos.length} ${elegidos.length === 1 ? "rollo marcado" : "rollos marcados"}`}
					rojo={!cadaTelaAlcanza(porTela)}
				/>
				<CifraDeCajon numero={String(detalle.piezas)} nombre="piezas" />
			</div>
			{detalle.telas.map((tela) => (
				<section key={tela.material_id} className="flex flex-col gap-2">
					<TituloDeBloque
						titulo={tela.papel === null ? tela.tela : `${tela.tela} · ${tela.papel}`}
						detalle={`necesita ${tela.metros} m · ${tela.rollos.length} rollos en bodega`}
					/>
					{tela.rollos.length === 0 ? (
						<TextoConTono tono="ambar">No hay rollos de esta tela: se entrega cuando llegue</TextoConTono>
					) : (
						tela.rollos.map((rollo) => (
							<Casilla
								key={rollo.rollo_id}
								etiqueta={`${rollo.folio}${rollo.es_retazo ? " · retazo" : ""}${rollo.partida === null ? "" : ` · partida ${rollo.partida}`} · ${rollo.metros} m`}
								marcada={marcados.has(rollo.rollo_id)}
								alCambiar={(marcada) => alMarcar(rollo.rollo_id, marcada)}
							/>
						))
					)}
				</section>
			))}
			{detalle.avios.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Avíos" />
					<Tabla
						nombre="Avíos"
						filas={detalle.avios}
						claveDeFila={(avio: Avio) => avio.material}
						columnas={[
							{ clave: "material", encabezado: "Material", celda: (avio) => avio.material },
							{ clave: "entrega", encabezado: "Se entrega", alinear: "derecha", celda: (avio) => avio.se_entrega },
							{
								clave: "hay",
								encabezado: "Hay",
								alinear: "derecha",
								celda: (avio) => (avio.alcanza ? avio.hay : <TextoConTono tono="rojo">{avio.hay}</TextoConTono>),
							},
						]}
					/>
				</section>
			)}
			<Selector
				etiqueta="Quién recibe"
				vacio="Sin decir"
				opciones={detalle.personas.map((persona) => ({ valor: persona.persona_id, texto: persona.nombre }))}
				value={recibe}
				onChange={(evento) => alRecibir(evento.target.value)}
			/>
		</div>
	);
}

/**
 * El cajón Entrega al corte.
 * @param props El lote y cómo cerrar el cajón.
 */
export function CajonEntregaCorte({ loteId, alCerrar }: { loteId: string; alCerrar: () => void }) {
	const consulta = useConsulta(detalleDeEntregaCorte, { lote_id: loteId });
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(entregarAlCorte);
	const [cambios, setCambios] = useState<{ marcados?: ReadonlySet<string>; recibe: string }>({ recibe: "" });
	const detalle = consulta.data;
	// Mientras no se toca nada, van marcados los sugeridos.
	const marcados =
		cambios.marcados ??
		new Set(
			(detalle?.telas ?? []).flatMap((tela) =>
				tela.rollos.filter((rollo) => rollo.sugerido).map((rollo) => rollo.rollo_id),
			),
		);
	const conCambios = cambios.marcados !== undefined || cambios.recibe !== "";
	const cierre = useCierreDelCajon(conCambios, alCerrar);
	const entregar = async () => {
		if (detalle === undefined) return;
		const salio = await enviar({
			datos: {
				lote_id: detalle.lote_id,
				receta_version_id: detalle.receta_version_id,
				rollo_ids: [...marcados],
				...(cambios.recibe === "" ? {} : { recibio_persona_id: cambios.recibe }),
			},
		});
		if (salio !== undefined) cierre.alCerrar();
	};
	return (
		<Cajon
			abierto
			ancho
			conCambios={conCambios}
			alCerrar={cierre.alCerrar}
			{...(detalle === undefined
				? {}
				: { contexto: `${detalle.folio} · Corte ${textoDeDiaCorto(detalle.fecha_corte)}` })}
			titulo={detalle?.prenda ?? ""}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || detalle === undefined || marcados.size === 0}
					onClick={() => void entregar()}
				>
					Entregar al corte
				</Boton>
			}
		>
			{choco && detalle !== undefined ? <EstadoDePantalla tipo="choque" documento={detalle.folio} /> : null}
			<SegunConsulta consulta={consulta}>
				{(datos) => (
					<CuerpoDeEntrega
						detalle={datos}
						marcados={marcados}
						alMarcar={(rolloId, marcado) => {
							const nuevos = new Set(marcados);
							if (marcado) nuevos.add(rolloId);
							else nuevos.delete(rolloId);
							setCambios((antes) => ({ ...antes, marcados: nuevos }));
						}}
						recibe={cambios.recibe}
						alRecibir={(recibe) => setCambios((antes) => ({ ...antes, recibe }))}
					/>
				)}
			</SegunConsulta>
			{cierre.pregunta}
		</Cajon>
	);
}
