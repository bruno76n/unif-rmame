/**
 * Las casillas de Configuración: la de un parámetro (número, pesos, opción, sí o no, texto u hora), la de un mínimo de
 * existencia y la de un permiso fino. Cada una se guarda al salir de la casilla o al escoger la opción, con la versión
 * que se leyó; si la acción no la acepta, avisa con su mensaje y regresa al valor anterior.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración») y docs/modulos/admin/configuracion.md
 * («`admin.cambiar_parametro`», «`admin.cambiar_minimo`») y docs/modulos/admin/permisos.md
 *
 * Ninguna revisa el valor: lo revisa la acción (vacío o en cero, «Escribe un número mayor que cero»).
 */

import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { cambiarMinimo, cambiarParametro } from "@uniformame/compartido/contratos/admin/configuracion";
import type { parametroParaVer } from "@uniformame/compartido/contratos/admin/consultas-configuracion";
import { cambiarPermisoFino } from "@uniformame/compartido/contratos/admin/cuentas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { History } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import type { FallaDeRegla } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** Un parámetro como lo pinta su casilla. */
export type ParametroParaVer = z.infer<typeof parametroParaVer>;

/** Los valores de sí o no de un parámetro booleano. */
const siNo = [
	{ valor: "true", texto: "Sí" },
	{ valor: "false", texto: "No" },
];

/**
 * El valor de un parámetro como se escribe en su casilla.
 * @param parametro El parámetro.
 */
function valorEnLaCasilla(parametro: ParametroParaVer): string {
	if (parametro.tipo === "centavos") return centavosACampo(parametro.valor_centavos);
	return parametro.valor === null ? "" : String(parametro.valor);
}

/**
 * Lo escrito en la casilla como lo recibe la acción, según su tipo.
 * @param parametro El parámetro.
 * @param texto Lo escrito.
 */
function valorParaLaAccion(parametro: ParametroParaVer, texto: string): number | string | boolean | null {
	if (texto === "") return null;
	if (parametro.tipo === "centavos") return pesosACentavos(texto);
	if (parametro.tipo === "entero" || parametro.tipo === "porcentaje") return Number(texto);
	if (parametro.tipo === "booleano") return texto === "true";
	return texto;
}

/**
 * Lo que se deja escribir en una casilla: un entero solo toma dígitos; un porcentaje o pesos, también el punto.
 * @param parametro El parámetro.
 * @param texto Lo que se tecleó.
 */
function soloLoQueToma(parametro: ParametroParaVer, texto: string): string {
	if (parametro.tipo === "entero") return texto.replace(/\D/g, "");
	if (parametro.tipo === "porcentaje" || parametro.tipo === "centavos") return texto.replace(/[^\d.]/g, "");
	return texto;
}

/**
 * Avisa por qué no se guardó una casilla: el error de su campo, si la acción lo dio en uno (el aviso de abajo ya dice
 * el que no va en un campo).
 * @param campo El campo de la acción que lleva el valor (`valor`, `piezas`).
 * @returns Lo que se le pasa a `enviar` como `alFallar`.
 */
function useAvisarFallaDeCampo(campo: string) {
	const avisar = useAvisar();
	return (falla: FallaDeRegla) => {
		const mensaje = falla.campos[campo];
		if (mensaje !== undefined) avisar(mensaje, "no_se_pudo");
	};
}

/**
 * La casilla de un parámetro, con su explicación, «Por decidir» y «Historial».
 * @param props El parámetro, si la cuenta lo puede cambiar y qué hacer al pedir su historial.
 */
