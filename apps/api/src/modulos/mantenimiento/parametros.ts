/**
 * Los parámetros que declara `mantenimiento`: lo que cuesta una hora de máquina parada, quién responde por ella y cómo
 * se cuentan las horas de paro.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («Parámetros»)
 *
 * La categoría y la ubicación del gasto de un servicio se siembran en la fase 17, con los gastos.
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `mantenimiento`, con su valor inicial. */
export const semillaDeParametrosDeMantenimiento = semillaDeParametros("mantenimiento", [
	{
		clave: "mantenimiento.costo_hora_paro",
		seccion: "decision_operacion",
		nombre: "Lo que cuesta una hora de máquina parada",
		explicacion: "El paro en pesos: horas de paro por este costo",
		tipo: "centavos",
		inicial: 45_000,
		minimo: 0,
		orden: 1,
	},
	{
		clave: "mantenimiento.responsable_hora_paro",
		seccion: "decision_operacion",
		nombre: "Quién responde por el paro",
		explicacion: "Quién responde por el costo de las máquinas paradas; solo se guarda",
		tipo: "opcion",
		opciones: ["mantenimiento", "produccion", "direccion"],
		inicial: "mantenimiento",
		orden: 2,
	},
	{
		clave: "mantenimiento.paro_horas_por_dia",
		seccion: "parametro",
		nombre: "Horas de paro por día",
		explicacion: "Las horas de paro que cuenta cada día de trabajo de una máquina parada",
		tipo: "entero",
		unidad: "h",
		inicial: 9,
		minimo: 1,
		maximo: 24,
		orden: 3,
	},
	{
		clave: "mantenimiento.paro_horas_hoy",
		seccion: "parametro",
		nombre: "Horas de paro de hoy",
		explicacion: "Las horas de paro que cuenta el día de hoy",
		tipo: "entero",
		unidad: "h",
		inicial: 4,
		minimo: 0,
		maximo: 24,
		orden: 4,
	},
]);
