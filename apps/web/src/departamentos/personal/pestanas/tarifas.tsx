/**
 * Tarifas de Personal (con «ven sueldos y tarifas»): arriba «{n} operaciones sin tarifa» si hay; una tarjeta por flujo
 * con sus operaciones en orden: Operación · La hace · «Tarifa por pieza» (una casilla en pesos, marcada si está «Sin
 * tarifa») · «Desde {fecha}»; «Ver historial» suma sus tarifas anteriores con sus fechas.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Tarifas») y docs/modulos/personal/tarifas.md
 *
 * Lee `personal.tarifas` (solo con «ven sueldos y tarifas»; sin el permiso la consulta no responde y la pantalla dice
 * que no hay acceso). Al salir de una casilla que cambió, manda `personal.poner_tarifa_operacion`; lo capturado se revisa con el esquema del
 * contrato («Escribe la tarifa en pesos, por ejemplo 1.50»). «Poner tarifa» de Pendientes llega con la operación en la
 * dirección y le pone el foco.
 */

import { centavosACampo, enPesos, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { ponerTarifaOperacion, tarifasDelPersonal } from "@uniformame/compartido/contratos/personal/tarifas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDePersonal } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** Lo que regresa la consulta. */
type Tarifas = z.infer<typeof tarifasDelPersonal.resultado>;

/** Un flujo con sus operaciones. */
type Flujo = Tarifas["flujos"][number];

/** Una operación de un flujo. */
type Operacion = Flujo["operaciones"][number];

/**
 * La casilla de la tarifa de una operación: al salir, si cambió, manda la tarifa nueva.
 * @param props La operación y si lleva el foco al abrir.
 */
function CasillaDeTarifa({ operacion, enfocar }: { operacion: Operacion; enfocar: boolean }) {
	const conConexion = useConConexion();
	const avisar = useAvisar();
	const { enviar, enviando } = useEnvio(ponerTarifaOperacion);
	const guardada = centavosACampo(operacion.tarifa_centavos);
	const [texto, setTexto] = useState(guardada);
	// Lo que llega de la consulta (otra tarifa, o la misma ya guardada) reemplaza lo escrito.
	useEffect(() => setTexto(guardada), [guardada]);
	const alSalir = async () => {
		if (texto.trim() === guardada) return;
		const datos = {
			flujo_operacion_id: operacion.flujo_operacion_id,
			tarifa_centavos: pesosACentavos(texto.trim()) ?? Number.NaN,
			...(operacion.version === null ? {} : { version: operacion.version }),
		};
		const revisada = ponerTarifaOperacion.entrada.safeParse(datos);
		if (!revisada.success) {
			setTexto(guardada);
			avisar(revisada.error.issues[0]?.message ?? "Escribe la tarifa en pesos, por ejemplo 1.50", "no_se_pudo");
			return;
		}
		const salio = await enviar({ datos: revisada.data });
		if (salio === undefined) setTexto(guardada);
	};
	return (
		<Campo
			etiqueta="$ por pieza"
			inputMode="decimal"
			maxLength={8}
			autoComplete="off"
			autoFocus={enfocar}
			aria-label={`Tarifa de ${operacion.nombre}`}
			value={texto}
			disabled={!conConexion || enviando}
			error={operacion.tarifa_centavos == null ? "Sin tarifa" : undefined}
			onChange={(evento) => setTexto(evento.target.value)}
			onBlur={() => void alSalir()}
		/>
	);
}

/**
 * Las tarifas anteriores de un flujo, que se leen al pedir su historial.
 * @param props El flujo.
 */
function TarifasAnteriores({ flujoId }: { flujoId: string }) {
	const consulta = useConsulta(tarifasDelPersonal, { flujo_id: flujoId, historial: "si" });
	return (
		<SegunConsulta consulta={consulta} renglones={2}>
			{(datos) => {
				const anteriores = (datos.flujos[0]?.operaciones ?? []).flatMap((operacion) =>
					operacion.anteriores.map((anterior) => ({ operacion: operacion.nombre, ...anterior })),
				);
				if (anteriores.length === 0) return <p className="m-0 text-tinta3">Sin tarifas anteriores</p>;
				return (
					<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
						{anteriores.map((anterior) => (
							<li key={`${anterior.operacion}-${anterior.desde}`} className="flex justify-between gap-4 py-2">
								<span>{`${anterior.operacion}: ${anterior.tarifa_centavos == null ? "—" : enPesos(anterior.tarifa_centavos)}`}</span>
								<span className="text-etiqueta text-tinta3">
									{`${textoDeMomentoCorto(anterior.desde)} al ${textoDeMomentoCorto(anterior.hasta)}`}
								</span>
							</li>
						))}
					</ul>
				);
			}}
		</SegunConsulta>
	);
}

/**
 * La tarjeta de un flujo.
 * @param props El flujo y la operación que lleva el foco, si hay.
 */
function TarjetaDeFlujo({ flujo, enfocada }: { flujo: Flujo; enfocada: string | undefined }) {
	const [conHistorial, setConHistorial] = useState(false);
	return (
		<Tarjeta nombre={flujo.nombre}>
			<div className="flex items-center gap-3">
				<TituloDeBloque titulo={flujo.nombre} />
				<span className="text-etiqueta text-tinta3">
					{plural(flujo.operaciones.length, "operación", "operaciones")}
				</span>
				<span className="flex-1" />
				<Boton chico variante="fantasma" onClick={() => setConHistorial((antes) => !antes)}>
					{conHistorial ? "Ocultar historial" : "Ver historial"}
				</Boton>
			</div>
			<Panel>
				<Tabla
					nombre={`Tarifas de ${flujo.nombre}`}
					filas={flujo.operaciones}
					claveDeFila={(operacion) => operacion.flujo_operacion_id}
					columnas={[
						{ clave: "operacion", encabezado: "Operación", celda: (operacion) => operacion.nombre },
						{ clave: "la_hace", encabezado: "La hace", celda: (operacion) => operacion.la_hace },
						{
							clave: "tarifa",
							encabezado: "Tarifa por pieza",
							celda: (operacion) => (
								<CasillaDeTarifa operacion={operacion} enfocar={operacion.flujo_operacion_id === enfocada} />
							),
						},
						{
							clave: "desde",
							encabezado: "Desde",
							celda: (operacion) => (operacion.desde === null ? "—" : `Desde ${textoDeMomentoCorto(operacion.desde)}`),
						},
					]}
				/>
			</Panel>
			{conHistorial ? <TarifasAnteriores flujoId={flujo.flujo_id} /> : null}
		</Tarjeta>
	);
}

/** La pestaña Tarifas: lee `personal.tarifas` y pinta sus estados. */
export function TarifasDePersonal() {
	const consulta = useConsulta(tarifasDelPersonal, {});
	return (
		<SegunConsulta consulta={consulta} renglones={8}>
			{(datos) => <Contenido datos={datos} />}
		</SegunConsulta>
	);
}

/**
 * Lo que pinta Tarifas con los datos.
 * @param props Lo que regresa `personal.tarifas`.
 */
function Contenido({ datos }: { datos: Tarifas }) {
	const { busqueda } = useDireccionDePersonal();
	return (
		<div className="flex flex-col gap-4">
			{datos.sin_tarifa > 0 ? (
				<Recuadro color="ambar">
					{`${plural(datos.sin_tarifa, "operación sin tarifa", "operaciones sin tarifa")}: mientras no tengan, sus piezas no suman a la nómina`}
				</Recuadro>
			) : null}
			{datos.flujos.length === 0 ? <EstadoDePantalla tipo="vacio" texto="Sin flujos" /> : null}
			<div className="grid grid-cols-2 gap-4 max-menu:grid-cols-1">
				{datos.flujos.map((flujo) => (
					<TarjetaDeFlujo key={flujo.flujo_id} flujo={flujo} enfocada={busqueda.operacion} />
				))}
			</div>
			<LineaDeAviso tono="info">
				Cada pieza registrada guarda la tarifa del momento: cambiar una tarifa vale para lo que se registre desde ahora
			</LineaDeAviso>
		</div>
	);
}
