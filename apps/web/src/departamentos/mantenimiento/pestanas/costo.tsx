/**
 * Costo por máquina de Mantenimiento: arriba «Reparaciones en el año», «Horas de paro · {n} h» con «≈ {pesos}» en rojo y
 * la casilla «Una hora de máquina parada cuesta»; la leyenda «Reparación» · «Paro»; y la tabla de las máquinas con gasto
 * o paro, de la que más cuesta a la que menos, con la barra de lo gastado contra lo parado a escala de la que más
 * cuesta. Cada renglón abre el cajón Máquina.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Costo por máquina»)
 *
 * La casilla solo acepta números y va en la dirección (`hora`, en pesos): con uno mayor que 0 la consulta vuelve a
 * calcular los pesos del paro de esta pestaña; vacía o en 0, regresa al de Configuración. No se guarda.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import type { costoPorMaquina } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { type ReactNode, useState } from "react";
import type { z } from "zod";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { useDireccionDeMantenimiento } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Costo = z.infer<typeof costoPorMaquina.resultado>;

/** Una máquina de la tabla. */
type MaquinaConCosto = Costo["maquinas"][number];

/** Los dos tramos de la barra, con su color: la reparación en gris y el paro en rojo. */
const tramos = {
	reparacion: { etiqueta: "Reparación", color: "gris" },
	paro: { etiqueta: "Paro", color: "rojo" },
} as const;

/**
 * Una cifra de arriba: su nombre chico y su número grande.
 * @param props Su nombre, su número y si va en rojo.
 */
function CifraDeArriba({ nombre, rojo = false, children }: { nombre: string; rojo?: boolean; children: ReactNode }) {
	return (
		<Tarjeta nombre={nombre}>
			<span className="font-semibold text-etiqueta text-tinta3">{nombre}</span>
			<b className="font-bold text-titulo-seccion tabular-nums">
				{rojo ? <TextoConTono tono="rojo">{children}</TextoConTono> : children}
			</b>
		</Tarjeta>
	);
}

/**
 * La muestra de un tramo en la leyenda.
 * @param props El tramo.
 */
function DeLaLeyenda({ tramo }: { tramo: (typeof tramos)[keyof typeof tramos] }) {
	return (
		<span className="inline-flex items-center gap-2 font-semibold text-etiqueta text-tinta2">
			<span className="w-5">
				<BarraAvance segmentos={[{ ...tramo, valor: 1 }]} />
			</span>
			{tramo.etiqueta}
		</span>
	);
}

/**
 * La barra de lo gastado contra lo parado de una máquina, a escala de la que más cuesta.
 * @param props La máquina y lo que cuesta la que más cuesta.
 */
function GastadoContraParado({ maquina, mayor }: { maquina: MaquinaConCosto; mayor: number }) {
	const reparacion = maquina.reparaciones_centavos ?? 0;
	const paro = maquina.paro_centavos ?? 0;
	const ancho = mayor === 0 ? 0 : ((reparacion + paro) / mayor) * 100;
	return (
		<div style={{ width: `${ancho}%` }}>
			<BarraAvance
				segmentos={[
					{ ...tramos.reparacion, valor: reparacion },
					{ ...tramos.paro, valor: paro },
				]}
			/>
		</div>
	);
}

/**
 * La casilla «Una hora de máquina parada cuesta», que lleva su valor a la dirección.
 * @param props El costo de Configuración, en centavos.
 */
function CasillaDeLaHora({ deConfiguracion }: { deConfiguracion: number | undefined }) {
	const { busqueda, navegar } = useDireccionDeMantenimiento();
	const inicial = busqueda.hora ?? (deConfiguracion === undefined ? undefined : Math.round(deConfiguracion / 100));
	const [texto, setTexto] = useState(inicial === undefined ? "" : String(inicial));
	return (
		<Campo
			etiqueta="Una hora de máquina parada cuesta"
			inputMode="numeric"
			maxLength={6}
			value={texto}
			onChange={(evento) => {
				// Solo números: lo demás no se escribe.
				const limpio = evento.target.value.replace(/\D/g, "");
				setTexto(limpio);
				const pesos = Number(limpio);
				navegar({ hora: limpio === "" || pesos === 0 ? undefined : pesos });
			}}
		/>
	);
}

/**
 * Costo por máquina.
 * @param props Lo que regresa `mantenimiento.costo_por_maquina`.
 */
export function CostoDeMantenimiento({ datos }: { datos: Costo }) {
	const { abrir } = useDireccionDeMantenimiento();
	const mayor = Math.max(
		0,
		...datos.maquinas.map((maquina) => (maquina.reparaciones_centavos ?? 0) + (maquina.paro_centavos ?? 0)),
	);
	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-3 gap-3 max-menu:grid-cols-2 max-telefono:grid-cols-1">
				<CifraDeArriba nombre="Reparaciones en el año">{montoEnPantalla(datos.reparaciones_centavos)}</CifraDeArriba>
				<CifraDeArriba nombre={`Horas de paro · ${datos.horas_paro} h`} rojo>
					≈ {montoEnPantalla(datos.paro_centavos)}
				</CifraDeArriba>
				<Tarjeta nombre="Costo de la hora de paro">
					<CasillaDeLaHora deConfiguracion={datos.costo_hora_configuracion_centavos} />
				</Tarjeta>
			</div>
			<div className="flex flex-wrap gap-5">
				<DeLaLeyenda tramo={tramos.reparacion} />
				<DeLaLeyenda tramo={tramos.paro} />
			</div>
			<Tabla
				nombre="Costo por máquina"
				filas={datos.maquinas}
				claveDeFila={(maquina) => maquina.maquina_id}
				alTocarFila={(maquina) => abrir("maquina", maquina.maquina_id)}
				columnas={[
					{
						clave: "maquina",
						encabezado: "Máquina",
						celda: (maquina) => (
							<DosRenglones
								arriba={maquina.nombre}
								abajo={[plural(maquina.servicios, "servicio", "servicios"), maquina.la_trae]
									.filter((parte) => parte !== null)
									.join(" · ")}
							/>
						),
					},
					{
						clave: "reparaciones",
						encabezado: "Reparaciones",
						alinear: "derecha",
						celda: (maquina) => montoEnPantalla(maquina.reparaciones_centavos),
					},
					{ clave: "paro", encabezado: "Paro", alinear: "derecha", celda: (maquina) => `${maquina.horas_paro} h` },
					{
						clave: "pesos",
						encabezado: "Paro en pesos",
						alinear: "derecha",
						celda: (maquina) => <TextoConTono tono="rojo">{montoEnPantalla(maquina.paro_centavos)}</TextoConTono>,
					},
					{
						clave: "barra",
						encabezado: "Lo gastado contra lo parado",
						celda: (maquina) => <GastadoContraParado maquina={maquina} mayor={mayor} />,
					},
				]}
			/>
		</div>
	);
}
