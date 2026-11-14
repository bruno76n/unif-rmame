/**
 * Lo que cada cuenta no debe ver: la revisión que el arnés corre sobre cada respuesta de la API, para el criterio
 * «Ninguna cuenta recibió en ningún paso lo que no debe ver».
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (criterios) y docs/cimientos/ACCESO-Y-PERMISOS.md
 *
 * Revisa con las mismas reglas del recorte común (`camposQueNoVe`: los sueldos y las tarifas, y a soporte cualquier
 * monto, también escrito en un texto) y, además, que a una cuenta con solo Aduana o Bodega nunca le llegue un precio de
 * venta (`preciosRecortables` de Ventas). Si la API dejara pasar algo, la revisión lo encuentra aunque la consulta no
 * lo haya recortado.
 */

import type { QuienLlama } from "../../../apps/api/src/nucleo/acceso/quien.ts";
import { camposQueNoVe, montoEnTextoTapado, patronDeMonto } from "../../../apps/api/src/nucleo/acceso/recorte.ts";
import { preciosRecortables } from "../../../packages/compartido/src/contratos/ventas/vistas.ts";

/** Los campos de un precio de venta. */
const camposDePrecio: ReadonlySet<string> = new Set(preciosRecortables);

/** Los departamentos que nunca ven un precio de venta: Aduana y Bodega. */
const sinPreciosDeVenta = new Set(["aduana", "bodega"]);

/**
 * Si quien llama solo tiene departamentos que no ven precios de venta.
 * @param quien Quién llama.
 */
function soloAduanaYBodega(quien: QuienLlama): boolean {
	return (
		quien.tipo === "cuenta" &&
		!quien.esDuena &&
		quien.departamentos.length > 0 &&
		quien.departamentos.every((departamento) => sinPreciosDeVenta.has(departamento))
	);
}

/**
 * Lo que una respuesta trae y quien llama no debía ver.
 * @param quien Quién llama.
 * @param camposDeSueldo Los campos de sueldo o de tarifa de los módulos.
 * @param cuerpo La respuesta, ya leída.
 * @returns Cada cosa que no debía llegar, con su lugar (`resultado.lineas.0.precio_unitario_centavos`); vacío si nada.
 */
export function loQueNoDebiaVer(quien: QuienLlama, camposDeSueldo: ReadonlySet<string>, cuerpo: unknown): string[] {
	const noVe = camposQueNoVe(quien, camposDeSueldo);
	const sinPrecios = soloAduanaYBodega(quien);
	const soporte = quien.tipo === "cuenta" && quien.esSoporte;
	const monto = new RegExp(patronDeMonto);
	const encontrado: string[] = [];
	const revisar = (valor: unknown, lugar: string): void => {
		if (typeof valor === "string") {
			if (soporte && monto.test(valor.replaceAll(montoEnTextoTapado, ""))) encontrado.push(`${lugar}: «${valor}»`);
			return;
		}
		if (Array.isArray(valor)) {
			valor.forEach((adentro, i) => {
				revisar(adentro, `${lugar}.${i}`);
			});
			return;
		}
		if (typeof valor !== "object" || valor === null) return;
		for (const [campo, adentro] of Object.entries(valor)) {
			const aqui = lugar === "" ? campo : `${lugar}.${campo}`;
			if (noVe(campo) || (sinPrecios && camposDePrecio.has(campo))) encontrado.push(aqui);
			else revisar(adentro, aqui);
		}
	};
	revisar(cuerpo, "");
	return encontrado;
}

/**
 * Lo que el texto de una hoja o etiqueta en PDF trae y quien la pidió no debía ver: un peso, a soporte o a quien solo
 * tiene Aduana o Bodega.
 * @param quien Quién la pidió.
 * @param texto El texto de todas sus páginas.
 */
export function loQueNoDebiaVerEnUnPdf(quien: QuienLlama, texto: string): string[] {
	const sinPesos = (quien.tipo === "cuenta" && quien.esSoporte) || soloAduanaYBodega(quien);
	return sinPesos && texto.includes("$") ? [`un peso en «${texto.slice(0, 200)}»`] : [];
}
