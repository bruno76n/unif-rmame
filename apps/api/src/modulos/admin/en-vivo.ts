/**
 * Lo que `admin` manda en vivo al llegar sus eventos, además de `cambios`.
 * Fase 4 · docs/modulos/admin/impresion.md (reglas 3 y 5) y docs/cimientos/EVENTOS-Y-TRABAJOS.md
 *
 * `impresion.pedida` le avisa al puente de la impresora (`impresion`), que pide sus trabajos;
 * `impresion.terminada` le avisa a la sesión que pidió imprimir (`impresion_terminada`).
 * Fase 5 · docs/modulos/admin/cuentas.md y docs/modulos/admin/permisos.md («Eventos»)
 *
 * `cuenta.acceso_quitado` les manda `sesion_cerrada` a las pantallas de esa cuenta, y `sesion.cerrada` a las
 * de las sesiones que se cerraron (salir, cerrar las propias, cerrar las de otra cuenta); un cambio de
 * departamentos o de permisos finos, `permisos_cambiados`, para que su menú cambie al momento.
 * Fase 6 · docs/modulos/admin/dispositivos.md («Eventos»): `dispositivo.revocado` le manda
 * `dispositivo_revocado` al aparato; `dispositivo.registrado`, `dispositivo_registrado` a la dueña que
 * generó el código, para que su ventana se cierre sola.
 */

import { z } from "zod";
import type { EnVivo } from "../../nucleo/modulos.ts";

/** Los datos de `impresion.pedida`. */
const pedida = z.object({ trabajo_id: z.uuid(), dispositivo_id: z.uuid() });

/** Los datos de `impresion.terminada`. */
const terminada = z.object({
	trabajo_id: z.uuid(),
	sesion_id: z.uuid().nullable(),
	resultado: z.enum(["impreso", "fallo"]),
	texto: z.string(),
});

/** Los datos de los eventos de una cuenta. */
const deUnaCuenta = z.object({ usuario_id: z.uuid() });

/** Los datos de `sesion.cerrada`: las sesiones, separadas por coma, y el motivo. */
const sesionesCerradas = z.object({ sesion_ids: z.string(), motivo: z.string() });

/** Los datos de los eventos de un aparato. */
const deUnAparato = z.object({ dispositivo_id: z.uuid() });

/** Los datos de `dispositivo.registrado`. */
const registrado = z.object({
	dispositivo_id: z.uuid(),
	codigo_registro_id: z.uuid(),
	usuario_id: z.uuid().nullable(),
});

/** A las sesiones de una cuenta: `permisos_cambiados`. */
const permisosCambiados: EnVivo = (evento) => [
	{ para: { usuarioId: deUnaCuenta.parse(evento.datos).usuario_id }, nombre: "permisos_cambiados", datos: {} },
];

/** Por tipo de evento, lo que manda en vivo `admin`. */
export const enVivoDeAdmin: Record<string, EnVivo> = {
	"impresion.pedida": (evento) => {
		const datos = pedida.parse(evento.datos);
		return [
			{ para: { dispositivoId: datos.dispositivo_id }, nombre: "impresion", datos: { trabajo_id: datos.trabajo_id } },
		];
	},
	"impresion.terminada": (evento) => {
		const datos = terminada.parse(evento.datos);
		if (datos.sesion_id === null) return [];
		const { sesion_id, ...aviso } = datos;
		return [{ para: { sesionId: sesion_id }, nombre: "impresion_terminada", datos: aviso }];
	},
	"cuenta.acceso_quitado": (evento) => [
		{
			para: { usuarioId: deUnaCuenta.parse(evento.datos).usuario_id },
			nombre: "sesion_cerrada",
			datos: { motivo: "acceso_quitado" },
		},
	],
	"sesion.cerrada": (evento) => {
		const datos = sesionesCerradas.parse(evento.datos);
		return datos.sesion_ids
			.split(",")
			.map((sesionId) => ({ para: { sesionId }, nombre: "sesion_cerrada", datos: { motivo: datos.motivo } }));
	},
	"dispositivo.revocado": (evento) => [
		{
			para: { dispositivoId: deUnAparato.parse(evento.datos).dispositivo_id },
			nombre: "dispositivo_revocado",
			datos: {},
		},
	],
	"dispositivo.registrado": (evento) => {
		const datos = registrado.parse(evento.datos);
		if (datos.usuario_id === null) return [];
		return [
			{
				para: { usuarioId: datos.usuario_id },
				nombre: "dispositivo_registrado",
				datos: { dispositivo_id: datos.dispositivo_id, codigo_registro_id: datos.codigo_registro_id },
			},
		];
	},
	"cuenta.departamentos_cambiados": permisosCambiados,
	"cuenta.permisos_cambiados": permisosCambiados,
};
