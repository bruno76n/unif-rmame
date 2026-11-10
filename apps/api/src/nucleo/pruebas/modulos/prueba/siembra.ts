/**
 * La siembra del módulo de prueba: parámetros de cada tipo con sus límites, dos listas y la empresa.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 2)
 *
 * Solo la carga el servidor de prueba en su base copia. La lista de las unidades de material lleva la
 * clave de la de verdad (la siembra Compras en la fase 10) para probar sus reglas propias.
 */

import { v7 as uuidv7 } from "uuid";
import { empresa, listas } from "../../../../modulos/admin/tablas.ts";
import type { Semilla } from "../../../base/siembra.ts";
import { semillaDeParametros } from "../../../parametros.ts";

/** Los parámetros de prueba: uno con tope, una opción, una hora, uno que acepta vacío y una decisión. */
const parametrosDePrueba = semillaDeParametros("prueba", [
	{
		clave: "prueba.tope",
		seccion: "parametro",
		nombre: "Tope",
		tipo: "entero",
		unidad: "días",
		inicial: 3,
		minimo: 1,
		maximo: 10,
		orden: 1,
	},
	{
		clave: "prueba.dia",
		seccion: "parametro",
		nombre: "Día",
		tipo: "opcion",
		inicial: "martes",
		opciones: ["lunes", "martes"],
		orden: 2,
	},
	{ clave: "prueba.hora", seccion: "parametro", nombre: "Hora", tipo: "hora", inicial: "02:00", orden: 3 },
	{
		clave: "prueba.vacio",
		seccion: "parametro",
		nombre: "Vacío",
		tipo: "entero",
		inicial: null,
		permiteVacio: true,
		orden: 4,
	},
	{
		clave: "prueba.costo_paro",
		seccion: "decision_operacion",
		nombre: "Costo de la hora de paro",
		tipo: "centavos",
		inicial: 40_000,
		porDecidir: true,
		orden: 5,
	},
]);

/** Las semillas del módulo de prueba. */
export const semillasDePrueba: readonly Semilla[] = [
	parametrosDePrueba,
	{
		tabla: listas,
		filas: [
			{
				id: uuidv7(),
				clave: "prueba_categorias",
				nombre: "Categorías de prueba",
				modulo: "prueba",
				soloDuenaAgrega: false,
			},
			{
				id: uuidv7(),
				clave: "prueba_solo_duena",
				nombre: "Lista de la dueña",
				modulo: "prueba",
				soloDuenaAgrega: true,
			},
			{
				id: uuidv7(),
				clave: "unidades_material",
				nombre: "Unidades de material",
				modulo: "compras",
				soloDuenaAgrega: false,
			},
		],
	},
	{
		tabla: empresa,
		filas: [
			{
				id: uuidv7(),
				razonSocial: "Uniformes Alameda SA de CV",
				nombreComercial: "Uniformes Alameda",
				rfc: "UAL0101019X1",
				domicilio: "Av. Alameda 100, Centro, Ciudad de México",
			},
		],
	},
];
