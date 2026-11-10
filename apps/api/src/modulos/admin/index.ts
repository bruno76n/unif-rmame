/**
 * El módulo `admin`: cuentas, sesiones, dispositivos, permisos, bitácora, parámetros, folios, archivos,
 * avisos, eventos, impresión, empresa y respaldos.
 * Fase 3 · docs/cimientos/MODULOS.md
 * Fase 4 · docs/fases/04-servicios-comunes.md
 *
 * Lo que tiene hoy: `comandos_recibidos` (que usa el corredor de acciones); la bandeja de `eventos` con
 * `admin.guardar_evento` y su depuración; las vueltas de los trabajos programados; los folios; los
 * parámetros, las listas y la empresa; la bitácora con sus alertas; los avisos con su correo; los
 * archivos en R2; las impresoras y sus trabajos; los respaldos y sus pruebas de restauración. Las cuentas,
 * las sesiones y los permisos llegan con la fase 5.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarALista } from "./acciones/agregar-a-lista.ts";
import { accionCambiarParametro } from "./acciones/cambiar-parametro.ts";
import { accionConfirmarImpresion } from "./acciones/confirmar-impresion.ts";
import { accionEditarEmpresa } from "./acciones/editar-empresa.ts";
import { accionGuardarImpresora } from "./acciones/guardar-impresora.ts";
import { accionMarcarAlertaRevisada } from "./acciones/marcar-alerta-revisada.ts";
import { accionMarcarAvisoLeido } from "./acciones/marcar-aviso-leido.ts";
import { accionRegistrarRestauracion } from "./acciones/registrar-restauracion.ts";
import { accionTrabajosImpresion } from "./acciones/trabajos-impresion.ts";
import { alEventoDeAdmin } from "./al-evento.ts";
import { semillaDeContadores } from "./dominio/contadores.ts";
import { enVivoDeAdmin } from "./en-vivo.ts";
import { crearAviso } from "./internas/crear-aviso.ts";
import { escribirBitacora } from "./internas/escribir-bitacora.ts";
import { guardarArchivo } from "./internas/guardar-archivo.ts";
import { guardarEvento } from "./internas/guardar-evento.ts";
import { ligarArchivo } from "./internas/ligar-archivo.ts";
import { mandarAImprimir } from "./internas/mandar-a-imprimir.ts";
import { registrarRespaldo } from "./internas/registrar-respaldo.ts";
import { tomarFolio } from "./internas/tomar-folio.ts";
import { parametro } from "./lecturas/parametro.ts";
import { siguienteFolio } from "./lecturas/siguiente-folio.ts";
import { veDocumento } from "./lecturas/ve-documento.ts";
import { semillaDeParametrosDeAdmin } from "./parametros.ts";
import { lectoresDeAdmin } from "./permisos.ts";
import { rutasDeArchivos } from "./rutas/archivos.ts";
import { rutasDeEtiquetas } from "./rutas/etiquetas.ts";
import { depurarEventos } from "./trabajos/depurar-eventos.ts";
import { enviarCorreos } from "./trabajos/enviar-correos.ts";
import { recordatorioRestauracion } from "./trabajos/recordatorio-restauracion.ts";
import { respaldoSemanal } from "./trabajos/respaldo-semanal.ts";

export default definirModulo({
	nombre: "admin",
	acciones: [
		accionCambiarParametro,
		accionAgregarALista,
		accionEditarEmpresa,
		accionMarcarAlertaRevisada,
		accionMarcarAvisoLeido,
		accionGuardarImpresora,
		accionTrabajosImpresion,
		accionConfirmarImpresion,
		accionRegistrarRestauracion,
	],
	internas: {
		guardar_evento: guardarEvento,
		tomar_folio: tomarFolio,
		escribir_bitacora: escribirBitacora,
		crear_aviso: crearAviso,
		ligar_archivo: ligarArchivo,
		guardar_archivo: guardarArchivo,
		mandar_a_imprimir: mandarAImprimir,
		registrar_respaldo: registrarRespaldo,
	},
	lecturas: { parametro, siguiente_folio: siguienteFolio, ve_documento: veDocumento },
	semillas: [semillaDeContadores, semillaDeParametrosDeAdmin],
	trabajos: [depurarEventos, enviarCorreos, respaldoSemanal, recordatorioRestauracion],
	lectores: lectoresDeAdmin,
	alEvento: alEventoDeAdmin,
	rutas: [...rutasDeArchivos, ...rutasDeEtiquetas],
	enVivo: enVivoDeAdmin,
});
