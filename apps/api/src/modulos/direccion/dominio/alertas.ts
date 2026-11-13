/**
 * Las reglas de las alertas cruzadas de Dirección: con lo que dan las lecturas de cada dueño y los parámetros, las
 * alertas de este momento, cada una con su clave, su título, su color, los departamentos que cruza y a dónde lleva
 * «Ver», en el orden de la tabla.
 * Fase 18 · docs/modulos/direccion/alertas-e-indicadores.md (reglas 1 a 3, «Las alertas»)
 *
 * Es una función pura: la usan el trabajo «Alertas de Dirección» y la consulta de Alertas cruzadas (fase 19), así la
 * pantalla y el aviso dicen lo mismo. Una alerta no se guarda: sale mientras se cumple su regla.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDia } from "@uniformame/compartido/calculos/fechas";

/** Lo que dan las lecturas de cada dueño, ya leído. */
export interface DatosDeLasAlertas {
	/** `produccion.lotes_atorados`. */
	lotesAtorados: readonly { lote_id: string; folio: string; operacion: string; dias: number; falla: string | null }[];
	/** `patronaje.desperdicio_prenda` de todas las prendas cortadas, con su nombre. */
	desperdicios: readonly { producto_id: string; producto: string; desperdicio_pct: number; alto: boolean }[];
	/** El cliente que más debe, de `contaduria.resumen_direccion`. */
	clienteQueMasDebe: { cliente_id: string; nombre: string; parte_milesimas: number; vencido_centavos: number } | null;
	/** Los productos descontinuados con sus piezas en existencia. */
	descontinuados: readonly { producto_id: string; nombre: string; piezas: number }[];
	/** `compras.cuenta_material`, con el nombre de cada material. */
	materiales: readonly { material_id: string; nombre: string; estado: string; se_acaba: string | null }[];
	/** `admin.aparatos_sin_sincronizar`. */
	aparatos: readonly { dispositivo_id: string; nombre: string; ubicacion: string | null; sin_sincronizar: string }[];
	/** `inventario.ultimo_cuadre`. */
	cuadre: { cuadre_id: string; fecha: string; estado: string; por_revisar: number } | null;
}

/** Los parámetros de las alertas. */
export interface ParametrosDeLasAlertas {
	consumoTelaMax: number;
	/** En por ciento. */
	concentracionPct: number;
	concentracionVencidoDias: number;
	reposicionMax: number;
}

/** Una alerta de Dirección. */
export interface AlertaDeDireccion {
	/** La regla y su entidad: `lote_detenido:{lote}`. */
	clave: string;
	regla: string;
	/** El documento de la alerta, su tabla y su id: el aviso de una alerta no se junta con el de otra. */
	entidad: string;
	entidadId: string;
	titulo: string;
	/** El título sin montos, para quien no los ve y para el aviso; solo lo trae la alerta cuyo título lleva un monto. */
	tituloSinMontos?: string;
	color: "rojo" | "ambar";
	departamentos: string[];
	/** A dónde lleva «Ver», dentro de la web. */
	ver: string;
}

/**
 * Las alertas de este momento, en el orden de la tabla (regla 2).
 * @param datos Lo que dieron las lecturas.
 * @param parametros Los parámetros `direccion.`.
 */
