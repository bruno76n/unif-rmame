/**
 * Personas de Personal: arriba el selector «Área», «Ver tarifas» (con el permiso; cambia a «Ocultar tarifas») y «Nueva
 * persona»; un grupo por área con su conteo y al final «Dadas de baja», con Persona (nombre y E-), Puesto, Forma de
 * pago, Tarifa («••••» oculta), Ingreso y Entra al sistema. El renglón abre el cajón de la persona.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Personas»)
 *
 * El área y «Ver tarifas» van en la dirección. Ver las tarifas lo pide la consulta con el permiso y queda en la bitácora.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	nombresDeArea,
	nombresDeFormaDePago,
	type personasDeLaLista,
} from "@uniformame/compartido/contratos/personal/personas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso, TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Eye, EyeOff, Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useDireccionDePersonal } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Personas = z.infer<typeof personasDeLaLista.resultado>;

/** Una persona de la lista. */
type PersonaDeLaLista = Personas["personas"][number];

/**
 * Los parámetros de `personal.personas` según el área de la dirección: un área, `tienda:{id}` o `baja`.
 * @param area El área de la dirección.
 * @param ver Si se piden las tarifas.
 */
export function parametrosDePersonas(
	area: string | undefined,
	ver: boolean,
): z.input<typeof personasDeLaLista.entrada> {
	const tarifas = ver ? { ver_tarifas: "si" as const } : {};
	if (area === undefined) return tarifas;
	if (area.startsWith("tienda:")) return { area: "tienda", ubicacion_id: area.slice("tienda:".length), ...tarifas };
	if (area === "taller" || area === "oficina" || area === "aduana_bodega" || area === "baja")
		return { area, ...tarifas };
	return tarifas;
}

/**
 * El grupo de una persona: su área (cada tienda por separado) o «Dadas de baja».
 * @param persona La persona.
 * @param tiendas Las tiendas, con su nombre.
 */
function grupoDe(persona: PersonaDeLaLista, tiendas: Personas["tiendas"]): { clave: string; nombre: string } {
	if (persona.baja_en !== null) return { clave: "baja", nombre: "Dadas de baja" };
	if (persona.area === "tienda") {
		const tienda = tiendas.find((una) => una.id === persona.ubicacion_id);
		return { clave: `tienda:${persona.ubicacion_id ?? ""}`, nombre: tienda?.nombre ?? nombresDeArea.tienda };
	}
	return { clave: persona.area, nombre: nombresDeArea[persona.area] };
}

/**
 * La tarifa de una persona, a la vista o tapada.
 * @param persona La persona.
 * @param ver Si las tarifas están a la vista.
 */
function Tarifa({ persona, ver }: { persona: PersonaDeLaLista; ver: boolean }) {
	if (!ver) return <span title="Tarifa oculta">••••</span>;
	if (persona.forma_pago === "pieza") {
		return (
			<span className="text-tinta3">
				{persona.tarifa_centavos == null
					? "Por operación · —"
					: `Por operación · ${enPesos(persona.tarifa_centavos)} en promedio`}
			</span>
		);
	}
	const alDia = persona.pago_dia_centavos == null ? "—" : `${enPesos(persona.pago_dia_centavos)} al día`;
	return <>{persona.forma_pago === "mixta" ? `${alDia} + piezas` : alDia}</>;
}

/**
 * «Entra al sistema», como lo escribe la lectura: «Sin PIN» en ámbar y la baja con su día.
 * @param props Lo que dice la lectura.
 */
function EntraAlSistema({ texto }: { texto: string }) {
	if (texto === "Sin PIN") return <TextoConTono tono="ambar">Sin PIN</TextoConTono>;
	if (texto.startsWith("Baja "))
		return <span className="text-tinta3">{`Baja ${textoDeDiaCorto(texto.slice(5))}`}</span>;
	return <>{texto}</>;
}

/**
 * Las personas de un grupo.
 * @param props Sus personas, si las tarifas están a la vista y qué hacer al tocar una.
 */
