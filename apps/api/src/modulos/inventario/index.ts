/**
 * El módulo `inventario`: las ubicaciones, el libro de movimientos y las existencias.
 * Fase 4 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `ubicaciones`»)
 * Fase 9 · docs/modulos/inventario/libro-de-movimientos.md y existencias-y-cuadre.md
 * Fase 11 · docs/modulos/inventario/material-en-bodega.md y recepciones-en-aduana.md
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md, conteos.md, recepcion-del-taller.md y
 * minimos-y-reabasto.md
 * Fase 19 · docs/interfaz/fabrica/direccion.md (la consulta `inventario.ultimo_cuadre`) y
 * docs/interfaz/fabrica/tienda-en-linea.md (la consulta y la lectura `inventario.disponibilidad_linea`)
 * Fase 19 · docs/interfaz/fabrica/aduana.md (las consultas de las pantallas de Aduana)
 *
 * Las ubicaciones nacen en la fase 4 porque las usan antes los parámetros, las impresoras, las cuentas,
 * los aparatos y las personas; sus responsables nacen vacíos. El libro no tiene acciones propias: lo escribe
 * `escribirMovimiento` (`dominio/`), que usan las internas y las acciones de cada caso.
 */

import { v7 as uuidv7 } from "uuid";
import { todosLosDepartamentos } from "../../nucleo/acceso/departamentos.ts";
import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAclararDiferencia } from "./acciones/aclarar-diferencia.ts";
import { accionRegistrarCargaInicial, accionRegistrarCargaInicialMaterial } from "./acciones/carga-inicial.ts";
import {
	accionDespachar,
	accionEntregarATiendaSinCaja,
	accionMarcarEtiquetasImpresas,
	accionRecibirDespacho,
	accionRecordarDespacho,
} from "./acciones/despachos.ts";
import { accionDevolverAProveedor } from "./acciones/devolver-a-proveedor.ts";
import { accionEntregarAlCorte, accionRecibirDelCorte } from "./acciones/entregas-corte.ts";
import { accionGuardarConteo } from "./acciones/guardar-conteo.ts";
import { accionNoLaEncuentro } from "./acciones/no-la-encuentro.ts";
import { accionMoverATienda, accionSugerirFabricar } from "./acciones/reabasto.ts";
import { accionRecibirDeProveedor } from "./acciones/recibir-de-proveedor.ts";
import { accionRecibirDelTaller, accionRecibirReproceso } from "./acciones/recibir-del-taller.ts";
import { accionRecibirEnAduana } from "./acciones/recibir-en-aduana.ts";
import { accionResolverExcepcion } from "./acciones/resolver-excepcion.ts";
import { accionSurtirAAduana } from "./acciones/surtir-a-aduana.ts";
import { consultaDespachoDeAduana } from "./consultas/aduana-despacho.ts";
import { consultaHistorialDeAduana } from "./consultas/aduana-historial.ts";
import { consultaRecepcionDeAduana } from "./consultas/aduana-recepcion.ts";
import { consultaAnden } from "./consultas/anden.ts";
import { consultaPendientesDeBodega } from "./consultas/bodega-pendientes.ts";
import { consultaConteosYAjustes } from "./consultas/conteos-y-ajustes.ts";
import { consultaDetalleDeConteo } from "./consultas/detalle-conteo.ts";
import { consultaDetalleDespachar } from "./consultas/detalle-despachar.ts";
import { consultaDetalleDeEntregaCorte } from "./consultas/detalle-entrega-corte.ts";
import { consultaDetalleDeLlegadaAduana } from "./consultas/detalle-llegada-aduana.ts";
import { consultaDetalleRecibirEnCamino } from "./consultas/detalle-recibir-en-camino.ts";
import { consultaDetalleRecibirMaterial } from "./consultas/detalle-recibir-material.ts";
import { consultaDetalleRecibirTaller } from "./consultas/detalle-recibir-taller.ts";
import { consultaDetalleDeVariante } from "./consultas/detalle-variante.ts";
import { consultaDiferencias } from "./consultas/diferencias.ts";
import { consultaDisponibilidadLinea, lecturaDisponibilidadLinea } from "./consultas/disponibilidad-linea.ts";
import { consultaDondeEsta } from "./consultas/donde-esta.ts";
import { consultaEnCaminoAduana } from "./consultas/en-camino-aduana.ts";
import { consultaEnTransito } from "./consultas/en-transito.ts";
import { consultaExcepciones } from "./consultas/excepciones.ts";
import { consultaExistencias } from "./consultas/existencias.ts";
import { consultaInventarioEnAduana } from "./consultas/inventario-en-aduana.ts";
import { consultaMateriales } from "./consultas/materiales.ts";
import { consultaMinimosVigentes } from "./consultas/minimos-vigentes.ts";
import { consultaPastillasMenu, pastillaAduana, pastillaBodega } from "./consultas/pastillas-menu.ts";
import { consultaReabasto } from "./consultas/reabasto.ts";
import { consultaUltimoCuadre } from "./consultas/ultimo-cuadre.ts";
import { tipoRollo, tipoTraspaso } from "./impresion.ts";
import { aplicarDecisionAjuste } from "./internas/aplicar-decision-ajuste.ts";
import { aplicarRevisionDevolucion, esperarDevolucion } from "./internas/devoluciones.ts";
import { registrarEntradaDelTaller } from "./internas/entrada-del-taller.ts";
import { devolverEntregaCorte, lotesConTelaEntregada } from "./internas/entregas-corte.ts";
import { entregarAClienteExterno, pasarABodega } from "./internas/entregas-de-clientes.ts";
import { marcarExcepcionResuelta, registrarExcepcion, tomarVersionExcepcion } from "./internas/excepciones.ts";
import { actualizarCostoRollos, aplicarDecisionRecepcionDeMas, tomarConsumible } from "./internas/material.ts";
import { registrarMermaProduccion, revertirMermaProduccion } from "./internas/merma-produccion.ts";
import { decidirSugerencia, guardarMinimo } from "./internas/reabasto.ts";
import { registrarCorte } from "./internas/registrar-corte.ts";
import {
	apartarParaNota,
	confirmarPagoReserva,
	devolverDeNota,
	liberarReservas,
	reservar,
} from "./internas/reservas.ts";
import { recalcularRollosSugeridos } from "./internas/rollos-sugeridos.ts";
import { existenciaMaterial, piezasDeVariante } from "./lecturas/existencias.ts";
import { existenciasDeMateriales, salidasDeMateriales } from "./lecturas/materiales.ts";
import { existenciaDeVariantes, ultimoCuadre } from "./lecturas/para-direccion.ts";
import { minimosVigentes, sugerenciasDeFabricar } from "./lecturas/reabasto.ts";
import { recibidoDeOrdenes } from "./lecturas/recibido-de-ordenes.ts";
import { libres, listoEnAduana } from "./lecturas/reservas.ts";
import { rollosParaCorte } from "./lecturas/rollos-para-corte.ts";
import { semillaDeParametrosDeInventario } from "./parametros.ts";
import { semillaDeMinimos, semillaDeMotivosAjuste } from "./siembra.ts";
import { ubicaciones } from "./tablas.ts";
import { cuadreNocturno } from "./trabajos/cuadre-nocturno.ts";
import { rollosSugeridos } from "./trabajos/rollos-sugeridos.ts";
import { vencerReservas } from "./trabajos/vencer-reservas.ts";

