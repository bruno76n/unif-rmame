/**
 * El armazón de la web: el menú lateral blanco de 244 px (la marca, los departamentos por grupo con su ícono, su nombre
 * y su pastilla, y la cuenta abajo) y la barra superior de 64 px (las migas, la búsqueda, la campana y la acción
 * principal). Hasta 980 px el menú se esconde y se abre con su botón.
 *
 * Es una aplicación, no una página: el armazón ocupa justo la pantalla y la página nunca se desplaza entera. El menú y
 * la barra se quedan quietos; lo que se desplaza es el panel de contenido (y, dentro de él, lo que tenga su propia
 * área, como una tabla larga o el cuerpo de un cajón).
 * Fase 19 · docs/interfaz/comunes.md («El armazón») y docs/interfaz/DISENO.md («Medidas», reglas 9 y 10)
 *
 * Uso: la web lo arma con lo que regresa `admin.armazon`; la búsqueda, la campana y el menú de la cuenta son suyos y
 * los pasa como piezas. El armazón no sabe qué departamentos tiene la cuenta: pinta los que recibe.
 */

import type { LucideIcon } from "lucide-react";
import { ChevronRight, Menu, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { unirClases } from "../clases.ts";

/** Un departamento del menú. */
export interface DepartamentoDelMenu {
	clave: string;
	nombre: string;
	icono: LucideIcon;
	/** Lo que tiene que hacer ya; sin pastilla si es nulo. */
	conteo: number | null;
	rojo: boolean;
	activo: boolean;
	alTocar: () => void;
}

/** Un grupo del menú; Dirección va sin nombre de grupo. */
export interface GrupoDelMenu {
	nombre: string | null;
	departamentos: readonly DepartamentoDelMenu[];
}

/** Lo que recibe el armazón. */
export interface PropsDeArmazon {
	grupos: readonly GrupoDelMenu[];
	/** Las migas: «{Grupo} › {Departamento}». */
	migas: readonly string[];
	/** La cuenta, abajo del menú: su avatar con iniciales, nombre y puesto; al tocarla abre su menú. */
	cuenta: ReactNode;
	busqueda?: ReactNode;
	campana?: ReactNode;
	accion?: ReactNode;
	/** La franja de arriba (sin conexión, versión vieja). */
	franja?: ReactNode;
	children?: ReactNode;
}

/**
 * Una entrada del menú.
 * @param props El departamento y qué hacer después de tocarlo (cerrar el menú en el teléfono).
 */
function EntradaDelMenu({ departamento, despues }: { departamento: DepartamentoDelMenu; despues: () => void }) {
	const { nombre, icono: Icono, conteo, rojo, activo, alTocar } = departamento;
	return (
		<button
			type="button"
			aria-current={activo ? "page" : undefined}
			onClick={() => {
				alTocar();
				despues();
			}}
			className={unirClases(
				"flex h-10 w-full items-center gap-2.5 rounded-mediano px-3 font-semibold",
				activo ? "bg-marca-fondo text-marca-texto" : "text-tinta2 hover:bg-suave hover:text-tinta",
			)}
		>
			<Icono aria-hidden="true" size={18} strokeWidth={1.9} />
			<span className="min-w-0 flex-1 truncate text-left">{nombre}</span>
			{conteo === null ? null : (
				<span
					title={rojo ? "Hay algo atrasado" : undefined}
					className={unirClases(
						"grid h-5.5 min-w-6 place-items-center rounded-full px-2 font-bold text-xs tabular-nums",
						rojo ? "bg-estado-rojo/15 text-estado-rojo" : "bg-riel text-tinta2",
					)}
				>
					{conteo}
				</span>
			)}
		</button>
	);
}

/**
 * El armazón de la web.
 * @param props Los grupos del menú, las migas, la cuenta, la búsqueda, la campana, la acción, la franja y la página.
 */
export function Armazon({ grupos, migas, cuenta, busqueda, campana, accion, franja, children }: PropsDeArmazon) {
	const [abierto, setAbierto] = useState(false);
	const cerrar = () => setAbierto(false);
	return (
		<div className="relative flex h-dvh flex-col overflow-hidden bg-fondo">
			{franja}
			<div className="grid min-h-0 flex-1 grid-cols-[var(--spacing-menu)_minmax(0,1fr)] grid-rows-1 max-menu:grid-cols-1">
				{abierto ? (
					<button
						type="button"
						aria-label="Cerrar el menú"
						onClick={cerrar}
						className="fixed inset-0 z-30 hidden bg-tinta/35 max-menu:block"
					/>
				) : null}
				<nav
					aria-label="Departamentos"
					className={unirClases(
						"z-30 flex h-full w-menu flex-col border-linea border-r bg-panel",
						"max-menu:fixed max-menu:top-0 max-menu:left-0 max-menu:h-dvh max-menu:transition-transform",
						abierto ? "max-menu:translate-x-0" : "max-menu:-translate-x-full",
					)}
				>
					<div className="flex items-center gap-3 px-4 pt-4 pb-2">
						<span className="grid size-9 place-items-center rounded-mediano bg-marca font-bold text-sm text-white">
							UA
						</span>
						<span className="flex flex-col leading-tight">
							<b className="font-bold">Uniformes Alameda</b>
							<span className="text-etiqueta text-tinta3">Sistema de fábrica</span>
						</span>
						<button
							type="button"
							aria-label="Cerrar el menú"
							onClick={cerrar}
							className="ml-auto hidden size-8 place-items-center rounded-mediano text-tinta2 max-menu:grid"
						>
							<X aria-hidden="true" size={18} />
						</button>
					</div>
					<div className="flex-1 overflow-y-auto px-2.5 pb-3">
						{grupos.map((grupo) => (
							<div key={grupo.nombre ?? "sin-grupo"} className="mt-3">
								{grupo.nombre === null ? null : (
									<div className="px-3 pb-1.5 font-bold text-tinta3 text-xs uppercase tracking-wide">
										{grupo.nombre}
									</div>
								)}
								<div className="flex flex-col gap-0.5">
									{grupo.departamentos.map((departamento) => (
										<EntradaDelMenu key={departamento.clave} departamento={departamento} despues={cerrar} />
									))}
								</div>
							</div>
						))}
					</div>
					<div className="border-linea border-t p-3">{cuenta}</div>
				</nav>
				<div className="flex min-h-0 min-w-0 flex-col">
					<header className="z-20 flex h-barra flex-none items-center gap-4 border-linea border-b bg-fondo/90 px-8 backdrop-blur max-telefono:gap-2 max-telefono:px-4">
						<button
							type="button"
							aria-label="Abrir el menú"
							onClick={() => setAbierto(true)}
							className="hidden size-9 flex-none place-items-center rounded-mediano text-tinta2 hover:bg-riel max-menu:grid"
						>
							<Menu aria-hidden="true" size={20} />
						</button>
						<nav
							aria-label="Migas"
							className="flex items-center gap-1 whitespace-nowrap font-medium text-tinta3 max-telefono:hidden"
						>
							{migas.map((miga, i) => (
								<span key={miga} className="inline-flex items-center gap-1">
									{i === 0 ? null : <ChevronRight aria-hidden="true" size={14} />}
									<span className={i === migas.length - 1 ? "font-bold text-tinta" : undefined}>{miga}</span>
								</span>
							))}
						</nav>
						<div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
							{busqueda}
							{campana}
							{accion}
						</div>
					</header>
					<main data-panel="contenido" className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
						{children}
					</main>
				</div>
			</div>
		</div>
	);
}
