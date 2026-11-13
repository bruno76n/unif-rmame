/**
 * La página de la receta, dentro de Recetas (`?cajon=receta&id={producto}`, y `&version={n}` para ver una vieja):
 * «‹ Recetas», el encabezado con su estado y sus datos, lo que lleva el próximo corte (la cuenta de material del
 * paquete compartido, mientras se escribe), «Medidas de la prenda», «Tela» con «Para cortar», «Avíos», «Patrón contra
 * corte, por talla», «Versiones» y la barra de guardar fija abajo → `patronaje.guardar_receta`. Las cajitas aceptan
 * números y un punto, y lo pegado de una hoja de cálculo se reparte por tallas y renglones. Salir con cambios pregunta
 * antes.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («La página de la receta») y docs/interfaz/TEXTOS.md («La receta»)
 */

import { useQueryClient } from "@tanstack/react-query";
import { recetaDeLaPrenda } from "@uniformame/compartido/contratos/patronaje/receta";
import { guardarReceta } from "@uniformame/compartido/contratos/patronaje/recetas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ChevronLeft, Plus, Scissors, X } from "lucide-react";
import { type ClipboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { leerFalla, useAccion, useConsulta, volverALeer } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { direcciones, useDireccion } from "../direccion.ts";
import { loQueCambiaEnPatronaje } from "../invalidar.ts";
import { TablaPatronContraCorte } from "../patron-contra-corte.tsx";
import {
	conversionDelAvio,
	datosParaGuardar,
	esNumero,
	hayCambios,
	type LineaCapturada,
	limpiarCajita,
	loQueLlevaElCorte,
	type MaterialDeLaReceta,
	type MedidaCapturada,
	paraCortar,
	pegadoDeLaHoja,
	type RecetaCapturada,
	type RecetaLeida,
	recetaCapturada,
	unidadEnPalabras,
} from "../receta-en-pantalla.ts";
import { type RenglonPorLlenar, VentanaLlenar } from "../ventanas/llenar.tsx";

/** Una talla de la prenda. */
type Talla = RecetaLeida["tallas"][number];

/**
 * La página de la receta de una prenda.
 * @param props La prenda.
 */
export function PaginaDeReceta({ productoId }: { productoId: string }) {
	const { leer } = useDireccion();
	const version = leer("version");
	const consulta = useConsulta(recetaDeLaPrenda, {
		producto_id: productoId,
		...(version === undefined ? {} : { version_numero: Number(version) }),
	});
	if (consulta.isPending) return <EstadoDePantalla tipo="cargando" renglones={8} />;
	if (consulta.data === undefined) {
		return <EstadoDePantalla tipo="error" alReintentar={() => void consulta.refetch()} />;
	}
	return (
		<EditorDeReceta key={`${consulta.data.receta_id}-${consulta.data.viendo ?? "vigente"}`} receta={consulta.data} />
	);
}

/** El renglón que tiene un error de la acción, por su medida o su material. */
interface Errores {
	medidas: Record<string, string>;
	lineas: Record<string, string>;
	todos: string[];
}

/** Sin errores. */
const sinErrores: Errores = { medidas: {}, lineas: {}, todos: [] };

/**
 * La página con lo capturado.
 * @param props Lo que regresa la consulta.
 */
function EditorDeReceta({ receta }: { receta: RecetaLeida }) {
	const { ir } = useDireccion();
	const conConexion = useConConexion();
	const avisar = useAvisar();
	const consultas = useQueryClient();
	const base = useMemo(() => recetaCapturada(receta), [receta]);
	const [capturada, setCapturada] = useState<RecetaCapturada>(base);
	const [intentado, setIntentado] = useState(false);
	const [errores, setErrores] = useState<Errores>(sinErrores);
	const [llenando, setLlenando] = useState<{ cual: "medida" | "linea"; clave: string } | null>(null);
	const guardar = useAccion(guardarReceta, loQueCambiaEnPatronaje);
	const falla = guardar.error === null ? null : leerFalla(guardar.error);
	// Con lo guardado ya leído de nuevo, lo capturado es la versión nueva; tras un choque se conserva lo capturado.
	const guardado = useRef(false);
	useEffect(() => {
		if (!guardado.current) return;
		guardado.current = false;
		setCapturada(base);
		setIntentado(false);
		setErrores(sinErrores);
	}, [base]);
	const soloLeer = receta.viendo !== null;
	const conCambios = !soloLeer && hayCambios(base, capturada);
	const pregunta = usePreguntarAntesDeSalir(conCambios);
	/**
	 * Cambia un material capturado.
	 * @param materialId El material.
	 * @param cambio Lo que cambia.
	 */
	const cambiarLinea = (materialId: string, cambio: (linea: LineaCapturada) => LineaCapturada) =>
		setCapturada((antes) => ({
			...antes,
			lineas: antes.lineas.map((linea) => (linea.material_id === materialId ? cambio(linea) : linea)),
		}));
	/**
	 * Cambia una medida capturada.
	 * @param nombre La medida.
	 * @param cambio Lo que cambia.
	 */
	const cambiarMedida = (nombre: string, cambio: (medida: MedidaCapturada) => MedidaCapturada) =>
		setCapturada((antes) => ({
			...antes,
			medidas: antes.medidas.map((medida) => (medida.medida === nombre ? cambio(medida) : medida)),
		}));
	/**
	 * Reparte lo pegado desde una hoja de cálculo: por tallas desde la cajita, y por renglones hacia abajo en su tabla.
	 * @param evento El pegado.
	 * @param renglones Las claves de los renglones de esa tabla que llevan tallas.
	 * @param desde El renglón y la talla de la cajita.
	 * @param poner Cómo se pone un valor en un renglón y una talla.
	 */
	const pegar = (
		evento: ClipboardEvent<HTMLInputElement>,
		renglones: readonly string[],
		desde: { renglon: string; talla: string },
		poner: (renglon: string, talla: string, valor: string) => void,
	) => {
		const tabla = pegadoDeLaHoja(evento.clipboardData.getData("text"));
		if (tabla === null) return;
		evento.preventDefault();
		const primerRenglon = renglones.indexOf(desde.renglon);
		const primeraTalla = receta.tallas.findIndex((talla) => talla.talla_id === desde.talla);
		tabla.forEach((valores, i) => {
			const renglon = renglones[primerRenglon + i];
			if (renglon === undefined) return;
			valores.forEach((valor, j) => {
				const talla = receta.tallas[primeraTalla + j];
				if (talla !== undefined) poner(renglon, talla.talla_id, valor);
			});
		});
		avisar("Valores pegados desde la hoja de cálculo", "bien");
	};
	/** Manda la receta: con errores, los dice en cada renglón, en la barra y en el aviso de abajo. */
	const alGuardar = () => {
		setIntentado(true);
		const { datos, medidas, lineas } = datosParaGuardar(receta, capturada);
		guardar.mutate(
			{ datos, version: receta.version },
			{
				onSuccess: () => {
					guardado.current = true;
				},
				onError: (error) => {
					const leida = leerFalla(error);
					if (leida.tipo === "choque") void volverALeer(consultas, loQueCambiaEnPatronaje);
					if (leida.tipo !== "regla" || Object.keys(leida.campos).length === 0) return;
					// Los campos de la acción van por posición: `medidas.{i}` y `lineas.{i}`, en el orden que se mandaron.
					const deRenglon = (prefijo: string, claves: readonly string[]) =>
						Object.fromEntries(
							Object.entries(leida.campos).flatMap(([campo, mensaje]) => {
								const [suyo, posicion] = campo.split(".");
								const clave = claves[Number(posicion)];
								return suyo === prefijo && clave !== undefined ? [[clave, mensaje]] : [];
							}),
						);
					setErrores({
						medidas: deRenglon("medidas", medidas),
						lineas: deRenglon("lineas", lineas),
						todos: Object.values(leida.campos),
					});
					const [primero] = Object.values(leida.campos);
					if (primero !== undefined) avisar(primero, "no_se_pudo");
				},
			},
		);
	};
	const renglonPorLlenar: RenglonPorLlenar | null = (() => {
		if (llenando === null) return null;
		if (llenando.cual === "medida") {
			const medida = capturada.medidas.find((una) => una.medida === llenando.clave);
			return medida === undefined
				? null
				: { nombre: medida.medida, unidad: "cm", esMedida: true, valores: medida.valores };
		}
		const linea = capturada.lineas.find((una) => una.material_id === llenando.clave);
		return linea === undefined
			? null
			: { nombre: material(receta, linea), unidad: linea.unidad_receta, esMedida: false, valores: linea.tallas };
	})();
	return (
		<div className="flex flex-col gap-6 pb-28">
			<Encabezado receta={receta} alRegresar={() => ir({ cajon: undefined, id: undefined, version: undefined })} />
			<LoQueLleva receta={receta} capturada={capturada} />
			<Medidas
				receta={receta}
				capturada={capturada}
				soloLeer={soloLeer}
				intentado={intentado}
				errores={errores.medidas}
				alCambiar={setCapturada}
				alCambiarMedida={cambiarMedida}
				alLlenar={(clave) => setLlenando({ cual: "medida", clave })}
				alPegar={(evento, desde) =>
					pegar(
						evento,
						capturada.medidas.map((medida) => medida.medida),
						desde,
						(renglon, talla, valor) =>
							cambiarMedida(renglon, (medida) => ({ ...medida, valores: { ...medida.valores, [talla]: valor } })),
					)
				}
			/>
			<Telas
				receta={receta}
				capturada={capturada}
				soloLeer={soloLeer}
				intentado={intentado}
				errores={errores.lineas}
				alCambiar={setCapturada}
				alCambiarLinea={cambiarLinea}
				alLlenar={(clave) => setLlenando({ cual: "linea", clave })}
				alPegar={(evento, desde) =>
					pegar(
						evento,
						capturada.lineas.filter((linea) => linea.papel !== "avio").map((linea) => linea.material_id),
						desde,
						(renglon, talla, valor) =>
							cambiarLinea(renglon, (linea) => ({ ...linea, tallas: { ...linea.tallas, [talla]: valor } })),
					)
				}
			/>
			<Avios
				receta={receta}
				capturada={capturada}
				soloLeer={soloLeer}
				intentado={intentado}
				errores={errores.lineas}
				alCambiar={setCapturada}
				alCambiarLinea={cambiarLinea}
				alLlenar={(clave) => setLlenando({ cual: "linea", clave })}
				alPegar={(evento, desde) =>
					pegar(
						evento,
						capturada.lineas
							.filter((linea) => linea.papel === "avio" && linea.modo === "por_talla")
							.map((linea) => linea.material_id),
						desde,
						(renglon, talla, valor) =>
							cambiarLinea(renglon, (linea) => ({ ...linea, tallas: { ...linea.tallas, [talla]: valor } })),
					)
				}
			/>
			{receta.patron_contra_corte === null ? null : (
				<Seccion
					titulo="Patrón contra corte, por talla"
					explicacion={`${receta.patron_contra_corte.tela}, metros por prenda`}
				>
					<TablaPatronContraCorte tallas={receta.patron_contra_corte.tallas} />
				</Seccion>
			)}
			<Versiones receta={receta} />
			{soloLeer ? null : (
				<BarraDeGuardar
					receta={receta}
					capturada={capturada}
					conCambios={conCambios}
					errores={intentado ? errores.todos : []}
					ocupado={!conConexion || guardar.isPending}
					choque={falla?.tipo === "choque"}
					alEscribirMotivo={(motivo) => setCapturada((antes) => ({ ...antes, motivo }))}
					alDescartar={() => {
						setCapturada(base);
						setIntentado(false);
						setErrores(sinErrores);
					}}
					alGuardar={alGuardar}
				/>
			)}
			<VentanaLlenar
				renglon={renglonPorLlenar}
				tallas={receta.tallas}
				tallaBaseId={receta.talla_base_id}
				alLlenar={(valores) => {
					if (llenando?.cual === "medida") cambiarMedida(llenando.clave, (medida) => ({ ...medida, valores }));
					if (llenando?.cual === "linea") cambiarLinea(llenando.clave, (linea) => ({ ...linea, tallas: valores }));
				}}
				alCerrar={() => setLlenando(null)}
			/>
			{pregunta}
		</div>
	);
}

/**
 * «‹ Recetas», la prenda con su estado y su versión, y sus datos: próximo corte, desperdicio y desarrollo.
 * @param props La receta y qué hacer al regresar.
 */
function Encabezado({ receta, alRegresar }: { receta: RecetaLeida; alRegresar: () => void }) {
	const { ir, irA } = useDireccion();
	const desarrollo = receta.desarrollo;
	return (
		<header className="flex flex-col gap-4">
			<div>
				<Boton variante="fantasma" chico icono={ChevronLeft} onClick={alRegresar}>
					Recetas
				</Boton>
			</div>
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex flex-1 flex-col">
					<h2 className="m-0 font-bold text-titulo-seccion">{receta.prenda}</h2>
					<span className="text-tinta2">{receta.subtitulo}</span>
				</div>
				<Estado
					texto={receta.estado.texto}
					color={receta.estado.color}
					abajo={
						receta.viendo !== null
							? `Versión ${receta.viendo}`
							: receta.vigente === null
								? "Todavía no hay versión"
								: `Versión ${receta.vigente} vigente`
					}
				/>
			</div>
			{receta.viendo === null ? null : (
				<div>
					<Boton chico onClick={() => ir({ version: undefined })}>
						Ver la versión vigente
					</Boton>
				</div>
			)}
			<dl className="m-0 grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
				<Dato nombre="Próximo corte">{receta.proximo_corte?.texto ?? "Sin corte programado"}</Dato>
				<Dato nombre="Desperdicio en el tendido">{receta.desperdicio.texto}</Dato>
				{desarrollo === null ? null : (
					<Dato nombre="Desarrollo">
						<button
							type="button"
							className="font-semibold text-marca underline-offset-2 hover:underline"
							onClick={() => irA(direcciones.desarrollo(desarrollo.desarrollo_id))}
						>
							{desarrollo.texto}
						</button>
					</Dato>
				)}
			</dl>
		</header>
	);
}

/**
 * Un dato del encabezado: su nombre en chico y su valor.
 * @param props El nombre y el valor.
 */
function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-mediano bg-panel p-3 shadow-panel">
			<dt className="text-etiqueta text-tinta3">{nombre}</dt>
			<dd className="m-0 font-semibold text-tinta">{children}</dd>
		</div>
	);
}

