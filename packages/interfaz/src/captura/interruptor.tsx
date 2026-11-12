/**
 * El interruptor: prender o apagar algo (un parámetro de sí o no, «Tienda en línea»), con su etiqueta a la derecha.
 * Fase 19 · docs/interfaz/DISENO.md («Interruptor»)
 *
 * Uso: `<Interruptor etiqueta="Se vende en línea" prendido={valor} alCambiar={setValor} />`. Es el Switch de Base UI:
 * se usa con teclado (espacio) y el lector de pantalla dice si está prendido.
 */

import { Switch } from "@base-ui/react/switch";

/** Lo que recibe un interruptor. */
export interface PropsDeInterruptor {
	etiqueta: string;
	prendido: boolean;
	alCambiar: (prendido: boolean) => void;
	deshabilitado?: boolean;
}

/**
 * Un interruptor con su etiqueta.
 * @param props La etiqueta, si está prendido, qué hacer al cambiar y si está apagado.
 */
export function Interruptor({ etiqueta, prendido, alCambiar, deshabilitado = false }: PropsDeInterruptor) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: el Root de Base UI lleva su control dentro de la etiqueta
		<label className="inline-flex cursor-pointer items-center gap-3 font-semibold text-tinta2 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-40">
			<Switch.Root
				checked={prendido}
				onCheckedChange={(valor) => alCambiar(valor)}
				disabled={deshabilitado}
				className="relative inline-flex h-6 w-10.5 flex-none items-center rounded-full bg-linea2 p-0.5 transition-colors data-[checked]:bg-tinta"
			>
				<Switch.Thumb className="size-5 rounded-full bg-panel shadow-panel transition-transform data-[checked]:translate-x-4.5" />
			</Switch.Root>
			<span>{etiqueta}</span>
		</label>
	);
}
