/**
 * El módulo `admin`: cuentas, sesiones, dispositivos, permisos, bitácora, parámetros, folios, archivos,
 * avisos, eventos, impresión, empresa y respaldos.
 * Fase 3 · docs/cimientos/MODULOS.md
 * Fase 4 · docs/fases/04-servicios-comunes.md
 *
 * Lo que tiene hoy: `comandos_recibidos` (que usa el corredor de acciones); la bandeja de `eventos` con
 * `admin.guardar_evento` y su depuración; las vueltas de los trabajos programados; los folios; los
 * parámetros, las listas y la empresa; la bitácora con sus alertas; los avisos con su correo; los
 * archivos en R2; las impresoras y sus trabajos; los respaldos y sus pruebas de restauración; las cuentas,
 * las sesiones y los permisos (fase 5), con lo que las liga a Personal y a Dirección (fase 7).
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarALista } from "./acciones/agregar-a-lista.ts";
import { accionAplicarComandoRetenido } from "./acciones/aplicar-comando-retenido.ts";
import { accionCambiarDepartamentos } from "./acciones/cambiar-departamentos.ts";
import { accionCambiarMinimo } from "./acciones/cambiar-minimo.ts";
import { accionCambiarParametro } from "./acciones/cambiar-parametro.ts";
import { accionCambiarPermisoFino } from "./acciones/cambiar-permiso-fino.ts";
import { accionCancelarCodigoRegistro } from "./acciones/cancelar-codigo-registro.ts";
import { accionCerrarMiSesion } from "./acciones/cerrar-mi-sesion.ts";
import { accionCerrarSesiones } from "./acciones/cerrar-sesiones.ts";
import { accionConfirmarImpresion } from "./acciones/confirmar-impresion.ts";
import { accionCrearCuenta } from "./acciones/crear-cuenta.ts";
import { accionDescartarComandoApartado } from "./acciones/descartar-comando-apartado.ts";
import { accionEditarEmpresa } from "./acciones/editar-empresa.ts";
import { accionGenerarCodigoRegistro } from "./acciones/generar-codigo-registro.ts";
import { accionGuardarImpresora } from "./acciones/guardar-impresora.ts";
import { accionMarcarAlertaRevisada } from "./acciones/marcar-alerta-revisada.ts";
import { accionMarcarAvisoLeido } from "./acciones/marcar-aviso-leido.ts";
import { accionPedirCuenta } from "./acciones/pedir-cuenta.ts";
import { accionQuitarAcceso } from "./acciones/quitar-acceso.ts";
import { accionRegistrarRestauracion } from "./acciones/registrar-restauracion.ts";
import { accionReintentarComandoApartado } from "./acciones/reintentar-comando-apartado.ts";
import { accionRevocarDispositivo } from "./acciones/revocar-dispositivo.ts";
import { accionRotarLlave } from "./acciones/rotar-llave.ts";
import { accionSalir } from "./acciones/salir.ts";
import { accionTrabajosImpresion } from "./acciones/trabajos-impresion.ts";
import { alEventoDeAdmin } from "./al-evento.ts";
import { bajadaDeAdmin } from "./bajada.ts";
import { semillaDeContadores } from "./dominio/contadores.ts";
import { semillaDeDepartamentos } from "./dominio/departamentos.ts";
import { enVivoDeAdmin } from "./en-vivo.ts";
import { aplicarDecisionAltaUsuario } from "./internas/aplicar-decision-alta-usuario.ts";
import { cerrarCuentaDePersona } from "./internas/cerrar-cuenta-de-persona.ts";
import { crearAviso } from "./internas/crear-aviso.ts";
import { escribirBitacora } from "./internas/escribir-bitacora.ts";
import { guardarArchivo } from "./internas/guardar-archivo.ts";
import { guardarEvento } from "./internas/guardar-evento.ts";
import { ligarArchivo } from "./internas/ligar-archivo.ts";
import { mandarAImprimir } from "./internas/mandar-a-imprimir.ts";
import { registrarRespaldo } from "./internas/registrar-respaldo.ts";
import { tomarFolio } from "./internas/tomar-folio.ts";
import { aparatosSinSincronizar as lecturaAparatosSinSincronizar } from "./lecturas/aparatos-sin-sincronizar.ts";
import { correoDeCuenta } from "./lecturas/correo-de-cuenta.ts";
import { cuentasPorRegla } from "./lecturas/cuentas-por-regla.ts";
import { datosDeAparato } from "./lecturas/datos-de-aparato.ts";
import { datosDeArchivo } from "./lecturas/datos-de-archivo.ts";
import { parametro } from "./lecturas/parametro.ts";
import { permisosDe } from "./lecturas/permisos-de.ts";
import { siguienteFolio } from "./lecturas/siguiente-folio.ts";
import { ultimaSincronizacion } from "./lecturas/ultima-sincronizacion.ts";
import { veDocumento } from "./lecturas/ve-documento.ts";
import { semillaDeParametrosDeAdmin } from "./parametros.ts";
import { lectoresDeAdmin } from "./permisos.ts";
import { rutasDeArchivos } from "./rutas/archivos.ts";
import { rutasDeEtiquetas } from "./rutas/etiquetas.ts";
import { aparatosSinSincronizar } from "./trabajos/aparatos-sin-sincronizar.ts";
import { depurarEventos } from "./trabajos/depurar-eventos.ts";
import { enviarCorreos } from "./trabajos/enviar-correos.ts";
import { recordatorioRestauracion } from "./trabajos/recordatorio-restauracion.ts";
import { respaldoSemanal } from "./trabajos/respaldo-semanal.ts";

export default definirModulo({
	nombre: "admin",
	acciones: [
		accionCambiarParametro,
		accionCambiarMinimo,
		accionAgregarALista,
		accionEditarEmpresa,
		accionMarcarAlertaRevisada,
		accionMarcarAvisoLeido,
		accionGuardarImpresora,
		accionTrabajosImpresion,
		accionConfirmarImpresion,
		accionRegistrarRestauracion,
		accionCrearCuenta,
		accionPedirCuenta,
		accionQuitarAcceso,
		accionCambiarDepartamentos,
		accionCambiarPermisoFino,
		accionSalir,
		accionCerrarMiSesion,
		accionCerrarSesiones,
		accionGenerarCodigoRegistro,
		accionCancelarCodigoRegistro,
		accionRevocarDispositivo,
		accionReintentarComandoApartado,
		accionAplicarComandoRetenido,
		accionDescartarComandoApartado,
		accionRotarLlave,
	],
	bajada: bajadaDeAdmin,
	internas: {
		guardar_evento: guardarEvento,
		tomar_folio: tomarFolio,
		escribir_bitacora: escribirBitacora,
		crear_aviso: crearAviso,
		ligar_archivo: ligarArchivo,
		guardar_archivo: guardarArchivo,
		mandar_a_imprimir: mandarAImprimir,
		registrar_respaldo: registrarRespaldo,
		aplicar_decision_alta_usuario: aplicarDecisionAltaUsuario,
		cerrar_cuenta_de_persona: cerrarCuentaDePersona,
	},
	efectosDeAutorizacion: { alta_usuario: "aplicar_decision_alta_usuario" },
	lecturas: {
		aparatos_sin_sincronizar: lecturaAparatosSinSincronizar,
		ultima_sincronizacion: ultimaSincronizacion,
		parametro,
		siguiente_folio: siguienteFolio,
		ve_documento: veDocumento,
		permisos_de: permisosDe,
		cuentas_por_regla: cuentasPorRegla,
		correo_de_cuenta: correoDeCuenta,
		datos_de_aparato: datosDeAparato,
		datos_de_archivo: datosDeArchivo,
	},
	semillas: [semillaDeDepartamentos, semillaDeContadores, semillaDeParametrosDeAdmin],
	trabajos: [depurarEventos, enviarCorreos, respaldoSemanal, recordatorioRestauracion, aparatosSinSincronizar],
	lectores: lectoresDeAdmin,
	alEvento: alEventoDeAdmin,
	rutas: [...rutasDeArchivos, ...rutasDeEtiquetas],
	enVivo: enVivoDeAdmin,
});
