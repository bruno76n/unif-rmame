/**
 * Pendientes de Patronaje: las tres cifras de arriba (Recetas, Rendimiento y Desarrollo de producto), cada una lleva a
 * su pestaña, y el panel con la cola de trabajo, cada renglón con su botón: «Capturar receta» o «Verificar» (la página
 * de la receta; se verifica al cerrar su corte en Producción) y «Ver desarrollo» (su cajón).
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Pendientes»)
 *
 * Todo llega escrito de `patronaje.pendientes`: la pantalla no calcula estados.
 */

import {
	gruposDePendientesDePatronaje,
	pendientesDePatronaje,
	type renglonDePendientesDePatronaje,
} from "@uniformame/compartido/contratos/patronaje/pendientes";
import type { Filtro } from "@uniformame/interfaz/captura/filtros";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Activity, Ruler, Sparkles } from "lucide-react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { direcciones, rutasDePatronaje, useDireccion } from "../direccion.ts";
import { PaginaDePatronaje } from "../pagina.tsx";

/** Un renglón de Pendientes, como llega. */
type Renglon = z.infer<typeof renglonDePendientesDePatronaje>;

/** El texto de cada filtro. */
const nombresDeFiltro: Readonly<Record<(typeof gruposDePendientesDePatronaje)[number], string>> = {
	todos: "Todos",
	recetas: "Recetas",
	muestra: "Muestras",
};

/** El nombre, el ícono y el color de cada tipo de pendiente. */
const tipos = {
	receta: { texto: "Receta", icono: Ruler, color: "rosa" },
	muestra: { texto: "Muestra", icono: Sparkles, color: "violeta" },
} as const;

/** La pestaña Pendientes de Patronaje. */
export function PestanaPendientes() {
	const { leer, ir } = useDireccion();
	const grupo = gruposDePendientesDePatronaje.find((uno) => uno === leer("grupo")) ?? "todos";
	const consulta = useConsulta(pendientesDePatronaje, {});
	const datos = consulta.data;
	return (
		<PaginaDePatronaje
			activa="pendientes"
			{...(datos === undefined ? {} : { pendientes: { conteo: datos.conteos.todos, rojo: datos.hay_rojo } })}
		>
			<SegunConsulta consulta={consulta}>
				{(leidos) => (
					<>
						<Indicadores indicadores={leidos.indicadores} />
						<ColaDeTrabajo
							renglones={leidos.renglones}
							conteos={leidos.conteos}
							grupo={grupo}
							alEscogerGrupo={(clave) => ir({ grupo: clave === "todos" ? undefined : clave })}
						/>
					</>
				)}
			</SegunConsulta>
		</PaginaDePatronaje>
	);
}

/**
 * Las tres cifras de Pendientes; cada una lleva a su pestaña.
 * @param props Lo que regresa `patronaje.pendientes` en `indicadores`.
 */
function Indicadores({ indicadores }: { indicadores: z.infer<typeof pendientesDePatronaje.resultado>["indicadores"] }) {
	const { ir } = useDireccion();
	const { recetas, rendimiento, desarrollo } = indicadores;
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "recetas",
					nombre: "Recetas",
					icono: Ruler,
					color: "rosa",
					numero: recetas.prendas,
					unidad: recetas.prendas === 1 ? "prenda" : "prendas",
					...(recetas.sin_receta_pronto > 0 ? { tono: "rojo" as const } : {}),
					contexto: [
						...(recetas.sin_receta_pronto > 0
							? [{ texto: `${recetas.sin_receta_pronto} sin receta con corte próximo`, tono: "rojo" as const }]
							: []),
						...(recetas.sin_verificar > 0
							? [{ texto: `${recetas.sin_verificar} sin verificar`, tono: "ambar" as const }]
							: []),
					],
					reparto: [
						{ etiqueta: "Verificadas", valor: recetas.verificadas, color: "verde" },
						{ etiqueta: "Sin verificar", valor: recetas.sin_verificar, color: "ambar" },
						{ etiqueta: "Sin receta", valor: recetas.sin_receta, color: "rojo" },
					],
					alTocar: () => ir({}, rutasDePatronaje.recetas),
				},
				{
					clave: "rendimiento",
					nombre: "Rendimiento",
					icono: Activity,
					color: "azul",
					numero: rendimiento.altos,
					unidad: `con desperdicio arriba de ${rendimiento.pct_alto}%`,
					...(rendimiento.altos > 0 ? { tono: "ambar" as const } : {}),
					contexto: [
						{
							texto: `${rendimiento.medidas} ${rendimiento.medidas === 1 ? "prenda medida" : "prendas medidas"} en corte`,
						},
					],
					alTocar: () => ir({}, rutasDePatronaje.rendimiento),
				},
				{
					clave: "desarrollo",
					nombre: "Desarrollo de producto",
					icono: Sparkles,
					color: "violeta",
					numero: desarrollo.en_proceso,
					unidad: "en proceso",
					contexto: [
						desarrollo.en_aprobacion > 0
							? { texto: `${desarrollo.en_aprobacion} en aprobación`, tono: "ambar" as const }
							: { texto: "Ninguna en aprobación" },
					],
					alTocar: () => ir({}, rutasDePatronaje.desarrollo),
				},
			]}
		/>
	);
}

/**
 * El panel de Pendientes con sus filtros (solo los que tienen renglones) y el botón de cada renglón.
 * @param props Los renglones, los conteos, el filtro activo y qué hacer al escoger otro.
 */
function ColaDeTrabajo({
	renglones,
	conteos,
	grupo,
	alEscogerGrupo,
}: {
	renglones: readonly Renglon[];
	conteos: Readonly<Record<string, number>>;
	grupo: string;
	alEscogerGrupo: (clave: string) => void;
}) {
	const { irA } = useDireccion();
	const pendientes: Pendiente[] = renglones.map((renglon) => ({
		clave: renglon.clave,
		grupo: renglon.tipo === "receta" ? "recetas" : "muestra",
		tipo: tipos[renglon.tipo],
		referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
		...(renglon.fecha === null
			? {}
			: { fecha: { texto: renglon.fecha, orden: renglon.fecha_orden ?? "", roja: renglon.fecha_roja } }),
		estado: { texto: renglon.estado, color: renglon.color },
		accion:
			renglon.tipo === "receta"
				? {
						texto: renglon.boton === "capturar" ? "Capturar receta" : "Verificar",
						alTocar: () => irA(direcciones.receta(renglon.producto_id)),
						principal: renglon.color === "rojo",
					}
				: { texto: "Ver desarrollo", alTocar: () => irA(direcciones.desarrollo(renglon.desarrollo_id)) },
	}));
	const filtros: Filtro[] = gruposDePendientesDePatronaje
		.filter((clave) => clave === "todos" || (conteos[clave] ?? 0) > 0)
		.map((clave) => ({ clave, texto: nombresDeFiltro[clave], conteo: conteos[clave] ?? 0 }));
	return (
		<PanelPendientes
			pendientes={pendientes}
			filtros={filtros}
			filtro={grupo}
			alEscogerFiltro={alEscogerGrupo}
			columnaCifra="Cantidad"
		/>
	);
}
