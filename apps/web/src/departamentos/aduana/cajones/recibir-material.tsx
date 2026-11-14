/**
 * El cajón Recibir material: «{OC} · {proveedor}» y «Recibir material»; un bloque por material de la orden al que le
 * falta algo. La tela, rollo por rollo: «Faltaban {n} m · llegan {suma} m en {n} rollos», con Rollo · Metros marcados
 * (un decimal; acepta coma) · Partida (de 1 a 20 letras) · «Quitar rollo» (no quita el último), «Otro rollo» con la
 * misma partida y «Llegan {n} partidas distintas» (no detiene). Lo demás, «Faltaban {n} {unidad}» y una casilla con lo
 * que faltaba. «Recibir en aduana» llama `inventario.recibir_de_proveedor`; cada error va en su campo y el primero en
 * el aviso ámbar. Sin precios ni costos.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Recibir material)
 */

import { cantidadEnTexto, sumaDeLoEscrito } from "@uniformame/compartido/calculos/cuenta-material";
import { detalleRecibirMaterial } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { recibirDeProveedor } from "@uniformame/compartido/contratos/inventario/recepciones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { type ColumnaDeTabla, Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleRecibirMaterial.resultado>;

/** Un material de la orden. */
type Material = Detalle["materiales"][number];

/** Un rollo capturado. */
interface Rollo {
	clave: number;
	metros: string;
	partida: string;
}

/** Lo capturado de cada material: sus rollos, si es tela, o su cantidad. */
type Captura = Readonly<Record<string, { rollos: readonly Rollo[]; cantidad: string }>>;

/**
 * Un rollo vacío después de los que ya hay, con la partida del último.
 * @param rollos Los que ya hay.
 */
function rolloNuevo(rollos: readonly Rollo[]): Rollo {
	const ultimo = rollos.at(-1);
	return { clave: (ultimo?.clave ?? 0) + 1, metros: "", partida: ultimo?.partida ?? "" };
}

/**
 * Lo que se manda de un material: la tela con sus rollos (los metros con punto) o la cantidad.
 * @param material El material.
 * @param suya Lo capturado.
 */
function loQueLlega(material: Material, suya: { rollos: readonly Rollo[]; cantidad: string }) {
	return material.es_tela
		? {
				orden_compra_linea_id: material.orden_compra_linea_id,
				rollos: suya.rollos.map((rollo) => ({ metros: rollo.metros.replace(",", "."), partida: rollo.partida })),
			}
		: { orden_compra_linea_id: material.orden_compra_linea_id, cantidad: suya.cantidad.replace(",", ".") };
}

/**
 * El cajón Recibir material.
 * @param props La orden y cómo cerrar el cajón.
 */
export function CajonRecibirMaterial({ ordenId, alCerrar }: { ordenId: string; alCerrar: () => void }) {
	const consulta = useConsulta(detalleRecibirMaterial, { orden_compra_id: ordenId });
	const conConexion = useConConexion();
	const avisar = useAvisar();
	const { enviar, enviando } = useEnvio(recibirDeProveedor);
	const [captura, setCaptura] = useState<Captura>({});
	const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
	const detalle = consulta.data;
	const conCambios = Object.keys(captura).length > 0;
	const cierre = useCierreDelCajon(conCambios, alCerrar);
	/** Lo capturado de un material, o lo que trae al abrir: un rollo vacío, o lo que faltaba. */
	const deMaterial = (material: Material) =>
		captura[material.orden_compra_linea_id] ?? { rollos: [rolloNuevo([])], cantidad: material.faltaban };
	/** Cambia lo capturado de un material. */
	const cambiar = (material: Material, cambio: Partial<{ rollos: readonly Rollo[]; cantidad: string }>) =>
		setCaptura((antes) => ({
			...antes,
			[material.orden_compra_linea_id]: { ...deMaterial(material), ...cambio },
		}));
	/** Pone los errores en sus campos y el primero en el aviso ámbar. */
	const marcar = (campos: Record<string, string>) => {
		setErrores(campos);
		const [primero] = Object.values(campos);
		if (primero !== undefined) avisar(primero, "no_se_pudo");
	};
	/** Recibe lo capturado; revisa antes con el mismo esquema del contrato. */
	const recibir = async () => {
		if (detalle === undefined) return;
		const datos = {
			orden_compra_id: detalle.orden_compra_id,
			materiales: detalle.materiales.map((material) => loQueLlega(material, deMaterial(material))),
		};
		const revisado = recibirDeProveedor.entrada.safeParse(datos);
		if (!revisado.success) {
			const campos: Record<string, string> = {};
			for (const problema of revisado.error.issues) campos[problema.path.join(".")] ??= problema.message;
			marcar(campos);
			return;
		}
		setErrores({});
		const salio = await enviar({ datos }, (falla) => marcar(falla.campos));
		if (salio !== undefined) cierre.alCerrar();
	};
	return (
		<Cajon
			abierto
			ancho
			conCambios={conCambios}
			alCerrar={cierre.alCerrar}
			{...(detalle === undefined ? {} : { contexto: `${detalle.folio} · ${detalle.proveedor}` })}
			titulo="Recibir material"
			accion={
				detalle === undefined || !detalle.se_puede_recibir || detalle.materiales.length === 0 ? undefined : (
					<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void recibir()}>
						Recibir en aduana
					</Boton>
				)
			}
		>
			<SegunConsulta consulta={consulta}>
				{(datos) =>
					datos.materiales.length === 0 || !datos.se_puede_recibir ? (
						<EstadoDePantalla tipo="vacio" texto={`${datos.folio} ya no tiene nada por recibir.`} />
					) : (
						<div className="flex flex-col gap-6">
							{datos.materiales.map((material, i) => (
								<BloqueDeMaterial
									key={material.orden_compra_linea_id}
									material={material}
									suya={deMaterial(material)}
									errores={errores}
									prefijo={`materiales.${i}`}
									alCambiar={(cambio) => cambiar(material, cambio)}
								/>
							))}
						</div>
					)
				}
			</SegunConsulta>
			{cierre.pregunta}
		</Cajon>
	);
}

