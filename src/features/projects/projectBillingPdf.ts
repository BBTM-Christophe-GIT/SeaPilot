interface BillingPdfContent {
  documentTitle: string;
  projectLabel: string;
  monthLabel: string;
  periodLabel: string;
  clientReference: string;
  vesselName: string | null;
  includeOperationAmounts: boolean;
  operationRows: string[][] | null;
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
  const margin = 17;
  const width = pageWidth - margin * 2;
  const blue = [7, 39, 78] as const;
  const ink = [35, 67, 106] as const;
  const pale = [241, 246, 250] as const;
  const border = [175, 202, 224] as const;
  const grid = [218, 230, 240] as const;
  const white = [255, 255, 255] as const;
  const columnGap = 11;
  const halfWidth = (width - columnGap) / 2;
  const rightX = margin + halfWidth + columnGap;
  const hasRightColumn = content.expenseRows !== null || content.serviceRows !== null;
  const showSectionSubtotals = content.totals.filter((total) => !total.final).length > 1;
  const setColor = (method: 'setFillColor' | 'setTextColor', color: readonly [number, number, number]) => {
    // Use the same exact navy for text and filled shapes.
    const channels = color === blue ? color.map((channel) => (channel / 255).toFixed(8)) : color;
    Reflect.apply(pdf[method], pdf, channels);
  };
  const font = (size: number, bold = false, color: readonly [number, number, number] = ink) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    setColor('setTextColor', color);
  };
  const fill = (color: readonly [number, number, number]) => setColor('setFillColor', color);
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
    { label: 'Date', ratio: 0.16 },
    { label: 'Opération', ratio: content.includeOperationAmounts ? 0.31 : 0.40 },
    ...(content.includeOperationAmounts ? [{ label: 'Montant HT', ratio: 0.185, align: 'right' as const }] : []),
    { label: 'Commentaires', ratio: content.includeOperationAmounts ? 0.345 : 0.44 },
  ];
  const expenseColumns: Column[] = [
    { label: 'Société', ratio: 0.36 },
    { label: 'Date facture', ratio: 0.18 },
    { label: 'N° facture', ratio: 0.24 },
    { label: 'Montant HT', ratio: 0.22, align: 'right' },
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
  const measureTotal = (
    total: BillingPdfContent['totals'][number], blockWidth: number, scale: number, final = false, summary = false,
  ) => {
    const padding = (summary ? 3 : final ? 11 : 7) * scale;
    const labelSize = (summary ? 10 : final ? 13 : 10.5) * scale;
    const amountSize = (summary ? 11.5 : final ? 16 : 12) * scale;
    const label = final ? total.label : 'Sous-total ' + total.label + ' HT';
    const labels = wrap(label, blockWidth * 0.64 - padding * 2, labelSize, !summary);
    const amounts = total.amounts.map((amount) => wrap(amount, blockWidth * 0.36 - padding * 2, amountSize, true));
    return {
      labels, amounts, final, summary, width: blockWidth, padding, labelSize, amountSize,
      height: padding * 2 + (final ? 12 * scale : 0) + Math.max(
        labels.length * labelSize * 1.2,
        amounts.reduce((sum, lines) => sum + lines.length * amountSize * 1.2, 0),
      ),
    };
  };
  const measureSectionTotal = (label: string, sectionWidth: number, scale: number) => {
    if (!showSectionSubtotals) return null;
    if (label === "Loyers d'Affrètement" && !content.includeOperationAmounts) return null;
    const total = content.totals.find((entry) => !entry.final && entry.label === label);
    return total ? measureTotal(total, sectionWidth, scale) : null;
  };
  const measureTable = (title: string, rows: string[][], columns: Column[], tableWidth: number, scale: number) => {
    const padding = 7 * scale;
    const bodySize = 9.2 * scale;
    const headerSize = 8 * scale;
    const titleSize = 17 * scale;
    const inset = title ? 11 * scale : 0;
    const titleHeight = title ? 43 * scale : 0;
    tableWidth -= inset * 2;
    const widths = columns.map((column) => column.ratio * tableWidth);
    const headers = columns.map((column, index) => wrap(column.label, widths[index] - padding * 2, headerSize, true));
    const headerHeight = Math.max(...headers.map((lines) => lines.length)) * headerSize * 1.2 + padding * 2;
    const measuredRows = rows.map((row) => {
      const cells = columns.map((_, index) => wrap(row[index] || '', widths[index] - padding * 2, bodySize));
      return { cells, height: Math.max(...cells.map((lines) => lines.length)) * bodySize * 1.2 + padding * 2 };
    });
    const subtotal = title ? measureSectionTotal(title, tableWidth, scale) : null;
    return {
      title, columns, widths, headers, measuredRows, padding, bodySize, headerSize, titleSize, inset,
      titleHeight, headerHeight, subtotal,
      height: titleHeight + headerHeight + measuredRows.reduce((sum, row) => sum + row.height, 0)
        + (subtotal?.height || 0) + inset,
      width: tableWidth,
    };
  };
  const measureExpenses = (scale: number) => {
    const padding = 7 * scale;
    const inset = 11 * scale;
    const innerWidth = halfWidth - inset * 2;
    const titleSize = 17 * scale;
    const titleHeight = 43 * scale;
    const specialtySize = 12 * scale;
    const groupGap = 11 * scale;
    const groups = orderedExpenseGroups.map(({ specialty, suppliers }) => {
      const lines = wrap(specialty, innerWidth, specialtySize, true);
      const headingHeight = lines.length * specialtySize * 1.2 + 7 * scale;
      const invoices = suppliers.flatMap(([supplier, rows]) => rows.map((invoice) => [supplier, ...invoice]));
      const table = measureTable('', invoices, expenseColumns, innerWidth, scale);
      return { lines, headingHeight, table, height: headingHeight + table.height };
    });
    // Preserve the empty expense section and its invoice column headings.
    const emptyTable = groups.length ? null : measureTable('', [], expenseColumns, innerWidth, scale);
    const subtotal = measureSectionTotal('Frais imputables', innerWidth, scale);
    return {
      titleSize, titleHeight, padding, specialtySize, groupGap, groups, emptyTable, subtotal, inset, innerWidth,
      height: titleHeight + groups.reduce((sum, group) => sum + group.height, 0)
        + Math.max(0, groups.length - 1) * groupGap + (emptyTable?.height || 0) + (subtotal?.height || 0) + inset,
    };
  };
  const measure = (scale: number) => {
    const gap = 12 * scale;
    const documentTitleSize = 27 * scale;
    const projectSize = 12 * scale;
    const metaSize = 11.5 * scale;
    const monthSize = 23 * scale;
    const leftMetaWidth = width * 0.70 - 85 * scale - columnGap;
    const rightMetaWidth = width * 0.30 - 20 * scale;
    const documentHeading = wrap('Éléments de facturation', leftMetaWidth, documentTitleSize, true);
    const project = wrap(content.projectLabel, leftMetaWidth, projectSize);
    const period = wrap(content.periodLabel, rightMetaWidth, metaSize);
    const month = wrap(content.monthLabel, rightMetaWidth, monthSize, true);
    const reference = wrap('Référence client : ' + content.clientReference, rightMetaWidth, metaSize);
    const vessel = content.vesselName === null ? [] : wrap('Navire : ' + content.vesselName, rightMetaWidth, metaSize);
    const metadataTop = margin + 1;
    const leftHeight = documentHeading.length * documentTitleSize * 1.2 + project.length * projectSize * 1.2 + 4 * scale;
    const rightHeight = month.length * monthSize * 1.2 + 8 * scale
      + (period.length + reference.length + vessel.length) * metaSize * 1.2 + (vessel.length ? 4 * scale : 0);
    const tablesTop = metadataTop + Math.max(leftHeight, rightHeight, 71 * scale) + gap;
    const operations = content.operationRows === null ? null
      : measureTable("Loyers d'Affrètement", content.operationRows, operationColumns, hasRightColumn ? halfWidth : width, scale);
    const expenses = content.expenseRows === null ? null
      : measureExpenses(scale);
    const services = content.serviceRows === null ? null
      : measureTable('Prestations BBTM', content.serviceRows, serviceColumns, halfWidth, scale);
    const servicesTop = tablesTop + (expenses ? expenses.height + gap : 0);
    const columnBottom = Math.max(
      tablesTop + (operations?.height || 0),
      services ? servicesTop + services.height : tablesTop + (expenses?.height || 0),
    );
    const columnGapAfter = operations || expenses || services ? gap : 0;
    const raw = content.rawRows.length ? measureTable('Détail des Opérations', content.rawRows, rawColumns, width, scale) : null;
    const rawTop = columnBottom + columnGapAfter;
    const totalsTop = raw ? rawTop + raw.height + gap : columnBottom + columnGapAfter;
    const summaryInset = 11 * scale;
    const summaryWidth = halfWidth - summaryInset * 2;
    const summary = showSectionSubtotals ? content.totals.filter((total) => !total.final)
      .map((total) => measureTotal(total, summaryWidth, scale, false, true)) : [];
    const totals = content.totals.filter((total) => total.final)
      .map((total) => measureTotal(total, summaryWidth, scale, true));
    const totalsHeight = summaryInset * 2 + summary.reduce((sum, total) => sum + total.height, 0)
      + (summary.length ? 10 * scale : 0) + totals.reduce((sum, total) => sum + total.height, 0)
      + Math.max(0, totals.length - 1) * gap;
    return {
      scale, gap, documentTitleSize, documentHeading, projectSize, metaSize, monthSize, project, period, month, reference, vessel,
      metadataTop, operations, expenses, services, tablesTop, servicesTop, raw, rawTop,
      summary, summaryInset, totals, totalsTop, totalsHeight, bottom: totalsTop + totalsHeight,
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
  let objectUrl: string | null = null;
  try {
    const response = await fetch('/bbtm-report-logo.png');
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
        const inkCoverage = 1 - pixels.data[index] / 255;
        blue.forEach((channel, offset) => {
          pixels.data[index + offset] = 255 - inkCoverage * (255 - channel);
        });
      }
      context.putImageData(pixels, 0, 0);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin + 9 * layout.scale, margin + 2, 50 * layout.scale, 50 * layout.scale);
    }
  } catch {
    // The financial content remains available if the logo cannot be decoded.
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
  const projectX = margin + 78 * layout.scale;
  font(layout.documentTitleSize, true, blue);
  drawLines(layout.documentHeading, projectX, layout.metadataTop, layout.documentTitleSize);
  const subtitleTop = layout.metadataTop + layout.documentHeading.length * layout.documentTitleSize * 1.2 + 4 * layout.scale;
  font(layout.projectSize, false, blue);
  drawLines(layout.project, projectX, subtitleTop, layout.projectSize);
  pdf.setDrawColor(...border);
  pdf.setLineWidth(0.8);
  pdf.line(margin + width * 0.70, layout.metadataTop, margin + width * 0.70, layout.tablesTop - layout.gap);
  font(layout.monthSize, true, blue);
  drawLines(layout.month, pageWidth - margin, layout.metadataTop, layout.monthSize, 'right');
  const periodTop = layout.metadataTop + layout.month.length * layout.monthSize * 1.2 + 4 * layout.scale;
  font(layout.metaSize, false, [104, 128, 155]);
  drawLines(layout.period, pageWidth - margin, periodTop, layout.metaSize, 'right');
  const referenceTop = periodTop + layout.period.length * layout.metaSize * 1.2 + 4 * layout.scale;
  font(layout.metaSize);
  drawLines(layout.reference, pageWidth - margin, referenceTop, layout.metaSize, 'right');
  drawLines(layout.vessel, pageWidth - margin, referenceTop + layout.reference.length * layout.metaSize * 1.2 + 4 * layout.scale, layout.metaSize, 'right');
  const drawTotal = (total: ReturnType<typeof measureTotal>, x: number, top: number) => {
    fill(pale);
    if (total.final) {
      fill([205, 223, 235]);
      pdf.roundedRect(x, top, total.width, total.height, 3 * layout.scale, 3 * layout.scale, 'F');
    } else pdf.rect(x, top, total.width, total.height, 'F');
    const color = blue;
    font(total.labelSize, !total.summary, color);
    drawLines(total.labels, x + total.padding, top + total.padding + (total.final ? 6 * layout.scale : 0), total.labelSize);
    let amountTop = top + total.padding + (total.final ? 6 * layout.scale : 0);
    font(total.amountSize, true, color);
    total.amounts.forEach((lines) => {
      drawLines(lines, x + total.width - total.padding, amountTop, total.amountSize, 'right');
      amountTop += lines.length * total.amountSize * 1.2;
    });
  };
  const drawTable = (table: ReturnType<typeof measureTable>, x: number, top: number) => {
    const frameX = x;
    const innerX = x + table.inset;
    if (table.title) {
      font(table.titleSize, true, blue);
      drawLines([table.title], innerX, top + 8 * layout.scale, table.titleSize);
      pdf.setDrawColor(81, 143, 186);
      pdf.setLineWidth(0.8 * layout.scale);
      pdf.line(innerX, top + 32 * layout.scale, innerX + table.width, top + 32 * layout.scale);
    }
    x = innerX;
    let y = top + table.titleHeight;
    fill(pale);
    pdf.rect(x, y, table.width, table.headerHeight, 'F');
    let cellX = x;
    font(table.headerSize, true, blue);
    table.columns.forEach((column, index) => {
      const align = column.align || 'left';
      drawLines(table.headers[index], align === 'right' ? cellX + table.widths[index] - table.padding : cellX + table.padding, y + table.padding, table.headerSize, align);
      cellX += table.widths[index];
    });
    y += table.headerHeight;
    table.measuredRows.forEach((row) => {
      fill(white);
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
    pdf.setDrawColor(...grid);
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
    if (table.subtotal) drawTotal(table.subtotal, x, y);
    if (table.title) {
      pdf.setDrawColor(...border);
      pdf.setLineWidth(0.7 * layout.scale);
      pdf.roundedRect(frameX, top, table.width + table.inset * 2, table.height,
        4 * layout.scale, 4 * layout.scale, 'S');
    }
  };
  const drawExpenses = (tree: ReturnType<typeof measureExpenses>, x: number, top: number) => {
    const frameX = x;
    x += tree.inset;
    font(tree.titleSize, true, blue);
    drawLines(['Frais imputables'], x, top + 8 * layout.scale, tree.titleSize);
    pdf.setDrawColor(81, 143, 186);
    pdf.setLineWidth(0.8 * layout.scale);
    pdf.line(x, top + 32 * layout.scale, x + tree.innerWidth, top + 32 * layout.scale);
    let y = top + tree.titleHeight;
    tree.groups.forEach((group, groupIndex) => {
      if (groupIndex) y += tree.groupGap;
      font(tree.specialtySize, true, blue);
      drawLines(group.lines, x, y, tree.specialtySize);
      y += group.headingHeight;
      drawTable(group.table, x, y);
      y += group.table.height;
    });
    if (tree.emptyTable) {
      drawTable(tree.emptyTable, x, y);
      y += tree.emptyTable.height;
    }
    if (tree.subtotal) drawTotal(tree.subtotal, x, y);
    pdf.setDrawColor(...border);
    pdf.setLineWidth(0.7 * layout.scale);
    pdf.roundedRect(frameX, top, halfWidth, tree.height, 4 * layout.scale, 4 * layout.scale, 'S');
  };
  if (layout.operations) drawTable(layout.operations, margin, layout.tablesTop);
  if (layout.expenses) drawExpenses(layout.expenses, rightX, layout.tablesTop);
  if (layout.services) drawTable(layout.services, rightX, layout.servicesTop);
  if (layout.raw) drawTable(layout.raw, margin, layout.rawTop);
  fill(pale);
  pdf.setDrawColor(...border);
  pdf.setLineWidth(0.7 * layout.scale);
  pdf.roundedRect(rightX, layout.totalsTop, halfWidth, layout.totalsHeight,
    4 * layout.scale, 4 * layout.scale, 'FD');
  let totalY = layout.totalsTop + layout.summaryInset;
  layout.summary.forEach((total) => {
    drawTotal(total, rightX + layout.summaryInset, totalY);
    totalY += total.height;
  });
  if (layout.summary.length) {
    pdf.setDrawColor(81, 143, 186);
    pdf.setLineWidth(0.8 * layout.scale);
    pdf.line(rightX + layout.summaryInset, totalY + 4 * layout.scale,
      pageWidth - margin - layout.summaryInset, totalY + 4 * layout.scale);
    totalY += 10 * layout.scale;
  }
  layout.totals.forEach((total) => {
    drawTotal(total, rightX + layout.summaryInset, totalY);
    totalY += total.height + layout.gap;
  });
  pdf.setProperties({ title: content.documentTitle, subject: 'Export BBTM des éléments de facturation' });
  return pdf.output('blob');
}
