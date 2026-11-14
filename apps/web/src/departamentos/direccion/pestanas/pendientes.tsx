/**
 * La pestaña Pendientes de Dirección: la barra de indicadores (Ventas, Producción, Existencias y Cuentas por cobrar y
 * pagar) y el panel con las autorizaciones por autorizar y las alertas, con sus filtros «Todos», «Autorizaciones» y
 * «Alertas».
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes»)
 *
 * Todo llega armado de `direccion.pendientes`: la pestaña pone el ícono de cada cifra y de cada tipo, y lleva a donde
 * dice cada uno. «Revisar» abre Autorizaciones; «Ver» lleva al departamento de la alerta, y no sale si la cuenta no lo
 * tiene.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { pendientes } from "@uniformame/compartido/contratos/direccion/pendientes";
import { BarraIndicadores, type Cifra } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { type LucideIcon, Package, ShieldCheck, ShoppingCart, TriangleAlert, Wallet, Workflow } from "lucide-react";
import type { z } from "zod";

/** Lo que trae `direccion.pendientes`. */
type Datos = z.infer<typeof pendientes.resultado>;

/** El nombre, el ícono y el color de cada cifra. */
const deCadaCifra: Readonly<
	Record<Datos["cifras"][number]["clave"], { nombre: string; icono: LucideIcon; color: ColorDeTipo }>
> = {
	ventas: { nombre: "Ventas", icono: ShoppingCart, color: "azul" },
	produccion: { nombre: "Producción", icono: Workflow, color: "verde-azulado" },
	existencias: { nombre: "Existencias", icono: Package, color: "violeta" },
	cuentas: { nombre: "Cuentas por cobrar y pagar", icono: Wallet, color: "verde" },
};

/** Cómo se ve cada grupo del panel: el tipo, su ícono, su color y su botón. */
const deCadaGrupo = {
	autorizaciones: { texto: "Autorización", icono: ShieldCheck, color: "ambar", boton: "Revisar" },
	alertas: { texto: "Alerta", icono: TriangleAlert, color: "rojo", boton: "Ver" },
} as const;

/** Lo que recibe la pestaña. */
interface PropsDePendientes {
	datos: Datos;
	/** El filtro del panel, de la dirección: «todos», «autorizaciones» o «alertas». */
	filtro: string;
	alEscogerFiltro: (filtro: string) => void;
	/** Lleva a una ruta de la web (`direccion/indicadores`). */
	ir: (ruta: string) => void;
}

/**
 * La pestaña Pendientes.
 * @param props Los datos, el filtro y cómo navegar.
 */
export function PestanaPendientes({ datos, filtro, alEscogerFiltro, ir }: PropsDePendientes) {
	const cifras: Cifra[] = datos.cifras.map((cifra) => ({
		...deCadaCifra[cifra.clave],
		clave: cifra.clave,
		numero: cifra.numero,
		unidad: cifra.unidad,
		contexto: cifra.contexto,
		...(cifra.serie.length === 0 ? {} : { serie: cifra.serie }),
		...(cifra.reparto.length === 0 ? {} : { reparto: cifra.reparto }),
		alTocar: () => (cifra.lleva_a === null ? undefined : ir(cifra.lleva_a)),
	}));
	const lista: Pendiente[] = datos.pendientes.map((pendiente) => {
		const grupo = deCadaGrupo[pendiente.grupo];
		const destino = pendiente.lleva_a;
		return {
			clave: pendiente.clave,
			grupo: pendiente.grupo,
			tipo: { texto: grupo.texto, icono: grupo.icono, color: grupo.color },
			referencia: {
				titulo: pendiente.titulo,
				...(pendiente.detalle === null ? {} : { detalle: pendiente.detalle }),
			},
			...(pendiente.fecha === null
				? {}
				: { fecha: { texto: textoDeDiaCorto(pendiente.fecha), orden: pendiente.fecha } }),
			...(pendiente.cifra === null ? {} : { cifra: pendiente.cifra }),
			estado: { texto: pendiente.estado, color: pendiente.color },
			...(destino === null ? {} : { accion: { texto: grupo.boton, alTocar: () => ir(destino) } }),
		};
	});
	const { autorizaciones, alertas } = datos.conteos;
	return (
		<>
			<BarraIndicadores cifras={cifras} />
			<PanelPendientes
				pendientes={lista}
				filtro={filtro}
				alEscogerFiltro={alEscogerFiltro}
				columnaCifra="Importe"
				filtros={[
					{ clave: "todos", texto: "Todos", conteo: autorizaciones + alertas },
					{ clave: "autorizaciones", texto: "Autorizaciones", conteo: autorizaciones },
					{ clave: "alertas", texto: "Alertas", conteo: alertas },
				]}
			/>
		</>
	);
}
