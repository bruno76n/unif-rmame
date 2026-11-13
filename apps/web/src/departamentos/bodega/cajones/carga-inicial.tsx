/**
 * El cajón Carga inicial (ancho): la existencia de arranque de las prendas, solo donde una variante no tiene
 * movimientos, sin lo que tiene el sistema. Ubicación (Bodega o Aduana), «Qué cargas» («Una prenda», «Una sección» o
 * «Todo») con la prenda o la sección, «Hora del conteo» y la tabla con «Piezas» (una variante que ya tiene movimientos
 * ahí sale apagada). «Registrar carga inicial» llama `inventario.registrar_carga_inicial`.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Carga inicial) y docs/modulos/inventario/conteos.md
 */

import { detalleDeConteo } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { registrarCargaInicial } from "@uniformame/compartido/contratos/inventario/diferencias";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { useState } from "react";
import { useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../comun.tsx";
import { paraElCampo, TablaDeConteo } from "./conteo.tsx";

/** Qué se carga. */
type Alcance = "prenda" | "seccion" | "toda";

/** Las opciones de «Qué cargas». */
const alcances: readonly { valor: Alcance; texto: string }[] = [
	{ valor: "prenda", texto: "Una prenda" },
	{ valor: "seccion", texto: "Una sección" },
	{ valor: "toda", texto: "Todo" },
];

/**
 * El cajón Carga inicial.
 * @param props Cómo cerrar el cajón.
 */
export function CajonCargaInicial({ alCerrar }: { alCerrar: () => void }) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(registrarCargaInicial);
	const [ubicacionId, setUbicacionId] = useState("");
	const [alcance, setAlcance] = useState<Alcance>("prenda");
	const [cual, setCual] = useState("");
	const [hora, setHora] = useState(() => paraElCampo(new Date()));
	const [piezas, setPiezas] = useState<Readonly<Record<string, string>>>({});
	const opciones = useConsulta(detalleDeConteo, { carga_inicial: true }).data;
	const ubicacion = ubicacionId || opciones?.ubicaciones.find((suya) => suya.nombre === "Bodega")?.id || "";
	const listo = alcance === "toda" || cual !== "";
	const consulta = useConsulta(
		detalleDeConteo,
		{
			carga_inicial: true,
			...(ubicacion === "" ? {} : { ubicacion_id: ubicacion }),
			...(alcance === "prenda" && cual !== "" ? { producto_id: cual } : {}),
			...(alcance === "seccion" && cual !== "" ? { seccion_id: cual } : {}),
		},
		listo && ubicacion !== "",
		true,
	);
	const cuantas = Object.values(piezas).filter((texto) => texto !== "").length;
	const cierre = useCierreDelCajon(cuantas > 0, alCerrar);
	/** Cambia lo que se carga: lo capturado ya no es de ahí. */
	const cambiar = (cambios: () => void) => {
		cambios();
		setPiezas({});
	};
	const registrar = async () => {
		const salio = await enviar({
			datos: {
				ubicacion_id: ubicacion,
				alcance,
				...(alcance === "prenda" ? { producto_id: cual } : {}),
				...(alcance === "seccion" ? { seccion_id: cual } : {}),
				contado_en: new Date(hora).toISOString(),
				renglones: Object.entries(piezas)
					.filter(([, texto]) => texto !== "")
					.map(([variante_id, texto]) => ({ variante_id, piezas: Number(texto) })),
			},
		});
		if (salio !== undefined) cierre.alCerrar();
	};
	const lista = alcance === "prenda" ? opciones?.productos : alcance === "seccion" ? opciones?.secciones : [];
	return (
		<Cajon
			abierto
			ancho
			conCambios={cuantas > 0}
			alCerrar={cierre.alCerrar}
			contexto="Existencia de arranque"
			titulo="Carga inicial"
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || cuantas === 0 || !listo}
					onClick={() => void registrar()}
				>
					Registrar carga inicial
				</Boton>
			}
		>
			<div className="flex flex-col gap-5">
				<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
					<Selector
						etiqueta="Ubicación"
						opciones={(opciones?.ubicaciones ?? []).map((suya) => ({ valor: suya.id, texto: suya.nombre }))}
						value={ubicacion}
						onChange={(evento) => cambiar(() => setUbicacionId(evento.target.value))}
					/>
					<Campo
						etiqueta="Hora del conteo"
						type="datetime-local"
						max={paraElCampo(new Date())}
						value={hora}
						onChange={(evento) => setHora(evento.target.value)}
					/>
					<Selector
						etiqueta="Qué cargas"
						opciones={alcances}
						value={alcance}
						onChange={(evento) =>
							cambiar(() => {
								setAlcance(alcances.find((suyo) => suyo.valor === evento.target.value)?.valor ?? "prenda");
								setCual("");
							})
						}
					/>
					{alcance === "toda" ? null : (
						<Selector
							etiqueta={alcance === "prenda" ? "Prenda" : "Sección"}
							vacio={alcance === "prenda" ? "Escoge la prenda" : "Escoge la sección"}
							opciones={(lista ?? []).map((suya) => ({ valor: suya.id, texto: suya.nombre }))}
							value={cual}
							onChange={(evento) => cambiar(() => setCual(evento.target.value))}
						/>
					)}
				</div>
				{listo ? (
					<SegunConsulta consulta={consulta}>
						{(datos) => (
							<TablaDeConteo
								variantes={datos.variantes}
								contados={piezas}
								encabezado="Piezas"
								alContar={(varianteId, texto) => setPiezas((antes) => ({ ...antes, [varianteId]: texto }))}
							/>
						)}
					</SegunConsulta>
				) : null}
			</div>
			{cierre.pregunta}
		</Cajon>
	);
}
