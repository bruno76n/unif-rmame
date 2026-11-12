/**
 * El módulo `produccion`: las operaciones del taller, el flujo de cada prenda, las órdenes de producción y sus lotes.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md, ordenes-de-produccion.md y lotes.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAplicarCambioPedido, crearCambioPedido } from "./acciones/cambios.ts";
import { accionCerrarCorte, accionImprimirEtiquetasBulto } from "./acciones/corte.ts";
import { accionAgregarOperacionFlujo, accionCrearFlujo, accionQuitarOperacionFlujo } from "./acciones/flujos.ts";
import { accionCrearOrden, accionLevantarOrdenSugerencia } from "./acciones/ordenes.ts";
import {
	accionCancelarRegistro,
	accionRegistrarBloqueoPin,
	accionRegistrarOperacion,
	accionTomarConsumibleTaller,
} from "./acciones/registros.ts";
import { bajadaDeProduccion } from "./bajada.ts";
import {
	cambiarFechaEntregaPedido,
	mandarAProduccion,
	marcarLoteEnAduana,
	marcarLoteRevisado,
	pasarPedidoATemporada,
} from "./internas/lotes.ts";
import { recalcularProyecciones } from "./internas/proyecciones.ts";
import { ponerTarifaARegistros, registrosParaNomina } from "./internas/registros.ts";
import { flujoVigente } from "./lecturas/flujos.ts";
import {
	cortesDePrenda,
	loteParaAduana,
	lotesPorCortar,
	lotesSinTerminarDeVariante,
	piezasEnProduccion,
} from "./lecturas/lotes.ts";
import { lotesAtorados } from "./lecturas/lotes-atorados.ts";
import { personaQueLaHizo } from "./lecturas/persona-que-la-hizo.ts";
import { semillaDeParametrosDeProduccion } from "./parametros.ts";
import { lectoresDeProduccion } from "./permisos.ts";
import { semillaDeCorte } from "./siembra.ts";
import { vigilarLotesAtorados } from "./trabajos/vigilar-lotes-atorados.ts";

export default definirModulo({
	nombre: "produccion",
	acciones: [
		accionAplicarCambioPedido,
		accionCrearFlujo,
		accionAgregarOperacionFlujo,
		accionQuitarOperacionFlujo,
		accionCrearOrden,
		accionLevantarOrdenSugerencia,
		accionCerrarCorte,
		accionImprimirEtiquetasBulto,
		accionRegistrarOperacion,
		accionCancelarRegistro,
		accionTomarConsumibleTaller,
		accionRegistrarBloqueoPin,
	],
	internas: {
		crear_cambio_pedido: crearCambioPedido,
		mandar_a_produccion: mandarAProduccion,
		pasar_pedido_a_temporada: pasarPedidoATemporada,
		cambiar_fecha_entrega_pedido: cambiarFechaEntregaPedido,
		marcar_lote_revisado: marcarLoteRevisado,
		marcar_lote_en_aduana: marcarLoteEnAduana,
		poner_tarifa_a_registros: ponerTarifaARegistros,
		recalcular_proyecciones: recalcularProyecciones,
	},
	lecturas: {
		lotes_atorados: lotesAtorados,
		flujo_vigente: flujoVigente,
		piezas_en_produccion: piezasEnProduccion,
		lotes_por_cortar: lotesPorCortar,
		lotes_sin_terminar_de_variante: lotesSinTerminarDeVariante,
		cortes_de_prenda: cortesDePrenda,
		lote_para_aduana: loteParaAduana,
		registros_para_nomina: registrosParaNomina,
		persona_que_la_hizo: personaQueLaHizo,
	},
	trabajos: [vigilarLotesAtorados],
	semillas: [semillaDeCorte, semillaDeParametrosDeProduccion],
	lectores: lectoresDeProduccion,
	bajada: bajadaDeProduccion,
});
