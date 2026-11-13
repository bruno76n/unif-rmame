/**
 * El buscador de una pestaña: un campo que manda lo escrito cuando se deja de escribir (300 ms), para no pedir una
 * consulta por cada tecla. Lo escrito vive en la dirección; el campo lo sigue si la dirección cambia.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento»: buscar)
 *
 * Uso: `<Buscador etiqueta="Buscar pedido" ayuda="Folio o cliente" valor={buscar} alBuscar={(texto) => ir({ buscar: texto })} />`.
 */

import { useEffect, useState } from "react";
import { Campo } from "./campo.tsx";

/** Cuánto espera el buscador después de la última tecla. */
const espera = 300;

/** Lo que recibe el buscador. */
export interface PropsDeBuscador {
	/** Su etiqueta, para el lector de pantalla. */
	etiqueta: string;
	/** El texto de ayuda dentro del campo. */
	ayuda: string;
	/** Lo que dice la dirección. */
	valor: string;
	alBuscar: (texto: string) => void;
}

/**
 * El buscador.
 * @param props Su etiqueta, su ayuda, el valor de la dirección y qué hacer al buscar.
 */
export function Buscador({ etiqueta, ayuda, valor, alBuscar }: PropsDeBuscador) {
	const [texto, setTexto] = useState(valor);
	useEffect(() => setTexto(valor), [valor]);
	useEffect(() => {
		if (texto === valor) return;
		const reloj = setTimeout(() => alBuscar(texto.trim()), espera);
		return () => clearTimeout(reloj);
	}, [texto, valor, alBuscar]);
	return (
		<Campo
			etiqueta={etiqueta}
			type="search"
			placeholder={ayuda}
			value={texto}
			onChange={(evento) => setTexto(evento.target.value)}
		/>
	);
}
