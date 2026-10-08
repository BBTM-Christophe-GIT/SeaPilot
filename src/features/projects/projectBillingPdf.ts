interface BillingPdfContent {
  documentTitle: string;
  projectLabel: string;
  monthLabel: string;
  periodLabel: string;
  clientReference: string;
  vesselName: string | null;
  includeOperationAmounts: boolean;
  operationRows: string[][];
  expenseRows: string[][] | null;
  serviceRows: string[][] | null;
  rawRows: string[][];
  totals: { label: string; amounts: string[]; final?: boolean }[];
}

interface Column {
  label: string;
  ratio: number;
  align?: 'left' | 'right';
}

export async function renderBillingPdf(content: BillingPdfContent): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ compress: true, orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const width = pageWidth - margin * 2;
  const blue = [16, 87, 152] as const;
  const ink = [26, 37, 55] as const;
  const white = [255, 255, 255] as const;
  const columnGap = 16;
  const halfWidth = (width - columnGap) / 2;
  const rightX = margin + halfWidth + columnGap;
  const hasRightColumn = content.expenseRows !== null || content.serviceRows !== null;
  const font = (size: number, bold = false, color: readonly [number, number, number] = ink) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  const fill = (color: readonly [number, number, number]) => pdf.setFillColor(...color);
  const wrap = (value: string, cellWidth: number, size: number, bold = false): string[] => {
    font(size, bold);
    return pdf.splitTextToSize(value || ' ', cellWidth) as string[];
  };
  const drawLines = (
    lines: string[], x: number, top: number, size: number,
    align: 'left' | 'right' = 'left',
  ) => lines.forEach((line, index) => {
    pdf.text(line, x, top + size + index * size * 1.2, { align });
  });
  const operationColumns: Column[] = [
    { label: 'Date', ratio: 0.15 },
    { label: 'Opération', ratio: content.includeOperationAmounts ? 0.26 : 0.36 },
    ...(content.includeOperationAmounts ? [{ label: 'Montant HT', ratio: 0.20, align: 'right' as const }] : []),
    { label: 'Commentaires', ratio: content.includeOperationAmounts ? 0.39 : 0.49 },
  ];
  const expenseColumns: Column[] = [
    { label: 'Date facture', ratio: 0.28 },
    { label: 'N° facture', ratio: 0.43 },
    { label: 'Montant HT', ratio: 0.29, align: 'right' },
  ];
  const expenseGroups = new Map<string, Map<string, string[][]>>();
  content.expenseRows?.forEach(([supplier, specialty, ...invoice]) => {
    const specialtyLabel = specialty ?? '';
    const supplierLabel = supplier ?? '';
    let suppliers = expenseGroups.get(specialtyLabel);
    if (!suppliers) {
      suppliers = new Map();
      expenseGroups.set(specialtyLabel, suppliers);
    }
    const invoices = suppliers.get(supplierLabel);
    if (invoices) invoices.push(invoice);
    else suppliers.set(supplierLabel, [invoice]);
  });
  // Map keys retain the exact source labels. Locale comparison only orders the
  // nodes; equivalent spellings keep their first occurrence and remain distinct.
  const compareLabels = ([left]: [string, unknown], [right]: [string, unknown]) =>
    left.localeCompare(right, 'fr-FR', { numeric: true, sensitivity: 'base' });
  const orderedExpenseGroups = [...expenseGroups.entries()].sort(compareLabels)
    .map(([specialty, suppliers]) => ({ specialty, suppliers: [...suppliers.entries()].sort(compareLabels) }));
  const serviceColumns: Column[] = [
    { label: 'Catégorie', ratio: 0.40 },
    { label: 'Prix unitaire HT', ratio: 0.24, align: 'right' },
    { label: "Nombre d'unités", ratio: 0.14, align: 'right' },
    { label: 'Montant total HT', ratio: 0.22, align: 'right' },
  ];
  const rawColumns: Column[] = [
    { label: 'Date', ratio: 0.075 },
    { label: 'Navire', ratio: 0.13 },
    { label: 'Désignation', ratio: 0.445 },
    { label: 'Prix unitaire HT', ratio: 0.125, align: 'right' },
    { label: 'Quantité', ratio: 0.075, align: 'right' },
    { label: 'Prix Total HT', ratio: 0.15, align: 'right' },
  ];
  const measureTable = (title: string, rows: string[][], columns: Column[], tableWidth: number, scale: number) => {
    const padding = 3.5 * scale;
    const bodySize = 9 * scale;
    const headerSize = 8.3 * scale;
    const titleSize = 11.5 * scale;
    const titleHeight = title ? titleSize * 1.2 + 5 * scale : 0;
    const widths = columns.map((column) => column.ratio * tableWidth);
    const headers = columns.map((column, index) => wrap(column.label, widths[index] - padding * 2, headerSize, true));
    const headerHeight = Math.max(...headers.map((lines) => lines.length)) * headerSize * 1.2 + padding * 2;
    const measuredRows = rows.map((row) => {
      const cells = columns.map((_, index) => wrap(row[index] || '', widths[index] - padding * 2, bodySize));
      return { cells, height: Math.max(...cells.map((lines) => lines.length)) * bodySize * 1.2 + padding * 2 };
    });
    return {
      title, columns, widths, headers, measuredRows, padding, bodySize, headerSize, titleSize,
      titleHeight, headerHeight,
      height: titleHeight + headerHeight + measuredRows.reduce((sum, row) => sum + row.height, 0),
      width: tableWidth,
    };
  };
  const measureExpenses = (scale: number) => {
    const padding = 3.5 * scale;
    const titleSize = 11.5 * scale;
    const titleHeight = titleSize * 1.2 + 5 * scale;
    const specialtySize = 10 * scale;
    const supplierSize = 9 * scale;
    const supplierIndent = 12 * scale;
    const invoiceIndent = 24 * scale;
    const groupGap = 5 * scale;
    const groups = orderedExpenseGroups.map(({ specialty, suppliers }) => {
      const lines = wrap(specialty, halfWidth - padding * 2, specialtySize, true);
      const headingHeight = lines.length * specialtySize * 1.2 + padding * 2;
      const measuredSuppliers = suppliers.map(([supplier, invoices]) => {
        const supplierLines = wrap(supplier, halfWidth - supplierIndent - padding * 2, supplierSize, true);
        const supplierHeight = supplierLines.length * supplierSize * 1.2 + padding * 2;
        const table = measureTable('', invoices, expenseColumns, halfWidth - invoiceIndent, scale);
        return { lines: supplierLines, headingHeight: supplierHeight, table, height: supplierHeight + table.height };
      });
      return { lines, headingHeight, suppliers: measuredSuppliers,
        height: headingHeight + measuredSuppliers.reduce((sum, supplier) => sum + supplier.height, 0) };
    });
    // Preserve the empty expense section and its invoice column headings.
    const emptyTable = groups.length ? null : measureTable('', [], expenseColumns, halfWidth - invoiceIndent, scale);
    return {
      titleSize, titleHeight, padding, specialtySize, supplierSize, supplierIndent, invoiceIndent,
      groupGap, groups, emptyTable,
      height: titleHeight + groups.reduce((sum, group) => sum + group.height, 0)
        + Math.max(0, groups.length - 1) * groupGap + (emptyTable?.height || 0),
    };
  };
  const measure = (scale: number) => {
    const gap = 12 * scale;
    const projectSize = 12 * scale;
    const metaSize = 9.5 * scale;
    const monthSize = 11 * scale;
    const leftMetaWidth = width * 0.60 - columnGap;
    const rightMetaWidth = width * 0.40;
    const project = wrap(content.projectLabel, leftMetaWidth, projectSize, true);
    const period = wrap(content.periodLabel, leftMetaWidth, metaSize);
    const month = wrap(content.monthLabel, rightMetaWidth, monthSize, true);
    const reference = wrap('Référence client : ' + content.clientReference, rightMetaWidth, metaSize);
    const vessel = content.vesselName === null ? [] : wrap('Navire : ' + content.vesselName, rightMetaWidth, metaSize);
    const metadataTop = 68 + gap;
    const leftHeight = project.length * projectSize * 1.2 + 4 * scale + period.length * metaSize * 1.2;
    const rightHeight = month.length * monthSize * 1.2 + 4 * scale
      + (reference.length + vessel.length) * metaSize * 1.2 + (vessel.length ? 4 * scale : 0);
    const tablesTop = metadataTop + Math.max(leftHeight, rightHeight) + gap;
    const operations = measureTable("Loyers d'Affrètement", content.operationRows, operationColumns, hasRightColumn ? halfWidth : width, scale);
    const expenses = content.expenseRows === null ? null
      : measureExpenses(scale);
    const services = content.serviceRows === null ? null
      : measureTable('Prestations BBTM', content.serviceRows, serviceColumns, halfWidth, scale);
    const servicesTop = tablesTop + (expenses ? expenses.height + gap : 0);
    const columnBottom = Math.max(
      tablesTop + operations.height,
      services ? servicesTop + services.height : tablesTop + (expenses?.height || 0),
    );
    const raw = content.rawRows.length ? measureTable('Détail des Opérations', content.rawRows, rawColumns, width, scale) : null;
    const rawTop = columnBottom + gap;
    const totalsTop = (raw ? rawTop + raw.height : columnBottom) + gap;
    const finalWidth = content.totals.length === 1 ? width : width * 0.28;
    const subtotalWidth = content.totals.length === 1 ? width : (width - finalWidth) / (content.totals.length - 1);
    const totalPadding = 8 * scale;
    const totals = content.totals.map((total) => {
      const blockWidth = total.final ? finalWidth : subtotalWidth;
      const labelSize = 8.8 * scale;
      const amountSize = (total.final ? 11.5 : 10) * scale;
      const labels = wrap(total.label, blockWidth - totalPadding * 2, labelSize, true);
      const amounts = total.amounts.map((amount) => wrap(amount, blockWidth - totalPadding * 2, amountSize, true));
      return {
        ...total, labels, amounts, labelSize, amountSize, width: blockWidth,
        height: totalPadding * 2 + labels.length * labelSize * 1.2 + 3 * scale
          + amounts.reduce((sum, lines) => sum + lines.length * amountSize * 1.2, 0),
      };
    });
    const totalsHeight = Math.max(...totals.map((total) => total.height));
    return {
      scale, gap, projectSize, metaSize, monthSize, project, period, month, reference, vessel,
      metadataTop, operations, expenses, services, tablesTop, servicesTop, raw, rawTop,
      totals, totalsTop, totalsHeight, totalPadding, bottom: totalsTop + totalsHeight,
    };
  };
  // Measure every wrapped cell before drawing. Dense exports reduce spacing and
  // typography together instead of dropping rows, truncating names or adding pages.
  let layout = measure(1);
  if (layout.bottom > pageHeight - margin) {
    let lower = 0;
    let upper = 1;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate = measure((lower + upper) / 2);
      if (candidate.bottom <= pageHeight - margin) {
        lower = candidate.scale;
        layout = candidate;
      } else {
        upper = candidate.scale;
      }
    }
  }
  pdf.setFillColor(...blue);
  pdf.rect(margin, margin, width, 44, 'F');
  let objectUrl: string | null = null;
  try {
    const response = await fetch('/bbtm-logo.png');
    if (!response.ok) throw new Error('Logo unavailable');
    objectUrl = URL.createObjectURL(await response.blob());
    const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl!;
    });
    const canvas = document.createElement('canvas');
    canvas.width = logo.naturalWidth;
    canvas.height = logo.naturalHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(logo, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = 255 - pixels.data[index];
        pixels.data[index + 1] = 255 - pixels.data[index + 1];
        pixels.data[index + 2] = 255 - pixels.data[index + 2];
      }
      context.putImageData(pixels, 0, 0);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin + 8, margin + 6, 32, 32);
    }
  } catch {
    // The financial content remains available if the logo cannot be decoded.
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
  font(23, true, white);
  pdf.text('Éléments de facturation', margin + 51, margin + 30);
  font(layout.projectSize, true);
  drawLines(layout.project, margin, layout.metadataTop, layout.projectSize);
  font(layout.metaSize);
  drawLines(layout.period, margin, layout.metadataTop + layout.project.length * layout.projectSize * 1.2 + 4 * layout.scale, layout.metaSize);
  font(layout.monthSize, true, blue);
  drawLines(layout.month, pageWidth - margin, layout.metadataTop, layout.monthSize, 'right');
  const referenceTop = layout.metadataTop + layout.month.length * layout.monthSize * 1.2 + 4 * layout.scale;
  font(layout.metaSize);
  drawLines(layout.reference, pageWidth - margin, referenceTop, layout.metaSize, 'right');
  drawLines(layout.vessel, pageWidth - margin, referenceTop + layout.reference.length * layout.metaSize * 1.2 + 4 * layout.scale, layout.metaSize, 'right');
  const drawTable = (table: ReturnType<typeof measureTable>, x: number, top: number) => {
    if (table.title) {
      font(table.titleSize, true, blue);
      drawLines([table.title], x, top, table.titleSize);
    }
    let y = top + table.titleHeight;
    pdf.setFillColor(...blue);
    pdf.rect(x, y, table.width, table.headerHeight, 'F');
    let cellX = x;
    font(table.headerSize, true, white);
    table.columns.forEach((column, index) => {
      const align = column.align || 'left';
      drawLines(table.headers[index], align === 'right' ? cellX + table.widths[index] - table.padding : cellX + table.padding, y + table.padding, table.headerSize, align);
      cellX += table.widths[index];
    });
    y += table.headerHeight;
    table.measuredRows.forEach((row, rowIndex) => {
      fill(rowIndex % 2 ? [242, 246, 250] : white);
      pdf.rect(x, y, table.width, row.height, 'F');
      font(table.bodySize);
      cellX = x;
      row.cells.forEach((lines, index) => {
        const align = table.columns[index].align || 'left';
        drawLines(lines, align === 'right' ? cellX + table.widths[index] - table.padding : cellX + table.padding, y + table.padding, table.bodySize, align);
        cellX += table.widths[index];
      });
      y += row.height;
    });
    pdf.setDrawColor(205, 216, 231);
    pdf.setLineWidth(0.4 * layout.scale);
    const gridTop = top + table.titleHeight;
    pdf.rect(x, gridTop, table.width, y - gridTop);
    cellX = x;
    table.widths.slice(0, -1).forEach((cellWidth) => {
      cellX += cellWidth;
      pdf.line(cellX, gridTop, cellX, y);
    });
    let rowY = gridTop + table.headerHeight;
    pdf.line(x, rowY, x + table.width, rowY);
    table.measuredRows.forEach((row) => {
      rowY += row.height;
      pdf.line(x, rowY, x + table.width, rowY);
    });
  };
  const drawExpenses = (tree: ReturnType<typeof measureExpenses>, x: number, top: number) => {
    font(tree.titleSize, true, blue);
    drawLines(['Frais imputables'], x, top, tree.titleSize);
    let y = top + tree.titleHeight;
    tree.groups.forEach((group, groupIndex) => {
      if (groupIndex) y += tree.groupGap;
      fill([234, 243, 253]);
      pdf.rect(x, y, halfWidth, group.headingHeight, 'F');
      font(tree.specialtySize, true, blue);
      drawLines(group.lines, x + tree.padding, y + tree.padding, tree.specialtySize);
      y += group.headingHeight;
      group.suppliers.forEach((supplier) => {
        font(tree.supplierSize, true);
        drawLines(supplier.lines, x + tree.supplierIndent + tree.padding, y + tree.padding, tree.supplierSize);
        y += supplier.headingHeight;
        drawTable(supplier.table, x + tree.invoiceIndent, y);
        y += supplier.table.height;
      });
    });
    if (tree.emptyTable) drawTable(tree.emptyTable, x + tree.invoiceIndent, y);
  };
  drawTable(layout.operations, margin, layout.tablesTop);
  if (layout.expenses) drawExpenses(layout.expenses, rightX, layout.tablesTop);
  if (layout.services) drawTable(layout.services, rightX, layout.servicesTop);
  if (layout.raw) drawTable(layout.raw, margin, layout.rawTop);
  let totalX = margin;
  layout.totals.forEach((total) => {
    fill(total.final ? blue : [234, 243, 253]);
    pdf.rect(totalX, layout.totalsTop, total.width, layout.totalsHeight, 'F');
    const color = total.final ? white : ink;
    font(total.labelSize, true, color);
    drawLines(total.labels, totalX + layout.totalPadding, layout.totalsTop + layout.totalPadding, total.labelSize);
    let amountTop = layout.totalsTop + layout.totalPadding + total.labels.length * total.labelSize * 1.2 + 3 * layout.scale;
    font(total.amountSize, true, color);
    total.amounts.forEach((lines) => {
      drawLines(lines, totalX + layout.totalPadding, amountTop, total.amountSize);
      amountTop += lines.length * total.amountSize * 1.2;
    });
    totalX += total.width;
  });
  pdf.setProperties({ title: content.documentTitle, subject: 'Export BBTM des éléments de facturation' });
  return pdf.output('blob');
}