/** Los departamentos que leen el libro y el material. */
const lectoresDelLibro = ["aduana", "bodega", "direccion"];

/** Las ubicaciones de la siembra, en su orden. */
const ubicacionesDeLaSiembra = [
	{ orden: 1, codigo: "ADU", nombre: "Aduana", tipo: "aduana", prefijoFolio: null, surteEnLinea: false },
	{ orden: 2, codigo: "BOD", nombre: "Bodega", tipo: "bodega", prefijoFolio: null, surteEnLinea: true },
	{ orden: 3, codigo: "T1", nombre: "Tienda 1", tipo: "tienda", prefijoFolio: "T1", surteEnLinea: true },
	{ orden: 4, codigo: "T2", nombre: "Tienda 2", tipo: "tienda", prefijoFolio: "T2", surteEnLinea: true },
	{ orden: 5, codigo: "TAL", nombre: "Taller", tipo: "taller", prefijoFolio: null, surteEnLinea: false },
	{ orden: 6, codigo: "TRA", nombre: "Tránsito", tipo: "transito", prefijoFolio: null, surteEnLinea: false },
	{
		orden: 7,
		codigo: "ECA",
		nombre: "En camino a aduana",
		tipo: "en_camino_aduana",
		prefijoFolio: null,
		surteEnLinea: false,
	},
];