export function alertasDeDireccion(datos: DatosDeLasAlertas, parametros: ParametrosDeLasAlertas): AlertaDeDireccion[] {
	const alertas: AlertaDeDireccion[] = [];
	// Los lotes atorados: por falta de avance o por una máquina parada.
	for (const lote of datos.lotesAtorados) {
		alertas.push({
			clave: `lote_detenido:${lote.lote_id}`,
			regla: "lote_detenido",
			entidad: "lotes",
			entidadId: lote.lote_id,
			titulo: `${lote.folio} detenido en ${lote.operacion}${lote.dias > 0 ? ` desde hace ${lote.dias} días` : ""}${lote.falla === null ? "" : ` · ${lote.falla}`}`,
			color: "rojo",
			departamentos: lote.falla === null ? ["produccion"] : ["produccion", "mantenimiento"],
			ver: `produccion/lotes?cajon=lote&id=${lote.lote_id}`,
		});
	}
	// El consumo de tela alto: las de más desperdicio, hasta el máximo.
	const altos = datos.desperdicios
		.filter((prenda) => prenda.alto)
		.sort((una, otra) => otra.desperdicio_pct - una.desperdicio_pct)
		.slice(0, parametros.consumoTelaMax);
	for (const prenda of altos) {
		alertas.push({
			clave: `consumo_tela:${prenda.producto_id}`,
			regla: "consumo_tela",
			entidad: "productos",
			entidadId: prenda.producto_id,
			titulo: `${prenda.producto}: consumo de tela ${Math.round(prenda.desperdicio_pct)}% sobre patrón`,
			color: "ambar",
			departamentos: ["patronaje", "compras"],
			ver: "patronaje/rendimiento",
		});
	}
	// La concentración del saldo por cobrar en un cliente.
	const mayor = datos.clienteQueMasDebe;
	if (mayor !== null && mayor.parte_milesimas > parametros.concentracionPct * 10) {
		const conVencido = mayor.vencido_centavos > 0;
		alertas.push({
			clave: `concentracion:${mayor.cliente_id}`,
			regla: "concentracion",
			entidad: "clientes",
			entidadId: mayor.cliente_id,
			titulo: `${mayor.nombre} concentra el ${Math.round(mayor.parte_milesimas / 10)}% del saldo por cobrar${conVencido ? `, con ${enPesos(mayor.vencido_centavos)} de más de ${parametros.concentracionVencidoDias} días` : ""}`,
			tituloSinMontos: `${mayor.nombre} concentra el ${Math.round(mayor.parte_milesimas / 10)}% del saldo por cobrar${conVencido ? `, con saldo de más de ${parametros.concentracionVencidoDias} días` : ""}`,
			color: conVencido ? "rojo" : "ambar",
			departamentos: ["contaduria", "ventas"],
			ver: "contaduria/cuentas-por-cobrar",
		});
	}
	// Los productos descontinuados que todavía tienen piezas.
	for (const producto of datos.descontinuados.filter((uno) => uno.piezas > 0)) {
		alertas.push({
			clave: `descontinuado:${producto.producto_id}`,
			regla: "descontinuado",
			entidad: "productos",
			entidadId: producto.producto_id,
			titulo: `${producto.nombre} descontinuado con ${producto.piezas} piezas en existencia`,
			color: "ambar",
			departamentos: ["catalogo", "bodega"],
			ver: "bodega/existencias",
		});
	}
	// Los materiales sin tiempo de reposición: los que se acaban primero, hasta el máximo.
	const sinTiempo = datos.materiales
		.filter((material) => material.estado === "sin_tiempo_de_entrega")
		.sort((uno, otro) => (uno.se_acaba ?? "9999").localeCompare(otro.se_acaba ?? "9999"))
		.slice(0, parametros.reposicionMax);
	for (const material of sinTiempo) {
		alertas.push({
			clave: `sin_reposicion:${material.material_id}`,
			regla: "sin_reposicion",
			entidad: "materiales",
			entidadId: material.material_id,
			titulo: `${material.nombre} sin tiempo de reposición`,
			color: "rojo",
			departamentos: ["compras", "produccion"],
			ver: "compras/por-pedir",
		});
	}
	// Las tablets y cajas sin sincronizar.
	for (const aparato of datos.aparatos) {
		alertas.push({
			clave: `sin_sincronizar:${aparato.dispositivo_id}`,
			regla: "sin_sincronizar",
			entidad: "dispositivos",
			entidadId: aparato.dispositivo_id,
			titulo: `${aparato.nombre} de ${aparato.ubicacion ?? "sin ubicación"} sin sincronizar desde hace ${aparato.sin_sincronizar}`,
			color: "rojo",
			departamentos: ["admin"],
			ver: "admin/dispositivos",
		});
	}
	// El último cuadre con residuo.
	if (datos.cuadre !== null && datos.cuadre.estado === "con_residuo") {
		alertas.push({
			clave: `cuadre_residuo:${datos.cuadre.fecha}`,
			regla: "cuadre_residuo",
			entidad: "cuadres",
			entidadId: datos.cuadre.cuadre_id,
			titulo: `El cuadre del ${textoDeDia(datos.cuadre.fecha)} dejó ${datos.cuadre.por_revisar} cosas por revisar`,
			color: "rojo",
			departamentos: ["bodega"],
			ver: "bodega/diferencias",
		});
	}
	return alertas;
}
