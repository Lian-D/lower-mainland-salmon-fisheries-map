import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export interface Cell {
  text: string;
  links: { text: string; href: string }[];
  header: boolean;
}

export const clean = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Turn an HTML table into a rectangular grid, expanding rowspan/colspan so every row has every column. */
export function tableToGrid($: CheerioAPI, table: AnyNode, baseUrl: string): Cell[][] {
  const grid: Cell[][] = [];
  const pending: (Cell & { left: number })[] = []; // per column, cells still spanning down
  $(table)
    .find('tr')
    .each((_, tr) => {
      // ignore rows of nested tables
      if ($(tr).closest('table')[0] !== table) return;
      const row: Cell[] = [];
      const cells = $(tr).children('th,td').toArray() as Element[];
      let col = 0;
      const fillPending = () => {
        while (pending[col] && pending[col].left > 0) {
          const p = pending[col];
          row[col] = { text: p.text, links: p.links, header: p.header };
          p.left -= 1;
          col += 1;
        }
      };
      for (const c of cells) {
        fillPending();
        const $c = $(c);
        const cell: Cell = {
          text: clean($c.text()),
          links: $c
            .find('a[href]')
            .toArray()
            .map((a) => ({ text: clean($(a).text()), href: new URL($(a).attr('href') || '', baseUrl).toString() })),
          header: c.tagName === 'th',
        };
        const rs = Math.max(1, Number($c.attr('rowspan')) || 1);
        const cs = Math.max(1, Number($c.attr('colspan')) || 1);
        for (let k = 0; k < cs; k++) {
          row[col] = cell;
          if (rs > 1) pending[col] = { ...cell, left: rs - 1 };
          col += 1;
        }
      }
      fillPending();
      grid.push(row.map((c) => c ?? { text: '', links: [], header: false }));
    });
  return grid;
}
