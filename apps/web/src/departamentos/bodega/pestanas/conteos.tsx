/**
 * Conteos y ajustes de Bodega: arriba «Nuevo conteo» y «Carga inicial» (cada uno a su cajón); «Ajustes en
 * autorización» (la dueña ve «Rechazar» y «Autorizar», con «Confirmar con Google»; las demás cuentas, «Esperando
 * autorización»); «Conteos» (su resultado en texto de color, como en la muestra: no es un estado) y «Ajustes
 * resueltos», cada uno con «Ver más».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Conteos y ajustes»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { decidirAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { type ajusteDeBodega, conteosYAjustesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { type ColumnaDeTabla, Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ClipboardList, PackagePlus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../comun.tsx";
import { useDireccionDeBodega } from "../direccion.ts";

/** Lo que regresa la consulta. */
type ConteosYAjustes = z.infer<typeof conteosYAjustesDeBodega.resultado>;

/**
 * El resultado de un conteo, en texto de color como en la muestra: «{n} diferencias» en ámbar, «Cuadró» en verde y
 * «Carga inicial» en gris. No es un estado: dice cómo salió, no qué falta.
 * @param props El resultado, con su color.
 */
function ResultadoDelConteo({
	resultado,
}: {
	resultado: ConteosYAjustes["conteos"]["renglones"][number]["resultado"];
}) {
	if (resultado.color === "ambar") return <LineaDeAviso tono="advertencia">{resultado.texto}</LineaDeAviso>;
	if (resultado.color === "verde") return <LineaDeAviso tono="bien">{resultado.texto}</LineaDeAviso>;
	return <span className="text-tinta3">{resultado.texto}</span>;
}

/** Un ajuste. */
type Ajuste = z.infer<typeof ajusteDeBodega>;

/** Las columnas que comparten los ajustes en autorización y los resueltos. */
const columnasDeAjuste: ColumnaDeTabla<Ajuste>[] = [
	{
		clave: "ajuste",
		encabezado: "Ajuste",
		celda: (ajuste) => (
			<DosRenglones arriba={ajuste.folio} abajo={`${textoDeDiaCorto(ajuste.fecha)} · ${ajuste.iniciales}`} />
		),
	},
	{ clave: "ubicacion", encabezado: "Ubicación", celda: (ajuste) => ajuste.ubicacion },
	{
		clave: "cambio",
		encabezado: "Cambio",
		celda: (ajuste) => (
			<span className="flex flex-col gap-1">
				{ajuste.cambios.map((cambio) => (
					<DosRenglones key={`${cambio.prenda}:${cambio.texto}`} arriba={cambio.prenda} abajo={cambio.texto} />
				))}
			</span>
		),
	},
	{ clave: "motivo", encabezado: "Motivo", celda: (ajuste) => ajuste.motivo },
];

/**
 * «Ajustes en autorización»: la dueña los decide; las demás cuentas ven que esperan a Dirección.
 * @param props Los ajustes y si la cuenta los puede decidir.
 */
function EnAutorizacion({ ajustes, puedeDecidir }: { ajustes: readonly Ajuste[]; puedeDecidir: boolean }) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(decidirAutorizacion);
	const [rechazando, setRechazando] = useState<Ajuste | null>(null);
	/** Manda la decisión con la versión de su autorización. */
	const decidir = (ajuste: Ajuste, decision: "autorizar" | "rechazar", motivo?: string) =>
		enviar({
			datos: {
				autorizacion_id: ajuste.autorizacion_id ?? "",
				decision,
				desde: "bodega",
				...(motivo === undefined ? {} : { motivo }),
			},
			...(ajuste.version === null ? {} : { version: ajuste.version }),
		});
	return (
		<Seccion titulo="Ajustes en autorización">
			{ajustes.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Ningún ajuste espera autorización" bien />
			) : (
				<Panel>
					<Tabla
						nombre="Ajustes en autorización"
						filas={ajustes}
						claveDeFila={(ajuste) => ajuste.ajuste_id}
						columnas={[
							...columnasDeAjuste,
							{
								clave: "botones",
								encabezado: "",
								alinear: "derecha",
								celda: (ajuste) =>
									puedeDecidir ? (
										<span className="flex justify-end gap-2">
											<Boton chico variante="peligro" disabled={!conConexion} onClick={() => setRechazando(ajuste)}>
												Rechazar
											</Boton>
											<Boton
												chico
												variante="principal"
												disabled={!conConexion || enviando}
												onClick={() => void decidir(ajuste, "autorizar")}
											>
												Autorizar
											</Boton>
										</span>
									) : (
										<Estado texto="Esperando autorización" />
									),
							},
						]}
					/>
				</Panel>
			)}
			{rechazando === null ? null : (
				<VentanaConMotivo
					titulo={`Rechazar ${rechazando.folio}`}
					subtitulo={rechazando.ubicacion}
					textoAccion="Rechazar ajuste"
					ejemplo="Por qué se rechaza"
					enviando={enviando}
					alCerrar={() => setRechazando(null)}
					alConfirmar={async (motivo) => {
						const salio = await decidir(rechazando, "rechazar", motivo);
						if (salio !== undefined) setRechazando(null);
					}}
				>
					<span className="flex flex-col gap-1">
						{rechazando.cambios.map((cambio) => (
							<DosRenglones key={`${cambio.prenda}:${cambio.texto}`} arriba={cambio.prenda} abajo={cambio.texto} />
						))}
					</span>
				</VentanaConMotivo>
			)}
		</Seccion>
	);
}

