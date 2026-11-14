/**
 * `admin.respaldos`: la pestaña Respaldos.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Respaldos») y docs/modulos/admin/respaldos.md
 *
 * La recuperación a un punto en el tiempo es del proveedor y el sistema todavía no lee su estado: va sin dato. La
 * última prueba es la última que cuadró (regla 8: una que no cuadró se guarda, pero no cuenta).
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { respaldosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-respaldos";
import { desc, eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { archivos, respaldos, restauracionesProbadas } from "../tablas.ts";
import { diaDe, diaYHora } from "./comun.ts";

/** Cuántos respaldos correctos se ofrecen para escoger cuál se restauró. */
const respaldosParaEscoger = 10;

/**
 * El tamaño de un respaldo para leer: «1.8 GB», «640 MB».
 * @param bytes Su tamaño.
 */
export function tamanoParaLeer(bytes: number): string {
	const megas = bytes / 1024 ** 2;
	return megas >= 1024 ? `${(megas / 1024).toFixed(1)} GB` : `${Math.round(megas)} MB`;
}

/**
 * Los días que pasaron desde un momento hasta hoy, por día de negocio.
 * @param momento El momento.
 * @param hoy El día de negocio.
 */
export function diasDesde(momento: string, hoy: Temporal.PlainDate): number {
	return Temporal.PlainDate.from(diaDe(momento)).until(hoy, { largestUnit: "days" }).days;
}

export const consultaRespaldos = implementarConsulta(respaldosDeAdmin, async (contexto) => {
	const { base, quien, diaDeNegocio } = contexto;
	const cadaDias = await parametroNumero(contexto, "admin.restauracion_cada_dias");
	const avisoDias = await parametroNumero(contexto, "admin.restauracion_aviso_dias");
	const [ultimo] = await base.select().from(respaldos).orderBy(desc(respaldos.hechoEn)).limit(1);
	const pruebas = await base
		.select({
			id: restauracionesProbadas.id,
			probadaEn: restauracionesProbadas.probadaEn,
			tipo: restauracionesProbadas.tipo,
			respaldoEn: respaldos.hechoEn,
			puntoEn: restauracionesProbadas.puntoRestauradoEn,
			cuadro: restauracionesProbadas.conteosCuadraron,
			archivoId: restauracionesProbadas.evidenciaArchivoId,
			archivo: archivos.nombreOriginal,
		})
		.from(restauracionesProbadas)
		.innerJoin(archivos, eq(archivos.id, restauracionesProbadas.evidenciaArchivoId))
		.leftJoin(respaldos, eq(respaldos.id, restauracionesProbadas.respaldoId))
		.orderBy(desc(restauracionesProbadas.probadaEn));
	const buena = pruebas.find((prueba) => prueba.cuadro);
	const correctos = await base
		.select({ id: respaldos.id, hechoEn: respaldos.hechoEn, tamano: respaldos.tamanoBytes })
		.from(respaldos)
		.where(eq(respaldos.estado, "correcto"))
		.orderBy(desc(respaldos.hechoEn))
		.limit(respaldosParaEscoger);
	// La última prueba buena: hace cuántos días, en ámbar desde el aviso, y cuándo toca la siguiente.
	const ultimaPrueba =
		buena === undefined
			? null
			: (() => {
					const dias = diasDesde(buena.probadaEn, diaDeNegocio);
					const toca = Temporal.PlainDate.from(diaDe(buena.probadaEn)).add({ days: cadaDias });
					return {
						texto: `${textoDeDiaCorto(diaDe(buena.probadaEn))} · hace ${plural(dias, "día", "días")}`,
						tono: dias >= avisoDias ? ("ambar" as const) : ("normal" as const),
						siguiente: `Se prueba cada ${cadaDias} días en el ambiente de pruebas · la siguiente toca a más tardar el ${textoDeDiaCorto(toca)}`,
					};
				})();
	return {
		resultado: {
			// `admin.registrar_restauracion` es solo de la dueña.
			puede_registrar_restauracion: esLaDuena(quien),
			recuperacion_dias: null,
			semanal:
				ultimo === undefined
					? null
					: {
							texto: diaYHora(ultimo.hechoEn),
							correcto: ultimo.estado === "correcto",
							tamano: ultimo.tamanoBytes === null ? null : tamanoParaLeer(ultimo.tamanoBytes),
						},
			ultima_prueba: ultimaPrueba,
			cada_dias: cadaDias,
			pruebas: pruebas.map((prueba) => ({
				restauracion_id: prueba.id,
				fecha: diaYHora(prueba.probadaEn),
				que:
					prueba.tipo === "semanal_externo" && prueba.respaldoEn !== null
						? `Respaldo semanal del ${textoDeDiaCorto(diaDe(prueba.respaldoEn))}`
						: `Punto en el tiempo: ${prueba.puntoEn === null ? "—" : diaYHora(prueba.puntoEn)}`,
				cuadro: prueba.cuadro,
				evidencia_archivo_id: prueba.archivoId,
				evidencia: prueba.archivo,
			})),
			respaldos_correctos: correctos.map((respaldo) => ({
				respaldo_id: respaldo.id,
				texto: `${diaYHora(respaldo.hechoEn)}${respaldo.tamano === null ? "" : ` · ${tamanoParaLeer(respaldo.tamano)}`}`,
			})),
		},
	};
});
