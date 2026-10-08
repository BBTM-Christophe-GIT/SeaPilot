import { disciplinaryBodyToHtml } from './disciplinaryRichText';

export function xmlText(value: string): string {
  // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these control characters.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

interface TextStyle { bold: boolean; italic: boolean; underline: boolean; font: string; size: number; href: string; align: string; quote: boolean }
interface ListStyle { id: number; depth: number }

/** Native Word paragraphs/runs, numbering and links remain editable in Office. */
export function disciplinaryWordBody(value: string) {
  const template = document.createElement('template');
  template.innerHTML = disciplinaryBodyToHtml(value);
  const relationships: string[] = [], numbering: string[] = [], paragraphs: string[] = [];
  const base: TextStyle = { bold: false, italic: false, underline: false, font: 'Aptos', size: 22, href: '', align: 'left', quote: false };
  let listId = 900;

  function inherited(element: HTMLElement, parent: TextStyle): TextStyle {
    const tag = element.tagName;
    const font = element.style.fontFamily.replace(/["']/g, '').trim();
    return {
      bold: parent.bold || ['B', 'STRONG', 'H2', 'H3'].includes(tag),
      italic: parent.italic || ['I', 'EM'].includes(tag), underline: parent.underline || tag === 'U',
      font: ['Aptos', 'Arial', 'Times New Roman', 'Segoe UI'].includes(font) ? font : parent.font,
      size: tag === 'H2' ? 28 : tag === 'H3' ? 24 : parent.size,
      href: tag === 'A' ? element.getAttribute('href') || '' : parent.href,
      align: element.style.textAlign || parent.align, quote: parent.quote || tag === 'BLOCKQUOTE',
    };
  }

  function run(text: string, style: TextStyle): string {
    const properties = `<w:rFonts w:ascii="${xmlText(style.font)}" w:hAnsi="${xmlText(style.font)}"/><w:sz w:val="${style.size}"/>${style.bold ? '<w:b/>' : ''}${style.italic ? '<w:i/>' : ''}${style.underline || style.href ? '<w:u w:val="single"/>' : ''}${style.href ? '<w:color w:val="0C5598"/>' : ''}`;
    const content = `<w:r><w:rPr>${properties}</w:rPr>${text.split('\n').map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlText(line)}</w:t>`).join('')}</w:r>`;
    if (!style.href) return content;
    const id = `rIdDisciplinaryLink${relationships.length + 1}`;
    relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlText(style.href)}" TargetMode="External"/>`);
    return `<w:hyperlink r:id="${id}">${content}</w:hyperlink>`;
  }

  function paragraph(runs: string, style: TextStyle, list?: ListStyle) {
    const indent = list ? `<w:ind w:left="${(list.depth + 1) * 360}" w:hanging="240"/>` : style.quote ? '<w:ind w:left="360"/>' : '';
    const number = list ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${list.id}"/></w:numPr>` : '';
    paragraphs.push(`<w:p><w:pPr>${style.size > 22 ? '<w:keepNext/>' : ''}${number}<w:jc w:val="${xmlText(style.align)}"/>${indent}<w:spacing w:after="160" w:line="260" w:lineRule="auto"/></w:pPr>${runs}</w:p>`);
  }

  function walk(nodes: Node[], parent: TextStyle, list?: ListStyle, depth = 0) {
    let runs = '', pendingList = list;
    const flush = (style = parent, force = false) => {
      if (runs || force) { paragraph(runs, style, pendingList); pendingList = undefined; runs = ''; }
    };
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) { if (node.textContent) runs += run(node.textContent, parent); continue; }
      if (!(node instanceof HTMLElement)) continue;
      const style = inherited(node, parent), tag = node.tagName;
      if (tag === 'BR') { runs += run('\n', style); continue; }
      if (tag === 'UL' || tag === 'OL') {
        flush();
        const id = listId++, ordered = tag === 'OL';
        numbering.push(`<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${ordered ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${ordered ? '%1.' : '•'}"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum>`);
        numbering.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`);
        for (const item of Array.from(node.children)) if (item instanceof HTMLElement && item.tagName === 'LI') walk(Array.from(item.childNodes), inherited(item, style), { id, depth }, depth + 1);
      } else if (['P', 'DIV', 'H2', 'H3', 'BLOCKQUOTE', 'LI'].includes(tag)) {
        flush();
        walk(Array.from(node.childNodes), style, pendingList, depth);
        pendingList = undefined;
      } else {
        // Inline elements may contain block elements after browser paste or editing.
        const nestedBlocks = node.querySelector('p,div,h2,h3,blockquote,ul,ol,li');
        if (nestedBlocks) { flush(); walk(Array.from(node.childNodes), style, pendingList, depth); pendingList = undefined; }
        else {
          const inline = (child: Node, current: TextStyle): string => child.nodeType === Node.TEXT_NODE ? run(child.textContent || '', current)
            : child instanceof HTMLElement ? child.tagName === 'BR' ? run('\n', current) : Array.from(child.childNodes).map((descendant) => inline(descendant, inherited(child, current))).join('') : '';
          runs += Array.from(node.childNodes).map((child) => inline(child, style)).join('');
        }
      }
    }
    flush(parent, nodes.length === 0 || Boolean(pendingList));
  }
  walk(Array.from(template.content.childNodes), base);
  // Word requires all abstract definitions before the concrete list instances.
  numbering.sort((a, b) => Number(a.startsWith('<w:num ')) - Number(b.startsWith('<w:num ')));
  return { xml: paragraphs.join(''), relationships: relationships.join(''), numbering: numbering.join('') };
}
