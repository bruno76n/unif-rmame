/**
 * El módulo `admin`: cuentas, sesiones, dispositivos, permisos, bitácora, parámetros, folios, archivos,
 * avisos, eventos, impresión, empresa y respaldos.
 * Fase 3 · docs/cimientos/MODULOS.md
 * Fase 4 · docs/fases/04-servicios-comunes.md
 *
 * Lo que tiene hoy: `comandos_recibidos` (que usa el corredor de acciones); la bandeja de `eventos` con
 * `admin.guardar_evento` y su depuración; las vueltas de los trabajos programados; los folios; los
 * parámetros, las listas y la empresa; la bitácora con sus alertas. Lo demás llega con las partes de la fase 4 y con la fase 5.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarALista } from "./acciones/agregar-a-lista.ts";
import { accionCambiarParametro } from "./acciones/cambiar-parametro.ts";
import { accionEditarEmpresa } from "./acciones/editar-empresa.ts";
import { accionMarcarAlertaRevisada } from "./acciones/marcar-alerta-revisada.ts";
import { semillaDeContadores } from "./dominio/contadores.ts";
import { escribirBitacora } from "./internas/escribir-bitacora.ts";
import { guardarEvento } from "./internas/guardar-evento.ts";
import { tomarFolio } from "./internas/tomar-folio.ts";
import { parametro } from "./lecturas/parametro.ts";
import { siguienteFolio } from "./lecturas/siguiente-folio.ts";
import { semillaDeParametrosDeAdmin } from "./parametros.ts";
import { lectoresDeAdmin } from "./permisos.ts";
import { depurarEventos } from "./trabajos/depurar-eventos.ts";

export default definirModulo({
	nombre: "admin",
	acciones: [accionCambiarParametro, accionAgregarALista, accionEditarEmpresa, accionMarcarAlertaRevisada],
	internas: { guardar_evento: guardarEvento, tomar_folio: tomarFolio, escribir_bitacora: escribirBitacora },
	lecturas: { parametro, siguiente_folio: siguienteFolio },
	semillas: [semillaDeContadores, semillaDeParametrosDeAdmin],
	trabajos: [depurarEventos],
	lectores: lectoresDeAdmin,
});
