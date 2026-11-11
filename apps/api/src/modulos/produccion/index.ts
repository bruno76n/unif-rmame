/**
 * El módulo `produccion`: las operaciones del taller, el flujo de cada prenda, las órdenes de producción y sus lotes.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md, ordenes-de-produccion.md y lotes.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionCerrarCorte, accionImprimirEtiquetasBulto } from "./acciones/corte.ts";
import { accionAgregarOperacionFlujo, accionCrearFlujo, accionQuitarOperacionFlujo } from "./acciones/flujos.ts";
import { accionCrearOrden } from "./acciones/ordenes.ts";
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
import { cortesDePrenda, lotesPorCortar, lotesSinTerminarDeVariante, piezasEnProduccion } from "./lecturas/lotes.ts";
import { semillaDeParametrosDeProduccion } from "./parametros.ts";
import { lectoresDeProduccion } from "./permisos.ts";
import { semillaDeCorte } from "./siembra.ts";
import { vigilarLotesAtorados } from "./trabajos/vigilar-lotes-atorados.ts";

export default definirModulo({
	nombre: "produccion",
	acciones: [
		accionCrearFlujo,
		accionAgregarOperacionFlujo,
		accionQuitarOperacionFlujo,
		accionCrearOrden,
		accionCerrarCorte,
		accionImprimirEtiquetasBulto,
		accionRegistrarOperacion,
		accionCancelarRegistro,
		accionTomarConsumibleTaller,
		accionRegistrarBloqueoPin,
	],
	internas: {
		mandar_a_produccion: mandarAProduccion,
		pasar_pedido_a_temporada: pasarPedidoATemporada,
		cambiar_fecha_entrega_pedido: cambiarFechaEntregaPedido,
		marcar_lote_revisado: marcarLoteRevisado,
		marcar_lote_en_aduana: marcarLoteEnAduana,
		poner_tarifa_a_registros: ponerTarifaARegistros,
		recalcular_proyecciones: recalcularProyecciones,
	},
	lecturas: {
		flujo_vigente: flujoVigente,
		piezas_en_produccion: piezasEnProduccion,
		lotes_por_cortar: lotesPorCortar,
		lotes_sin_terminar_de_variante: lotesSinTerminarDeVariante,
		cortes_de_prenda: cortesDePrenda,
		registros_para_nomina: registrosParaNomina,
	},
	trabajos: [vigilarLotesAtorados],
	semillas: [semillaDeCorte, semillaDeParametrosDeProduccion],
	lectores: lectoresDeProduccion,
	bajada: bajadaDeProduccion,
});
