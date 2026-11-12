/**
 * El aviso de abajo de toda la web: una sola pieza que cualquier pantalla usa con `useAvisar()`, con el texto que
 * regresa la acción, tal cual.
 * Fase 19 · docs/interfaz/comunes.md («El aviso de abajo») y docs/interfaz/TEXTOS.md («Los avisos de abajo»)
 */

import { Aviso } from "@uniformame/interfaz/estados/aviso";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

/** Cómo se avisa: el texto y si se hizo o no se pudo. */
type Avisar = (texto: string, como: "bien" | "no_se_pudo") => void;

/** El contexto del aviso. */
const ContextoDeAviso = createContext<Avisar>(() => undefined);

/**
 * La función para avisar abajo.
 * @returns `avisar(texto, como)`.
 */
export function useAvisar(): Avisar {
	return useContext(ContextoDeAviso);
}

/**
 * Pone el aviso de abajo para todo lo de adentro; un aviso nuevo reemplaza al que estaba.
 * @param props Lo de adentro.
 */
export function AvisosDeAbajo({ children }: { children: ReactNode }) {
	const [aviso, setAviso] = useState<{ texto: string; como: "bien" | "no_se_pudo"; vez: number } | null>(null);
	const avisar = useCallback<Avisar>((texto, como) => setAviso({ texto, como, vez: Date.now() }), []);
	const cerrar = useCallback(() => setAviso(null), []);
	return (
		<ContextoDeAviso value={avisar}>
			{children}
			{aviso === null ? null : <Aviso key={aviso.vez} texto={aviso.texto} como={aviso.como} alCerrar={cerrar} />}
		</ContextoDeAviso>
	);
}