export default definirModulo({
	nombre: "inventario",
	consultas: [
		consultaPastillasMenu,
		consultaDondeEsta,
		consultaUltimoCuadre,
		consultaPendientesDeBodega,
		consultaExistencias,
		consultaReabasto,
		consultaDetalleDeVariante,
		consultaDiferencias,
		consultaConteosYAjustes,
		consultaExcepciones,
		consultaMateriales,
		consultaDetalleDeEntregaCorte,
		consultaDetalleDeLlegadaAduana,
		consultaDetalleDeConteo,
		consultaDisponibilidadLinea,
		consultaMinimosVigentes,
		consultaAnden,
		consultaRecepcionDeAduana,
		consultaEnCaminoAduana,
		consultaDespachoDeAduana,
		consultaInventarioEnAduana,
		consultaEnTransito,
		consultaHistorialDeAduana,
		consultaDetalleRecibirTaller,
		consultaDetalleRecibirMaterial,
		consultaDetalleRecibirEnCamino,
		consultaDetalleDespachar,
	],
	pastillas: { aduana: pastillaAduana, bodega: pastillaBodega },
	// Las ubicaciones salen en las pantallas de todos los departamentos.
	tiposDeEtiqueta: [tipoRollo, tipoTraspaso],
	lectores: {
		ubicaciones: todosLosDepartamentos,
		// El libro lo leen las consultas de Aduana, Bodega y Dirección; las existencias, además, Catálogo (la ficha)
		// y Tienda en línea (la disponibilidad). Nunca con precios ni costos: no los tienen.
		movimientos: lectoresDelLibro,
		movimiento_lineas: lectoresDelLibro,
		existencias: [...lectoresDelLibro, "catalogo", "linea"],
		existencias_material: lectoresDelLibro,
		// Los traspasos los leen las pantallas de Aduana, Bodega y Tienda en línea, y «¿Dónde está?».
		traspasos: [...lectoresDelLibro, "linea"],
		traspaso_lineas: [...lectoresDelLibro, "linea"],
		// Las reservas las leen Bodega y Aduana; Ventas y Tienda en línea, las de sus documentos.
		reservas: [...lectoresDelLibro, "ventas", "linea"],
		// La bandeja: Bodega; Producción ve las del taller y Contaduría las de dinero; Dirección cuenta las abiertas.
		excepciones: ["bodega", "produccion", "contaduria", "direccion"],
		cuadres: lectoresDelLibro,
		// Los rollos, las partidas y las recepciones, sin el costo, que solo viaja en las consultas de Compras y Contaduría.
		rollos: [...lectoresDelLibro, "compras"],
		partidas_tela: [...lectoresDelLibro, "compras"],
		recepciones: [...lectoresDelLibro, "compras"],
		recepcion_lineas: [...lectoresDelLibro, "compras"],
		despachos: lectoresDelLibro,
		// Las DF-, los AJ- y los conteos los ven Bodega, Aduana y Dirección, sin precios ni costos.
		diferencias: lectoresDelLibro,
		ajustes: lectoresDelLibro,
		ajuste_lineas: lectoresDelLibro,
		conteos: lectoresDelLibro,
		conteo_lineas: lectoresDelLibro,
		// Los mínimos los leen Bodega, Dirección y Administración; las sugerencias, Bodega y Producción.
		minimos: ["bodega", "direccion", "admin"],
		sugerencias_reabasto: ["bodega", "produccion"],
	},
	acciones: [
		accionEntregarAlCorte,
		accionRecibirDelCorte,
		accionResolverExcepcion,
		accionRecibirDeProveedor,
		accionDespachar,
		accionRecordarDespacho,
		accionMarcarEtiquetasImpresas,
		accionRecibirDespacho,
		accionEntregarATiendaSinCaja,
		accionSurtirAAduana,
		accionRecibirEnAduana,
		accionDevolverAProveedor,
		accionAclararDiferencia,
		accionGuardarConteo,
		accionRecibirDelTaller,
		accionRecibirReproceso,
		accionRegistrarCargaInicial,
		accionRegistrarCargaInicialMaterial,
		accionMoverATienda,
		accionSugerirFabricar,
		accionNoLaEncuentro,
	],
	internas: {
		recalcular_rollos_sugeridos: recalcularRollosSugeridos,
		devolver_entrega_corte: devolverEntregaCorte,
		registrar_corte: registrarCorte,
		registrar_merma_produccion: registrarMermaProduccion,
		revertir_merma_produccion: revertirMermaProduccion,
		registrar_excepcion: registrarExcepcion,
		marcar_excepcion_resuelta: marcarExcepcionResuelta,
		tomar_version_excepcion: tomarVersionExcepcion,
		reservar,
		liberar_reservas: liberarReservas,
		confirmar_pago_reserva: confirmarPagoReserva,
		apartar_para_nota: apartarParaNota,
		devolver_de_nota: devolverDeNota,
		aplicar_decision_recepcion_de_mas: aplicarDecisionRecepcionDeMas,
		actualizar_costo_rollos: actualizarCostoRollos,
		tomar_consumible: tomarConsumible,
		aplicar_decision_ajuste: aplicarDecisionAjuste,
		registrar_entrada_del_taller: registrarEntradaDelTaller,
		guardar_minimo: guardarMinimo,
		decidir_sugerencia: decidirSugerencia,
		entregar_a_cliente_externo: entregarAClienteExterno,
		pasar_a_bodega: pasarABodega,
		esperar_devolucion: esperarDevolucion,
		aplicar_revision_devolucion: aplicarRevisionDevolucion,
	},
	efectosDeAutorizacion: {
		recepcion_de_mas: "aplicar_decision_recepcion_de_mas",
		ajuste_inventario: "aplicar_decision_ajuste",
	},
	lecturas: {
		existencia_de_variantes: existenciaDeVariantes,
		ultimo_cuadre: ultimoCuadre,
		lotes_con_tela_entregada: lotesConTelaEntregada,
		rollos_para_corte: rollosParaCorte,
		existencia_material: existenciaMaterial,
		existencias_de_materiales: existenciasDeMateriales,
		salidas_de_materiales: salidasDeMateriales,
		piezas_de_variante: piezasDeVariante,
		libres,
		listo_en_aduana: listoEnAduana,
		recibido_de_ordenes: recibidoDeOrdenes,
		sugerencias_de_fabricar: sugerenciasDeFabricar,
		minimos_vigentes: minimosVigentes,
		disponibilidad_linea: lecturaDisponibilidadLinea,
	},
	trabajos: [cuadreNocturno, rollosSugeridos, vencerReservas],
	semillas: [
		{ tabla: ubicaciones, filas: ubicacionesDeLaSiembra.map((ubicacion) => ({ id: uuidv7(), ...ubicacion })) },
		semillaDeParametrosDeInventario,
		semillaDeMotivosAjuste,
		semillaDeMinimos,
	],
});