export function CasillaDeParametro({
	parametro,
	puedeCambiar,
	alVerHistorial,
}: {
	parametro: ParametroParaVer;
	puedeCambiar: boolean;
	alVerHistorial: () => void;
}) {
	const envio = useEnvio(cambiarParametro);
	const conConexion = useConConexion();
	const alFallar = useAvisarFallaDeCampo("valor");
	const guardado = valorEnLaCasilla(parametro);
	const [texto, setTexto] = useState(guardado);
	const apagada = !puedeCambiar || !conConexion || envio.enviando;
	/** Guarda lo escrito si cambió; si no se pudo, regresa al valor anterior. */
	const guardar = async (nuevo: string) => {
		if (nuevo === guardado) return;
		const salio = await envio.enviar(
			{
				datos: {
					clave: parametro.clave,
					...(parametro.ubicacion_id === null ? {} : { ubicacion_id: parametro.ubicacion_id }),
					valor: valorParaLaAccion(parametro, nuevo),
				},
				version: parametro.version,
			},
			undefined,
			alFallar,
		);
		if (salio === undefined) setTexto(guardado);
	};
	const etiqueta = parametro.unidad === null ? parametro.nombre : `${parametro.nombre} (${parametro.unidad})`;
	const opciones =
		parametro.tipo === "booleano"
			? siNo
			: parametro.opciones.map((opcion) => ({ valor: opcion.valor, texto: opcion.texto }));
	return (
		<div className="flex flex-col gap-1.5">
			{parametro.tipo === "opcion" || parametro.tipo === "booleano" ? (
				<Selector
					etiqueta={etiqueta}
					opciones={opciones}
					value={texto}
					disabled={apagada}
					onChange={(evento) => {
						setTexto(evento.target.value);
						void guardar(evento.target.value);
					}}
				/>
			) : (
				<Campo
					etiqueta={etiqueta}
					inputMode={parametro.tipo === "texto" || parametro.tipo === "hora" ? "text" : "decimal"}
					value={texto}
					disabled={apagada}
					onChange={(evento) => setTexto(soloLoQueToma(parametro, evento.target.value))}
					onBlur={() => void guardar(texto)}
				/>
			)}
			<span className="flex flex-wrap items-center gap-2 text-etiqueta text-tinta3">
				{parametro.por_decidir ? <Estado texto="Por decidir" /> : null}
				{parametro.explicacion === null ? null : <span className="min-w-0 flex-1">{parametro.explicacion}</span>}
				<Boton chico variante="fantasma" icono={History} onClick={alVerHistorial}>
					Historial
				</Boton>
			</span>
		</div>
	);
}

/** Un mínimo vigente, como lo da `inventario.minimos_vigentes`. */
interface MinimoVigente {
	piezas: number;
	version: number;
}

/** Cómo se nombra cada nivel en su casilla. */
const nombreDelNivel = { mayor_venta: "Tallas de mayor venta", demas: "Demás tallas" } as const;

/**
 * La casilla de un mínimo de existencia: se guarda al salir con `admin.cambiar_minimo`.
 * @param props La ubicación, el nivel, el vigente y si la cuenta lo puede cambiar.
 */
export function CasillaDeMinimo({
	ubicacionId,
	nivel,
	vigente,
	puedeCambiar,
}: {
	ubicacionId: string;
	nivel: keyof typeof nombreDelNivel;
	vigente: MinimoVigente | null;
	puedeCambiar: boolean;
}) {
	const envio = useEnvio(cambiarMinimo);
	const conConexion = useConConexion();
	const alFallar = useAvisarFallaDeCampo("piezas");
	const guardado = vigente === null ? "" : String(vigente.piezas);
	const [texto, setTexto] = useState(guardado);
	/** Guarda lo escrito si cambió; si no se pudo, regresa al valor anterior. */
	const guardar = async () => {
		if (texto === guardado) return;
		const salio = await envio.enviar(
			{
				datos: { ubicacion_id: ubicacionId, nivel, piezas: texto === "" ? 0 : Number(texto) },
				...(vigente === null ? {} : { version: vigente.version }),
			},
			undefined,
			alFallar,
		);
		if (salio === undefined) setTexto(guardado);
	};
	return (
		<Campo
			etiqueta={nombreDelNivel[nivel]}
			inputMode="numeric"
			value={texto}
			disabled={!puedeCambiar || !conConexion || envio.enviando}
			onChange={(evento) => setTexto(evento.target.value.replace(/\D/g, ""))}
			onBlur={() => void guardar()}
		/>
	);
}

/**
 * La casilla de un permiso fino de una cuenta: la de la dueña va marcada y fija.
 * @param props La cuenta, el permiso, si lo tiene y si quien ve lo puede cambiar.
 */
export function CasillaDePermisoFino({
	cuenta,
	permiso,
	tiene,
	puedeCambiar,
}: {
	cuenta: { usuario_id: string; version: number; nombre: string; es_duena: boolean };
	permiso: "ven_sueldos_y_tarifas" | "imprime_guias";
	tiene: boolean;
	puedeCambiar: boolean;
}) {
	const envio = useEnvio(cambiarPermisoFino);
	const conConexion = useConConexion();
	return (
		<Casilla
			etiqueta={cuenta.nombre}
			marcada={tiene}
			deshabilitada={cuenta.es_duena || !puedeCambiar || !conConexion || envio.enviando}
			alCambiar={(marcada) =>
				void envio.enviar({
					datos: { usuario_id: cuenta.usuario_id, permiso, tiene: marcada },
					version: cuenta.version,
				})
			}
		/>
	);
}
