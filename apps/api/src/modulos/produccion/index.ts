/**
 * El módulo `produccion`: las operaciones del taller, el flujo de cada prenda, las órdenes de producción y sus lotes.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md, ordenes-de-produccion.md y lotes.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarOperacionFlujo, accionCrearFlujo, accionQuitarOperacionFlujo } from "./acciones/flujos.ts";
import { accionCrearOrden } from "./acciones/ordenes.ts";
import { bajadaDeProduccion } from "./bajada.ts";
import {
	cambiarFechaEntregaPedido,
	mandarAProduccion,
	marcarLoteEnAduana,
	marcarLoteRevisado,
	pasarPedidoATemporada,
} from "./internas/lotes.ts";
import { flujoVigente } from "./lecturas/flujos.ts";
import { lotesPorCortar, lotesSinTerminarDeVariante, piezasEnProduccion } from "./lecturas/lotes.ts";
import { semillaDeParametrosDeProduccion } from "./parametros.ts";
import { lectoresDeProduccion } from "./permisos.ts";
import { semillaDeCorte } from "./siembra.ts";

export default definirModulo({
	nombre: "produccion",
	acciones: [accionCrearFlujo, accionAgregarOperacionFlujo, accionQuitarOperacionFlujo, accionCrearOrden],
	internas: {
		mandar_a_produccion: mandarAProduccion,
		pasar_pedido_a_temporada: pasarPedidoATemporada,
		cambiar_fecha_entrega_pedido: cambiarFechaEntregaPedido,
		marcar_lote_revisado: marcarLoteRevisado,
		marcar_lote_en_aduana: marcarLoteEnAduana,
	},
	lecturas: {
		flujo_vigente: flujoVigente,
		piezas_en_produccion: piezasEnProduccion,
		lotes_por_cortar: lotesPorCortar,
		lotes_sin_terminar_de_variante: lotesSinTerminarDeVariante,
	},
	semillas: [semillaDeCorte, semillaDeParametrosDeProduccion],
	lectores: lectoresDeProduccion,
	bajada: bajadaDeProduccion,
});
