import { describe, expect, it } from 'bun:test';
import { conTipo, guardiaDeFoco } from './window-mode';
import type { MenuEntry } from './types';

/**
 * Estos tests existen por un error que no se veía: en el modo normal el menú lo
 * dibuja este mismo JavaScript, que tolera una opción sin `type`, así que todo
 * funcionaba. En modo ventana el árbol cruza a Rust, donde es un enum etiquetado
 * por ese campo, y el menú no abría: la aplicación sólo recibía
 * «missing field `type`».
 */
describe('el tipo de cada renglón antes de cruzar a Rust', () => {
	it('una opción común sin tipo queda como `item`', () => {
		const [item] = conTipo([{ id: 'abrir', label: 'Abrir' }]);

		expect(item.type).toBe('item');
	});

	it('no toca lo que ya viene etiquetado', () => {
		const entradas: MenuEntry[] = [
			{ type: 'separator' },
			{ type: 'checkbox', id: 'ocultos', label: 'Ocultos', checked: true },
			{ type: 'label', label: 'Ordenar' },
		];

		expect(conTipo(entradas)).toEqual(entradas);
	});

	it('completa también los renglones de un submenú', () => {
		const [submenu] = conTipo([
			{
				type: 'submenu',
				label: 'Abrir con',
				items: [{ id: 'gimp', label: 'GIMP' }],
			},
		]);

		expect(submenu.type).toBe('submenu');
		expect(submenu.type === 'submenu' && submenu.items[0].type).toBe('item');
	});

	it('no modifica lo que le pasaron', () => {
		const original: MenuEntry[] = [{ id: 'abrir', label: 'Abrir' }];
		conTipo(original);

		expect('type' in original[0]).toBe(false);
	});

	it('una lista vacía no rompe', () => {
		expect(conTipo([])).toEqual([]);
	});
});

/**
 * El menú en modo ventana se cierra cuando la ventana pierde el foco, pero
 * entre que se crea y se muestra el compositor manda cambios de foco que no
 * significan que alguien se haya ido a otra cosa.
 */
describe('cuándo cerrar el menú por el foco', () => {
	it('se cierra al perder el foco después de haberlo tenido', () => {
		let cerrado = 0;
		const mirar = guardiaDeFoco(() => {
			cerrado += 1;
		});

		mirar(true);
		mirar(false);

		expect(cerrado).toBe(1);
	});

	it('no se cierra por un `sin foco` anterior a haberlo tenido', () => {
		let cerrado = 0;
		const mirar = guardiaDeFoco(() => {
			cerrado += 1;
		});

		// Lo que manda el compositor mientras la ventana se está mostrando.
		mirar(false);
		mirar(false);

		expect(cerrado).toBe(0);
	});

	it('recuperar el foco no lo cierra', () => {
		let cerrado = 0;
		const mirar = guardiaDeFoco(() => {
			cerrado += 1;
		});

		mirar(true);
		mirar(true);

		expect(cerrado).toBe(0);
	});
});
