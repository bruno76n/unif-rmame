/**
 * El Andén de Aduana, su primera pestaña: la barra de cuatro cifras (Por recibir, Salidas hoy o mañana, Más de {d}
 * días en aduana y En tránsito sin confirmar; cada una lleva a su pestaña) y los carriles: «Entra» con lo que espera
 * entrar y uno por destino con lo que está en aduana. Cada tarjeta abre su cajón, o Empaque en línea.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Andén»)
 *
 * Lo que dice cada tarjeta, su orden y sus colores llegan de `inventario.anden`: la pantalla solo los pinta.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import type { andenDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import {
	ArrowRight,
	ArrowRightLeft,
	Box,
	Clock,
	Globe,
	type LucideIcon,
	Send,
	ShieldCheck,
	Store,
	Truck,
	Users,
} from "lucide-react";
import type { z } from "zod";
import { orillaDelCarril, useAbrir } from "../comun.tsx";
import { useDireccionDeAduana } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Anden = z.infer<typeof andenDeAduana.resultado>;

/** Un carril. */
type Carril = Anden["carriles"][number];

/** Una tarjeta. */
type Tarjeta = Carril["tarjetas"][number];

/** El ícono de cada carril. */
const iconos: Readonly<Record<Carril["tipo"], LucideIcon>> = {
	entra: ArrowRight,
	tienda: Store,
	linea: Globe,
	externos: Users,
	bodega: Box,
	calidad: ShieldCheck,
};

/**
 * El tono del texto de un color de estado: rojo o ámbar; lo demás, normal.
 * @param color El color.
 */
function tonoDe(color: string | null): "rojo" | "ambar" | "normal" {
	return color === "rojo" ? "rojo" : color === "ambar" ? "ambar" : "normal";
}

/**
 * El tono del número de una cifra, si tiene algo: así lo que urge se ve en rojo o en ámbar.
 * @param numero La cifra.
 * @param tono Su tono cuando no es cero.
 */
function tonoSiHay(numero: number, tono: "rojo" | "ambar"): { tono?: "rojo" | "ambar" } {
	return numero > 0 ? { tono } : {};
}

/**
 * Una tarjeta de un carril: el título, abajo «Sale hoy», «Sale mañana» o «Atrasada {n} días» en su cuadro de estado,
 * el detalle, la cantidad y su marca.
 * @param props La tarjeta.
 */
function TarjetaDelCarril({ tarjeta }: { tarjeta: Tarjeta }) {
	const abrir = useAbrir();
	return (
		<button
			type="button"
			onClick={() => abrir(tarjeta.abre)}
			className="flex w-full cursor-pointer flex-col gap-1 rounded-mediano border border-linea bg-panel px-3 py-2.5 text-left shadow-panel hover:border-linea2 focus-visible:outline-2 focus-visible:outline-marca"
		>
			<b className="text-tinta">{tarjeta.titulo}</b>
			{tarjeta.etiqueta === null ? null : (
				<span className="flex">
					<Estado texto={tarjeta.etiqueta.texto} color={tarjeta.etiqueta.color} />
				</span>
			)}
			<span className="text-etiqueta text-tinta3">{tarjeta.detalle}</span>
			<span className="flex flex-wrap items-baseline justify-between gap-x-2">
				<b className="text-tinta tabular-nums">{tarjeta.cantidad}</b>
				<span className="text-etiqueta">
					<TextoConTono tono={tonoDe(tarjeta.marca.color)}>{tarjeta.marca.texto}</TextoConTono>
				</span>
			</span>
		</button>
	);
}

/**
 * Un carril del andén: su orilla de color, su ícono, su nombre y su conteo, y sus tarjetas; vacío, «Nada por ahora».
 * Van seis por renglón, como en la muestra; el séptimo baja.
 * @param props El carril.
 */
function CarrilDelAnden({ carril }: { carril: Carril }) {
	const Icono = iconos[carril.tipo];
	return (
		<section
			aria-label={carril.nombre}
			className={`flex min-w-0 flex-col gap-2 rounded-grande border-t-4 bg-suave p-2.5 max-telefono:min-w-[82%] ${orillaDelCarril(carril.clave)}`}
		>
			<header className="flex items-center gap-2 px-1 text-tinta">
				<Icono size={17} strokeWidth={1.9} aria-hidden />
				<b>{carril.nombre}</b>
				<span className="ml-auto text-tinta3 tabular-nums">{carril.tarjetas.length}</span>
			</header>
			{carril.tarjetas.length === 0 ? (
				<p className="m-0 px-1 py-3 text-etiqueta text-tinta3">Nada por ahora</p>
			) : (
				carril.tarjetas.map((tarjeta) => <TarjetaDelCarril key={tarjeta.clave} tarjeta={tarjeta} />)
			)}
		</section>
	);
}

/**
 * El Andén.
 * @param props Lo que regresa `inventario.anden`.
 */
export function AndenDeAduana({ datos }: { datos: Anden }) {
	const { navegar } = useDireccionDeAduana();
	const { cifras } = datos;
	return (
		<div className="flex flex-col gap-5">
			<BarraIndicadores
				cifras={[
					{
						clave: "por_recibir",
						nombre: "Por recibir",
						icono: Truck,
						color: "azul",
						numero: cifras.por_recibir,
						contexto:
							cifras.atrasadas === 0
								? []
								: [{ texto: plural(cifras.atrasadas, "atrasada", "atrasadas"), tono: "rojo" }],
						alTocar: () => navegar({}, "recepcion"),
					},
					{
						clave: "salidas",
						nombre: "Salidas hoy o mañana",
						icono: Send,
						color: "ambar",
						numero: cifras.salidas,
						...tonoSiHay(cifras.salidas, "ambar"),
						contexto: [{ texto: "Despachos programados" }],
						alTocar: () => navegar({}, "despacho"),
					},
					{
						clave: "parados",
						nombre: `Más de ${plural(cifras.dias_parado, "día", "días")} en aduana`,
						icono: Clock,
						color: "rojo",
						numero: cifras.parados,
						...tonoSiHay(cifras.parados, "rojo"),
						contexto: [{ texto: "Inventario detenido" }],
						alTocar: () => navegar({}, "inventario"),
					},
					{
						clave: "sin_confirmar",
						nombre: "En tránsito sin confirmar",
						icono: ArrowRightLeft,
						color: "verde-azulado",
						numero: cifras.sin_confirmar,
						...tonoSiHay(cifras.sin_confirmar, "ambar"),
						contexto: [{ texto: "Por confirmar en destino" }],
						alTocar: () => navegar({}, "transito"),
					},
				]}
			/>
			<div className="grid grid-cols-6 items-start gap-2.5 pb-2 max-menu:grid-cols-3 max-telefono:flex max-telefono:overflow-x-auto">
				{datos.carriles.map((carril) => (
					<CarrilDelAnden key={carril.clave} carril={carril} />
				))}
			</div>
		</div>
	);
}
