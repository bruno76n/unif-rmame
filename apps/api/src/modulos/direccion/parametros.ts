/**
 * Los parámetros que declara `direccion`.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md («Parámetros»)
 * Fase 18 · docs/modulos/direccion/alertas-e-indicadores.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `direccion`, con su valor inicial. */
export const semillaDeParametrosDeDireccion = semillaDeParametros("direccion", [
	{
		clave: "direccion.autorizacion_dias_rojo",
		seccion: "parametro",
		nombre: "Días para que una autorización se vea en rojo",
		explicacion: "Desde cuántos días esperando la tarjeta dice «Por autorizar · {n} días» en rojo",
		tipo: "entero",
		unidad: "días",
		inicial: 2,
		minimo: 1,
		orden: 1,
	},
	{
		clave: "direccion.autorizacion_dias_menu_rojo",
		seccion: "parametro",
		nombre: "Días para que el menú de Dirección se vea en rojo",
		explicacion: "Desde cuántos días esperando el conteo del menú de Dirección se pone rojo",
		tipo: "entero",
		unidad: "días",
		inicial: 3,
		minimo: 1,
		orden: 2,
	},
	{
		clave: "direccion.primer_vistazo",
		seccion: "decision_operacion",
		nombre: "Periodo del primer vistazo de Dirección",
		explicacion: "El periodo de los indicadores en Pendientes de Dirección: la semana o el día",
		tipo: "opcion",
		inicial: "semana",
		opciones: ["semana", "dia"],
		orden: 1,
	},
	{
		clave: "direccion.alerta_consumo_tela_max",
		seccion: "parametro",
		nombre: "Prendas en la alerta de consumo de tela",
		explicacion: "Cuántas prendas salen, a lo más, en la alerta de consumo de tela",
		tipo: "entero",
		inicial: 2,
		minimo: 1,
		orden: 3,
	},
	{
		clave: "direccion.alerta_concentracion_cliente_pct",
		seccion: "parametro",
		nombre: "Concentración del saldo por cobrar",
		explicacion: "La parte del saldo por cobrar de un solo cliente que prende la alerta de concentración",
		tipo: "porcentaje",
		inicial: 35,
		minimo: 1,
		maximo: 100,
		orden: 4,
	},
	{
		clave: "direccion.alerta_concentracion_vencido_dias",
		seccion: "parametro",
		nombre: "Vencido que pone roja la concentración",
		explicacion: "Desde cuántos días vencido el saldo de ese cliente pone roja la alerta de concentración",
		tipo: "entero",
		unidad: "días",
		inicial: 30,
		minimo: 1,
		orden: 5,
	},
	{
		clave: "direccion.alerta_reposicion_max",
		seccion: "parametro",
		nombre: "Materiales en «sin tiempo de reposición»",
		explicacion: "Cuántos materiales salen, a lo más, en la alerta de materiales sin tiempo de reposición",
		tipo: "entero",
		inicial: 2,
		minimo: 1,
		orden: 6,
	},
	{
		clave: "direccion.minutos_revisar_alertas",
		seccion: "tecnico",
		nombre: "Cada cuánto se revisan las alertas de Dirección",
		tipo: "entero",
		unidad: "minutos",
		inicial: 30,
		minimo: 5,
		orden: 7,
	},
]);