/**
 * El bloque de un material: la tabla de rollos de una tela, o la casilla de lo demás.
 * @param props El material, lo capturado, los errores, el prefijo de sus campos y cómo cambiarlo.
 */
function BloqueDeMaterial({
	material,
	suya,
	errores,
	prefijo,
	alCambiar,
}: {
	material: Material;
	suya: { rollos: readonly Rollo[]; cantidad: string };
	errores: Readonly<Record<string, string>>;
	prefijo: string;
	alCambiar: (cambio: Partial<{ rollos: readonly Rollo[]; cantidad: string }>) => void;
}) {
	if (!material.es_tela) {
		return (
			<div className="flex max-w-60 flex-col gap-3">
				<TituloDeBloque titulo={material.material} detalle={`Faltaban ${material.faltaban} ${material.unidad}`} />
				<Campo
					etiqueta={`Cantidad de ${material.material}, en ${material.unidad}`}
					inputMode="decimal"
					value={suya.cantidad}
					error={errores[`${prefijo}.cantidad`]}
					onChange={(evento) => alCambiar({ cantidad: evento.target.value })}
				/>
			</div>
		);
	}
	const { rollos } = suya;
	// Lo que llevan escrito los rollos, en milésimos: nunca pasa por un número con decimales.
	const suma = cantidadEnTexto(sumaDeLoEscrito(rollos.map((rollo) => rollo.metros)));
	const partidas = new Set(
		rollos.map((rollo) => rollo.partida.trim().toUpperCase()).filter((partida) => partida !== ""),
	);
	/** Cambia un rollo. */
	const cambiarRollo = (clave: number, cambio: Partial<Rollo>) =>
		alCambiar({ rollos: rollos.map((rollo) => (rollo.clave === clave ? { ...rollo, ...cambio } : rollo)) });
	const columnas: ColumnaDeTabla<Rollo>[] = [
		{ clave: "rollo", encabezado: "Rollo", celda: (rollo) => String(rollos.indexOf(rollo) + 1) },
		{
			clave: "metros",
			encabezado: "Metros marcados",
			celda: (rollo) => (
				<Campo
					etiqueta={`Metros del rollo ${rollos.indexOf(rollo) + 1}`}
					inputMode="decimal"
					maxLength={8}
					value={rollo.metros}
					error={errores[`${prefijo}.rollos.${rollos.indexOf(rollo)}.metros`]}
					onChange={(evento) => cambiarRollo(rollo.clave, { metros: evento.target.value })}
				/>
			),
		},
		{
			clave: "partida",
			encabezado: "Partida",
			celda: (rollo) => (
				<Campo
					etiqueta={`Partida del rollo ${rollos.indexOf(rollo) + 1}`}
					maxLength={20}
					value={rollo.partida}
					error={errores[`${prefijo}.rollos.${rollos.indexOf(rollo)}.partida`]}
					onChange={(evento) => cambiarRollo(rollo.clave, { partida: evento.target.value })}
				/>
			),
		},
		{
			clave: "quitar",
			encabezado: "",
			alinear: "derecha",
			celda: (rollo) => (
				<Boton
					chico
					variante="fantasma"
					icono={X}
					aria-label="Quitar rollo"
					disabled={rollos.length === 1}
					onClick={() => alCambiar({ rollos: rollos.filter((suyo) => suyo.clave !== rollo.clave) })}
				/>
			),
		},
	];
	return (
		<div className="flex flex-col gap-3">
			<TituloDeBloque
				titulo={material.material}
				detalle={`Faltaban ${material.faltaban} m · llegan ${suma} m en ${rollos.length} ${
					rollos.length === 1 ? "rollo" : "rollos"
				}`}
			/>
			<Tabla
				nombre={`Rollos de ${material.material}`}
				filas={rollos}
				claveDeFila={(rollo) => String(rollo.clave)}
				columnas={columnas}
			/>
			<span>
				<Boton chico icono={Plus} onClick={() => alCambiar({ rollos: [...rollos, rolloNuevo(rollos)] })}>
					Otro rollo
				</Boton>
			</span>
			{partidas.size > 1 ? (
				<LineaDeAviso tono="advertencia">{`Llegan ${partidas.size} partidas distintas`}</LineaDeAviso>
			) : null}
		</div>
	);
}