/** «Conteos», por páginas. */
function Conteos() {
	const paginas = usePaginas(
		conteosYAjustesDeBodega,
		{ lista: "conteos" },
		{ siguiente: (pagina) => pagina.conteos.cursor },
	);
	type Conteo = ConteosYAjustes["conteos"]["renglones"][number];
	return (
		<Seccion titulo="Conteos">
			<SegunConsulta consulta={paginas} renglones={3}>
				{({ pages }) => (
					<div className="flex flex-col gap-3">
						<Panel>
							<Tabla
								nombre="Conteos"
								filas={pages.flatMap((pagina) => pagina.conteos.renglones)}
								claveDeFila={(conteo: Conteo) => conteo.conteo_id}
								columnas={[
									{
										clave: "conteo",
										encabezado: "Conteo",
										celda: (conteo) => <DosRenglones arriba={conteo.folio} abajo={textoDeDiaCorto(conteo.fecha)} />,
									},
									{ clave: "ubicacion", encabezado: "Ubicación", celda: (conteo) => conteo.ubicacion },
									{ clave: "seccion", encabezado: "Sección", celda: (conteo) => conteo.seccion },
									{ clave: "responsable", encabezado: "Responsable", celda: (conteo) => conteo.responsable },
									{
										clave: "variantes",
										encabezado: "Variantes",
										alinear: "derecha",
										celda: (conteo) => conteo.variantes,
									},
									{
										clave: "resultado",
										encabezado: "Resultado",
										celda: (conteo) => <ResultadoDelConteo resultado={conteo.resultado} />,
									},
								]}
							/>
						</Panel>
						{paginas.hasNextPage ? (
							<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
					</div>
				)}
			</SegunConsulta>
		</Seccion>
	);
}

/** «Ajustes resueltos», por páginas. */
function Resueltos() {
	const paginas = usePaginas(
		conteosYAjustesDeBodega,
		{ lista: "resueltos" },
		{ siguiente: (pagina) => pagina.resueltos.cursor },
	);
	return (
		<Seccion titulo="Ajustes resueltos">
			<SegunConsulta consulta={paginas} renglones={3}>
				{({ pages }) => (
					<div className="flex flex-col gap-3">
						<Panel>
							<Tabla
								nombre="Ajustes resueltos"
								filas={pages.flatMap((pagina) => pagina.resueltos.renglones)}
								claveDeFila={(ajuste) => ajuste.ajuste_id}
								columnas={[
									...columnasDeAjuste,
									{
										clave: "resultado",
										encabezado: "Resultado",
										celda: (ajuste) =>
											ajuste.resultado === null ? null : (
												<Estado
													texto={ajuste.resultado.texto}
													color={ajuste.resultado.color}
													{...(ajuste.detalle_resultado === null ? {} : { abajo: ajuste.detalle_resultado })}
												/>
											),
									},
								]}
							/>
						</Panel>
						{paginas.hasNextPage ? (
							<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
					</div>
				)}
			</SegunConsulta>
		</Seccion>
	);
}

/**
 * Conteos y ajustes de Bodega.
 * @param props Lo que regresa `inventario.conteos_y_ajustes`.
 */
export function ConteosDeBodega({ datos }: { datos: ConteosYAjustes }) {
	const { abrir } = useDireccionDeBodega();
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap gap-2">
				<Boton icono={ClipboardList} onClick={() => abrir("conteo")}>
					Nuevo conteo
				</Boton>
				<Boton icono={PackagePlus} onClick={() => abrir("carga")}>
					Carga inicial
				</Boton>
			</div>
			<EnAutorizacion ajustes={datos.en_autorizacion} puedeDecidir={datos.puede_decidir} />
			<Conteos />
			<Resueltos />
		</div>
	);
}