/**
 * «Con esta receta, el corte {lote} de {n} piezas lleva»: cada material, mientras se escribe.
 * @param props La receta y lo capturado.
 */
function LoQueLleva({ receta, capturada }: { receta: RecetaLeida; capturada: RecetaCapturada }) {
	const corte = receta.proximo_corte;
	const lleva = loQueLlevaElCorte(receta, capturada);
	if (corte === null || lleva === null) return null;
	return (
		<section
			aria-label="Lo que lleva el corte"
			className="flex flex-col gap-3 rounded-grande bg-panel p-4 shadow-panel"
		>
			<h3 className="m-0 flex items-center gap-2 font-semibold text-tinta2">
				<Scissors aria-hidden="true" size={17} />
				Con esta receta, el corte {corte.lote} de {corte.piezas} piezas lleva
			</h3>
			<ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
				{lleva.map((material) => (
					<li key={material.material_id} className="flex flex-col">
						<b className="text-subtitulo tabular-nums">{material.lleva}</b>
						<span className="text-etiqueta text-tinta2">{material.nombre}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

/**
 * Una sección de la página: su título, su explicación y su contenido.
 * @param props El título, la explicación y el contenido.
 */
function Seccion({ titulo, explicacion, children }: { titulo: string; explicacion: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<header className="flex items-baseline gap-3">
				<h3 className="m-0 font-bold text-subtitulo">{titulo}</h3>
				<span className="text-tinta2">{explicacion}</span>
			</header>
			<div className="flex flex-col gap-3 rounded-grande bg-panel p-4 shadow-panel">{children}</div>
		</section>
	);
}

/**
 * Una cajita de captura: números y un punto (la coma se vuelve punto); en rojo si no es número o, después del primer
 * intento, si falta.
 * @param props Su etiqueta para el lector de pantalla, su valor, si falta o se ve nada más, y qué hacer al cambiar y al
 * pegar.
 */
function Cajita({
	etiqueta,
	valor,
	falta,
	soloLeer,
	ancha = false,
	alCambiar,
	alPegar,
}: {
	etiqueta: string;
	valor: string;
	falta: boolean;
	soloLeer: boolean;
	ancha?: boolean;
	alCambiar: (valor: string) => void;
	alPegar?: (evento: ClipboardEvent<HTMLInputElement>) => void;
}) {
	const enRojo = (valor !== "" && !esNumero(valor)) || falta;
	return (
		<input
			aria-label={etiqueta}
			aria-invalid={enRojo ? true : undefined}
			inputMode="decimal"
			autoComplete="off"
			maxLength={9}
			readOnly={soloLeer}
			value={valor}
			onChange={(evento) => alCambiar(limpiarCajita(evento.target.value))}
			onPaste={alPegar}
			className={`h-9 rounded-chico border bg-panel px-2 text-right tabular-nums focus:border-marca focus:outline-none focus:ring-3 focus:ring-marca/20 read-only:bg-suave ${
				ancha ? "w-24" : "w-16"
			} ${enRojo ? "border-texto-error" : "border-linea2"}`}
		/>
	);
}

/** Lo que reciben las tres tablas de captura. */
interface PropsDeCaptura {
	receta: RecetaLeida;
	capturada: RecetaCapturada;
	soloLeer: boolean;
	intentado: boolean;
	errores: Readonly<Record<string, string>>;
	alCambiar: (cambio: (antes: RecetaCapturada) => RecetaCapturada) => void;
	alLlenar: (clave: string) => void;
	alPegar: (evento: ClipboardEvent<HTMLInputElement>, desde: { renglon: string; talla: string }) => void;
}

/**
 * El encabezado de la columna de una talla: su nombre y «esp.» si es de pedido especial.
 * @param talla La talla.
 */
function encabezadoDeTalla(talla: Talla): string {
	return talla.especial ? `${talla.nombre} esp.` : talla.nombre;
}

/**
 * El nombre de un renglón con su línea de abajo y, si la acción dijo algo de él, su error.
 * @param props El nombre, la línea de abajo y el error.
 */
function NombreDelRenglon({
	nombre,
	abajo,
	error,
}: {
	nombre: ReactNode;
	abajo: ReactNode;
	error?: string | undefined;
}) {
	return (
		<span className="flex min-w-48 flex-col gap-0.5">
			<b>{nombre}</b>
			<span className="flex flex-wrap items-center gap-1 text-etiqueta text-tinta2">{abajo}</span>
			{error === undefined ? null : (
				<span role="alert" className="text-etiqueta text-texto-error">
					{error}
				</span>
			)}
		</span>
	);
}

/**
 * «Llenar desde una talla», en la línea de abajo de un renglón.
 * @param props Qué hacer al tocarlo.
 */
function LlenarDesdeUnaTalla({ alTocar, soloLeer }: { alTocar: () => void; soloLeer: boolean }) {
	if (soloLeer) return null;
	return (
		<button type="button" onClick={alTocar} className="font-semibold text-marca hover:underline">
			Llenar desde una talla
		</button>
	);
}

/**
 * El botón para quitar un renglón.
 * @param props Qué se quita y qué hacer al tocarlo.
 */
function Quitar({ nombre, alTocar }: { nombre: string; alTocar: () => void }) {
	return (
		<Boton variante="fantasma" chico icono={X} aria-label={`Quitar ${nombre}`} onClick={alTocar}>
			{""}
		</Boton>
	);
}

/**
 * «Medidas de la prenda»: un renglón por medida con una cajita por talla, «Llenar desde una talla» y su botón para
 * quitarla; abajo, «Agregar medida» («{medida} ya está en las medidas» si se repite).
 * @param props Lo de las tablas de captura y cómo cambia una medida.
 */
function Medidas({
	receta,
	capturada,
	soloLeer,
	intentado,
	errores,
	alCambiar,
	alCambiarMedida,
	alLlenar,
	alPegar,
}: PropsDeCaptura & {
	alCambiarMedida: (nombre: string, cambio: (medida: MedidaCapturada) => MedidaCapturada) => void;
}) {
	const [nueva, setNueva] = useState("");
	const repetida = capturada.medidas.some(
		(medida) => medida.medida.toLocaleLowerCase("es-MX") === nueva.trim().toLocaleLowerCase("es-MX"),
	);
	// El nombre de una medida lo revisa el esquema del contrato: al menos 3 letras.
	const nombreValido = guardarReceta.entrada.shape.medidas.element.shape.medida.safeParse(nueva).success;
	return (
		<Seccion titulo="Medidas de la prenda" explicacion="Centímetros, talla por talla">
			{capturada.medidas.length === 0 ? (
				<p className="m-0 text-tinta3">Sin medidas</p>
			) : (
				<Tabla
					nombre="Medidas de la prenda"
					filas={capturada.medidas}
					claveDeFila={(medida) => medida.medida}
					columnas={[
						{
							clave: "medida",
							encabezado: "Medida",
							celda: (medida) => (
								<NombreDelRenglon
									nombre={medida.medida}
									abajo={
										<>
											cm ·
											<LlenarDesdeUnaTalla soloLeer={soloLeer} alTocar={() => alLlenar(medida.medida)} />
										</>
									}
									error={errores[medida.medida]}
								/>
							),
						},
						...receta.tallas.map((talla) => ({
							clave: talla.talla_id,
							encabezado: encabezadoDeTalla(talla),
							celda: (medida: MedidaCapturada) => (
								<Cajita
									etiqueta={`${medida.medida} en centímetros, talla ${talla.nombre}`}
									valor={medida.valores[talla.talla_id] ?? ""}
									falta={intentado && !talla.especial && (medida.valores[talla.talla_id] ?? "") === ""}
									soloLeer={soloLeer}
									alCambiar={(valor) =>
										alCambiarMedida(medida.medida, (antes) => ({
											...antes,
											valores: { ...antes.valores, [talla.talla_id]: valor },
										}))
									}
									alPegar={(evento) => alPegar(evento, { renglon: medida.medida, talla: talla.talla_id })}
								/>
							),
						})),
						{
							clave: "quitar",
							encabezado: "",
							celda: (medida: MedidaCapturada) =>
								soloLeer ? null : (
									<Quitar
										nombre={medida.medida}
										alTocar={() =>
											alCambiar((antes) => ({
												...antes,
												medidas: antes.medidas.filter((una) => una.medida !== medida.medida),
											}))
										}
									/>
								),
						},
					]}
				/>
			)}
			{soloLeer ? null : (
				<div className="flex flex-wrap items-end gap-3">
					<div className="min-w-72 flex-1">
						<Campo
							etiqueta="Otra medida"
							placeholder="Otra medida, por ejemplo: Bolsa trasera"
							maxLength={60}
							value={nueva}
							error={repetida ? `${nueva.trim()} ya está en las medidas` : undefined}
							onChange={(evento) => setNueva(evento.target.value)}
						/>
					</div>
					<Boton
						icono={Plus}
						disabled={!nombreValido || repetida}
						onClick={() => {
							alCambiar((antes) => ({ ...antes, medidas: [...antes.medidas, { medida: nueva.trim(), valores: {} }] }));
							setNueva("");
						}}
					>
						Agregar medida
					</Boton>
				</div>
			)}
		</Seccion>
	);
}

/**
 * Un material nuevo como se captura: con su unidad de captura y su conversión.
 * @param material El material.
 * @param papel Su papel.
 */
function lineaNueva(material: MaterialDeLaReceta, papel: LineaCapturada["papel"]): LineaCapturada {
	return {
		papel,
		material_id: material.material_id,
		modo: papel === "avio" ? "igual" : "por_talla",
		unidad_receta: material.unidad_captura,
		receta_por_unidad_inventario: material.receta_por_unidad_inventario,
		cantidad: "",
		tallas: {},
	};
}

/**
 * «Tela»: la principal con su selector (no se quita), sus metros por talla y, abajo, «Para cortar» con el desperdicio;
 * las de combinación o forro con su botón para quitar; y «Agregar tela de combinación o forro…».
 * @param props Lo de las tablas de captura y cómo cambia un material.
 */
function Telas({
	receta,
	capturada,
	soloLeer,
	intentado,
	errores,
	alCambiar,
	alCambiarLinea,
	alLlenar,
	alPegar,
}: PropsDeCaptura & {
	alCambiarLinea: (materialId: string, cambio: (linea: LineaCapturada) => LineaCapturada) => void;
}) {
	const [agregar, setAgregar] = useState("");
	const telas = capturada.lineas.filter((linea) => linea.papel !== "avio");
	const usados = new Set(capturada.lineas.map((linea) => linea.material_id));
	const deTela = receta.materiales.filter((material) => material.tipo === "tela");
	const principal = telas.find((linea) => linea.papel === "tela_principal");
	/** Un renglón de la tabla: una tela, o «Para cortar» abajo de la principal. */
	type Renglon = { tipo: "tela"; linea: LineaCapturada } | { tipo: "para_cortar"; linea: LineaCapturada };
	const renglones: Renglon[] = telas.flatMap((linea): Renglon[] =>
		linea.papel === "tela_principal"
			? [
					{ tipo: "tela", linea },
					{ tipo: "para_cortar", linea },
				]
			: [{ tipo: "tela", linea }],
	);
	return (
		<Seccion titulo="Tela" explicacion="Metros por prenda, talla por talla">
			{principal === undefined ? <p className="m-0 font-semibold text-texto-error">Falta la tela</p> : null}
			<Tabla
				nombre="Tela"
				filas={renglones}
				claveDeFila={(renglon) => `${renglon.tipo}-${renglon.linea.material_id}`}
				columnas={[
					{
						clave: "tela",
						encabezado: "Tela",
						celda: (renglon) => {
							if (renglon.tipo === "para_cortar") {
								return <NombreDelRenglon nombre="Para cortar" abajo={receta.desperdicio.para_cortar} />;
							}
							const { linea } = renglon;
							const suyo = deTela.find((tela) => tela.material_id === linea.material_id);
							const esPrincipal = linea.papel === "tela_principal";
							return (
								<NombreDelRenglon
									nombre={
										esPrincipal && !soloLeer ? (
											<Selector
												etiqueta="Tela principal"
												value={linea.material_id}
												opciones={deTela
													.filter((tela) => tela.material_id === linea.material_id || !usados.has(tela.material_id))
													.map((tela) => ({ valor: tela.material_id, texto: tela.nombre }))}
												onChange={(evento) => {
													const otra = deTela.find((tela) => tela.material_id === evento.target.value);
													if (otra !== undefined) {
														alCambiarLinea(linea.material_id, (antes) => ({ ...antes, material_id: otra.material_id }));
													}
												}}
											/>
										) : (
											(suyo?.nombre ?? "")
										)
									}
									abajo={
										<>
											{[suyo?.detalle === "" ? null : suyo?.detalle, "m por prenda", esPrincipal ? null : "combinación"]
												.filter(Boolean)
												.join(" · ")}{" "}
											·
											<LlenarDesdeUnaTalla soloLeer={soloLeer} alTocar={() => alLlenar(linea.material_id)} />
										</>
									}
									error={errores[linea.material_id]}
								/>
							);
						},
					},
					...receta.tallas.map((talla) => ({
						clave: talla.talla_id,
						encabezado: encabezadoDeTalla(talla),
						alinear: "derecha" as const,
						celda: (renglon: Renglon) =>
							renglon.tipo === "para_cortar" ? (
								<span className="tabular-nums">
									{paraCortar(renglon.linea, talla.talla_id, receta.desperdicio.pct)}
								</span>
							) : (
								<Cajita
									etiqueta={`${material(receta, renglon.linea)} en metros, talla ${talla.nombre}`}
									valor={renglon.linea.tallas[talla.talla_id] ?? ""}
									falta={intentado && !talla.especial && (renglon.linea.tallas[talla.talla_id] ?? "") === ""}
									soloLeer={soloLeer}
									alCambiar={(valor) =>
										alCambiarLinea(renglon.linea.material_id, (antes) => ({
											...antes,
											tallas: { ...antes.tallas, [talla.talla_id]: valor },
										}))
									}
									alPegar={(evento) => alPegar(evento, { renglon: renglon.linea.material_id, talla: talla.talla_id })}
								/>
							),
					})),
					{
						clave: "quitar",
						encabezado: "",
						celda: (renglon: Renglon) =>
							soloLeer || renglon.tipo === "para_cortar" || renglon.linea.papel === "tela_principal" ? null : (
								<Quitar
									nombre={material(receta, renglon.linea)}
									alTocar={() =>
										alCambiar((antes) => ({
											...antes,
											lineas: antes.lineas.filter((una) => una.material_id !== renglon.linea.material_id),
										}))
									}
								/>
							),
					},
				]}
			/>
			{soloLeer ? null : (
				<div className="flex flex-wrap items-end gap-3">
					<div className="min-w-72 flex-1">
						<Selector
							etiqueta="Otra tela"
							vacio="Agregar tela de combinación o forro…"
							value={agregar}
							opciones={deTela
								.filter((tela) => !usados.has(tela.material_id))
								.map((tela) => ({ valor: tela.material_id, texto: tela.nombre }))}
							onChange={(evento) => setAgregar(evento.target.value)}
						/>
					</div>
					<Boton
						icono={Plus}
						disabled={agregar === ""}
						onClick={() => {
							const tela = deTela.find((una) => una.material_id === agregar);
							if (tela === undefined) return;
							// Sin tela principal, la que se agrega es la principal.
							const papel = principal === undefined ? "tela_principal" : "combinacion";
							alCambiar((antes) => ({ ...antes, lineas: [...antes.lineas, lineaNueva(tela, papel)] }));
							setAgregar("");
						}}
					>
						Agregar
					</Boton>
				</div>
			)}
		</Seccion>
	);
}

/**
 * El nombre del material de un renglón.
 * @param receta La receta, con sus materiales.
 * @param linea El renglón.
 */
function material(receta: RecetaLeida, linea: LineaCapturada): string {
	return receta.materiales.find((uno) => uno.material_id === linea.material_id)?.nombre ?? "";
}

/**
 * «Avíos»: cada uno con su unidad y «Igual en todas las tallas» / «Cambia por talla»; igual en todas, una cajita
 * «{unidad} por prenda» y su conversión; por talla, una cajita por talla. «Agregar avío…» con «{avío} · en {unidad}».
 * Sin avíos: «Sin avíos».
 * @param props Lo de las tablas de captura y cómo cambia un material.
 */
function Avios({
	receta,
	capturada,
	soloLeer,
	intentado,
	errores,
	alCambiar,
	alCambiarLinea,
	alLlenar,
	alPegar,
}: PropsDeCaptura & {
	alCambiarLinea: (materialId: string, cambio: (linea: LineaCapturada) => LineaCapturada) => void;
}) {
	const [agregar, setAgregar] = useState("");
	const avios = capturada.lineas.filter((linea) => linea.papel === "avio");
	const usados = new Set(capturada.lineas.map((linea) => linea.material_id));
	const libres = receta.materiales.filter((uno) => uno.tipo !== "tela" && !usados.has(uno.material_id));
	return (
		<Seccion titulo="Avíos" explicacion="Piezas, centímetros o metros por prenda">
			{avios.length === 0 ? (
				<p className="m-0 text-tinta3">Sin avíos</p>
			) : (
				<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
					{avios.map((linea) => {
						const suyo = receta.materiales.find((uno) => uno.material_id === linea.material_id);
						const nombre = suyo?.nombre ?? "";
						return (
							<li key={linea.material_id} className="flex flex-col gap-2 py-3">
								<div className="flex flex-wrap items-center gap-3">
									<NombreDelRenglon
										nombre={nombre}
										abajo={
											linea.modo === "por_talla" ? (
												<>
													{linea.unidad_receta} por talla ·
													<LlenarDesdeUnaTalla soloLeer={soloLeer} alTocar={() => alLlenar(linea.material_id)} />
												</>
											) : (
												unidadEnPalabras[linea.unidad_receta]
											)
										}
										error={errores[linea.material_id]}
									/>
									{soloLeer ? null : (
										<Filtros
											nombre={`${nombre}: cómo se cuenta`}
											activo={linea.modo}
											filtros={[
												{ clave: "igual", texto: "Igual en todas las tallas" },
												{ clave: "por_talla", texto: "Cambia por talla" },
											]}
											alEscoger={(modo) =>
												alCambiarLinea(linea.material_id, (antes) => ({
													...antes,
													modo: modo === "igual" ? "igual" : "por_talla",
												}))
											}
										/>
									)}
									<span className="ml-auto">
										{soloLeer ? null : (
											<Quitar
												nombre={nombre}
												alTocar={() =>
													alCambiar((antes) => ({
														...antes,
														lineas: antes.lineas.filter((una) => una.material_id !== linea.material_id),
													}))
												}
											/>
										)}
									</span>
								</div>
								{linea.modo === "igual" ? (
									<div className="flex flex-wrap items-center gap-3">
										<Cajita
											etiqueta={`${nombre}, ${unidadEnPalabras[linea.unidad_receta]} por prenda`}
											valor={linea.cantidad}
											falta={intentado && linea.cantidad === ""}
											soloLeer={soloLeer}
											ancha
											alCambiar={(valor) =>
												alCambiarLinea(linea.material_id, (antes) => ({ ...antes, cantidad: valor }))
											}
										/>
										<span className="text-tinta2">{linea.unidad_receta} por prenda</span>
										<span className="text-etiqueta text-tinta3">{conversionDelAvio(linea, suyo)}</span>
									</div>
								) : (
									<div className="flex flex-wrap gap-2">
										{receta.tallas.map((talla) => (
											<span key={talla.talla_id} className="flex flex-col items-center gap-1 text-etiqueta text-tinta3">
												{encabezadoDeTalla(talla)}
												<Cajita
													etiqueta={`${nombre} en ${unidadEnPalabras[linea.unidad_receta]}, talla ${talla.nombre}`}
													valor={linea.tallas[talla.talla_id] ?? ""}
													falta={intentado && !talla.especial && (linea.tallas[talla.talla_id] ?? "") === ""}
													soloLeer={soloLeer}
													alCambiar={(valor) =>
														alCambiarLinea(linea.material_id, (antes) => ({
															...antes,
															tallas: { ...antes.tallas, [talla.talla_id]: valor },
														}))
													}
													alPegar={(evento) => alPegar(evento, { renglon: linea.material_id, talla: talla.talla_id })}
												/>
											</span>
										))}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{soloLeer ? null : (
				<div className="flex flex-wrap items-end gap-3">
					<div className="min-w-72 flex-1">
						<Selector
							etiqueta="Otro avío"
							vacio="Agregar avío…"
							value={agregar}
							opciones={libres.map((uno) => ({
								valor: uno.material_id,
								texto: `${uno.nombre} · en ${unidadEnPalabras[uno.unidad_captura]}`,
							}))}
							onChange={(evento) => setAgregar(evento.target.value)}
						/>
					</div>
					<Boton
						icono={Plus}
						disabled={agregar === ""}
						onClick={() => {
							const avio = libres.find((uno) => uno.material_id === agregar);
							if (avio === undefined) return;
							alCambiar((antes) => ({ ...antes, lineas: [...antes.lineas, lineaNueva(avio, "avio")] }));
							setAgregar("");
						}}
					>
						Agregar
					</Boton>
				</div>
			)}
		</Seccion>
	);
}

/**
 * «Versiones»: de la más nueva a la más vieja, con «Vigente», su fecha y quién, su motivo y los lotes cortados con
 * ella. Tocar una vieja la abre (`&version={n}`).
 * @param props La receta.
 */
function Versiones({ receta }: { receta: RecetaLeida }) {
	const { ir } = useDireccion();
	const cuantas = receta.versiones.length;
	return (
		<Seccion
			titulo="Versiones"
			explicacion={cuantas === 0 ? "" : `${cuantas} ${cuantas === 1 ? "versión" : "versiones"}`}
		>
			{cuantas === 0 ? (
				<p className="m-0 text-tinta3">Todavía no hay versiones</p>
			) : (
				<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
					{receta.versiones.map((version) => (
						<li key={version.numero} className="flex flex-col gap-1 py-3">
							<span className="flex flex-wrap items-center gap-3">
								{version.vigente ? (
									<b>Versión {version.numero}</b>
								) : (
									<button
										type="button"
										className="font-bold text-marca hover:underline"
										onClick={() => ir({ version: String(version.numero) })}
									>
										Versión {version.numero}
									</button>
								)}
								{version.vigente ? <Estado texto="Vigente" color="verde" /> : null}
								<span className="text-etiqueta text-tinta2">
									{version.fecha} · {version.persona}
								</span>
							</span>
							<span>{version.motivo}</span>
							<span className="text-etiqueta text-tinta2">
								{version.lotes.length === 0
									? "Ningún lote cortado con esta versión"
									: `Cortados con esta versión: ${version.lotes.join(", ")}`}
							</span>
						</li>
					))}
				</ul>
			)}
		</Seccion>
	);
}

/**
 * La barra de guardar, fija abajo: en una receta nueva, «Receta nueva» y «Guardar receta»; con versión, en cuanto hay
 * un cambio, «Motivo del cambio», «Descartar cambios» y «Guardar como versión {v+1}». Dice el primer error y «y {n}
 * más».
 * @param props La receta, lo capturado, si hay cambios, los errores, si está ocupada o chocó, y qué hacer con cada botón.
 */
function BarraDeGuardar({
	receta,
	capturada,
	conCambios,
	errores,
	ocupado,
	choque,
	alEscribirMotivo,
	alDescartar,
	alGuardar,
}: {
	receta: RecetaLeida;
	capturada: RecetaCapturada;
	conCambios: boolean;
	errores: readonly string[];
	ocupado: boolean;
	choque: boolean;
	alEscribirMotivo: (motivo: string) => void;
	alDescartar: () => void;
	alGuardar: () => void;
}) {
	const nueva = receta.vigente === null;
	if (!nueva && !conCambios) return null;
	const [primero] = errores;
	return (
		<section
			aria-label="Guardar la receta"
			className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-grande bg-panel p-4 shadow-flotante"
		>
			{nueva ? (
				<b>Receta nueva</b>
			) : (
				<div className="min-w-72 flex-1">
					<Campo
						etiqueta="Motivo del cambio"
						maxLength={120}
						value={capturada.motivo}
						onChange={(evento) => alEscribirMotivo(evento.target.value)}
					/>
				</div>
			)}
			{choque ? (
				<span className="font-semibold text-texto-advertencia">
					{`Receta de ${receta.prenda} cambió mientras la veías. Revisa los cambios y vuelve a guardar`}
				</span>
			) : primero === undefined ? null : (
				<span role="alert" className="font-semibold text-texto-error">
					{primero}
					{errores.length > 1 ? ` y ${errores.length - 1} más` : ""}
				</span>
			)}
			<span className="ml-auto flex gap-2">
				{nueva ? null : (
					<Boton variante="fantasma" onClick={alDescartar}>
						Descartar cambios
					</Boton>
				)}
				<Boton variante="principal" disabled={ocupado} onClick={alGuardar}>
					{nueva ? "Guardar receta" : `Guardar como versión ${(receta.vigente ?? 0) + 1}`}
				</Boton>
			</span>
		</section>
	);
}
