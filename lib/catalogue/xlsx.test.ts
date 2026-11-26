import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { colIndex, decodeXml, readXlsx } from './xlsx';

function book(sheet: string, shared: string[]) {
  const sst = `<?xml version="1.0"?><sst xmlns="x">${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`;
  return zipSync({ 'xl/sharedStrings.xml': strToU8(sst), 'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`) });
}

describe('readXlsx', () => {
  it('reads shared, inline and numeric cells into objects keyed by header, filling gaps', () => {
    const bytes = book(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2"><v>46296</v></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Inline &amp; rich</t></is></c><c r="B3" t="s"><v>4</v></c></row>',
      ['title', 'provider', 'start', 'Music &amp; Movement', '幼儿园'],
    );
    expect(readXlsx(bytes)).toEqual([
      { title: 'Music & Movement', provider: '', start: '46296' },
      { title: 'Inline & rich', provider: '幼儿园', start: '' },
    ]);
  });
});

describe('helpers', () => {
  it('maps column letters to indexes', () => {
    expect([colIndex('A1'), colIndex('Z9'), colIndex('AA2')]).toEqual([0, 25, 26]);
  });
  it('decodes entities and drops Excel carriage-return escapes', () => {
    expect(decodeXml('a &lt; b &#x4E2D; &#65;_x000D_')).toBe('a < b 中 A');
  });
});