function TablaDePersonas({
	personas,
	ver,
	alTocar,
}: {
	personas: readonly PersonaDeLaLista[];
	ver: boolean;
	alTocar: (id: string) => void;
}) {
	return (
		<Tabla
			nombre="Personas"
			filas={personas}
			claveDeFila={(persona) => persona.id}
			alTocarFila={(persona) => alTocar(persona.id)}
			columnas={[
				{
					clave: "persona",
					encabezado: "Persona",
					celda: (persona) => <DosRenglones arriba={persona.nombre} abajo={persona.folio} />,
				},
				{ clave: "puesto", encabezado: "Puesto", celda: (persona) => persona.puesto },
				{ clave: "forma", encabezado: "Forma de pago", celda: (persona) => nombresDeFormaDePago[persona.forma_pago] },
				{ clave: "tarifa", encabezado: "Tarifa", celda: (persona) => <Tarifa persona={persona} ver={ver} /> },
				{
					clave: "ingreso",
					encabezado: "Ingreso",
					celda: (persona) => `${textoDeDiaCorto(persona.fecha_ingreso)} ${persona.fecha_ingreso.slice(0, 4)}`,
				},
				{
					clave: "entra",
					encabezado: "Entra al sistema",
					celda: (persona) => <EntraAlSistema texto={persona.entra_al_sistema} />,
				},
			]}
		/>
	);
}

/**
 * Personas de Personal.
 * @param props Lo que regresa `personal.personas`.
 */
export function PersonasDePersonal({ datos }: { datos: Personas }) {
	const { busqueda, navegar, abrir } = useDireccionDePersonal();
	const conConexion = useConConexion();
	const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
	const ver = busqueda.ver === "si" && datos.ve_sueldos;
	// Un grupo por área, en el orden de la lista de áreas y las tiendas, y al final las dadas de baja.
	const orden = ["taller", "oficina", "aduana_bodega", ...datos.tiendas.map((tienda) => `tienda:${tienda.id}`), "baja"];
	const grupos = new Map<string, { nombre: string; personas: PersonaDeLaLista[] }>();
	for (const persona of datos.personas) {
		const grupo = grupoDe(persona, datos.tiendas);
		const suyo = grupos.get(grupo.clave) ?? { nombre: grupo.nombre, personas: [] };
		suyo.personas.push(persona);
		grupos.set(grupo.clave, suyo);
	}
	const enOrden = [...grupos.entries()].sort(([una], [otra]) => orden.indexOf(una) - orden.indexOf(otra));
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<Selector
					etiqueta="Área"
					value={busqueda.area ?? ""}
					opciones={[
						{ valor: "", texto: "Todas las áreas" },
						{ valor: "taller", texto: nombresDeArea.taller },
						{ valor: "oficina", texto: nombresDeArea.oficina },
						{ valor: "aduana_bodega", texto: nombresDeArea.aduana_bodega },
						...datos.tiendas.map((tienda) => ({ valor: `tienda:${tienda.id}`, texto: tienda.nombre })),
						{ valor: "baja", texto: "Dadas de baja" },
					]}
					onChange={(evento) => navegar({ area: evento.target.value || undefined })}
				/>
				<span className="flex-1" />
				{datos.ve_sueldos ? (
					<Boton icono={ver ? EyeOff : Eye} onClick={() => navegar({ ver: ver ? undefined : "si" })}>
						{ver ? "Ocultar tarifas" : "Ver tarifas"}
					</Boton>
				) : null}
				<Boton variante="principal" icono={Plus} disabled={!conConexion} onClick={() => abrir("nueva")}>
					Nueva persona
				</Boton>
			</div>
			{ver ? (
				<LineaDeAviso tono="info">Quedó registrado en la bitácora que consultaste las tarifas</LineaDeAviso>
			) : null}
			{enOrden.length === 0 ? <EstadoDePantalla tipo="vacio" texto="Sin personas en esta área" /> : null}
			{enOrden.map(([clave, grupo]) => (
				<GrupoPlegable
					key={clave}
					titulo={grupo.nombre}
					color={clave === "baja" ? "pizarra" : "azul"}
					cuantos={String(grupo.personas.length)}
					abierto={!plegados.has(clave)}
					alCambiar={(abierto) =>
						setPlegados((antes) => {
							const despues = new Set(antes);
							if (abierto) despues.delete(clave);
							else despues.add(clave);
							return despues;
						})
					}
				>
					<TablaDePersonas personas={grupo.personas} ver={ver} alTocar={(id) => abrir("persona", id)} />
				</GrupoPlegable>
			))}
			<LineaDeAviso tono="info">
				Una persona no necesita cuenta: su producción y su pago le corresponden igual
			</LineaDeAviso>
		</div>
	);
}
