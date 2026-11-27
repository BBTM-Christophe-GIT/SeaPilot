import type { jsPDF } from 'jspdf';

type Point = [number, number];
type Color = [number, number, number];

interface RadarChapter {
  section: string;
  percentage: number | null;
}

interface RadarBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RadarLabel {
  index: number;
  lines: string[];
  height: number;
}

type LabelAlignment = 'left' | 'center' | 'right';

interface RadialLabel extends RadarLabel {
  x: number;
  y: number;
  align: LabelAlignment;
  left: number;
  right: number;
}

const levels = [20, 40, 60, 80, 100];
const grid: Color = [216, 226, 238];
const outline: Color = [191, 205, 222];
const blue: Color = [28, 83, 154];
const muted: Color = [82, 104, 125];
const labelGap = 3;
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function internalAuditScoreColor(value: number | null): Color {
  if (value === null) return muted;
  if (value < 40) return [180, 35, 24];
  if (value < 75) return [180, 83, 9];
  return [37, 129, 95];
}

function polygon(pdf: jsPDF, points: readonly Point[], style: 'F' | 'S') {
  const [x, y] = points[0];
  const offsets = points.slice(1).map(([nextX, nextY], index) => [nextX - points[index][0], nextY - points[index][1]]);
  pdf.lines(offsets, x, y, [1, 1], style, true);
}

export function drawInternalAuditRadar(
  pdf: jsPDF,
  chapters: readonly RadarChapter[],
  bounds: RadarBounds,
  options: { labelLayout?: 'radial' } = {},
): void {
  const { x, y, width, height } = bounds;
  const centerX = x + width / 2;
  if (!chapters.length) {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted);
    pdf.text('Aucun chapitre à représenter.', centerX, y + height / 2, { align: 'center' });
    return;
  }

  const count = chapters.length;
  const bottomIndex = count % 2 === 0 ? count / 2 : -1;
  const angles = chapters.map((_, index) => -Math.PI / 2 + index * 2 * Math.PI / count);
  const sideByIndex = chapters.map((_, index) => index === 0 || index === bottomIndex ? 0 : index < count / 2 ? 1 : -1);
  const radial = options.labelLayout === 'radial';
  const maxRadius = Math.min(width * .25, height * (radial ? .32 : .43));
  const railWidth = Math.min(65, width / 2 - maxRadius - 7);
  let fontSize = width < 145 ? 8 : 9;

  function scoreLabel(index: number): string {
    const value = chapters[index].percentage;
    return value === null ? 'N/A' : numberFormat.format(value) + ' %';
  }

  function measureLabel(index: number, labelWidth: number): RadarLabel {
    const title = chapters[index].section.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ');
    const lines: string[] = pdf.splitTextToSize(title, labelWidth);
    return { index, lines, height: fontSize * .42 * (lines.length + 1.2) };
  }

  function measureRadialLabels(): RadialLabel[] {
    pdf.setFont('helvetica', 'bold').setFontSize(fontSize);
    const anchorRadius = maxRadius + Math.min(9, width * .1, height * .1);
    return angles.map((angle, index) => {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const side = sideByIndex[index];
      const labelX = centerX + dx * anchorRadius;
      const labelWidth = side === 0 ? Math.min(84, width - 2) : Math.min(53, width / 2 - Math.abs(labelX - centerX) - 1);
      const label = measureLabel(index, labelWidth);
      const scoreWidth = pdf.getTextWidth(scoreLabel(index)) * (fontSize + 1) / fontSize;
      const textWidth = Math.max(scoreWidth, ...label.lines.map((line) => pdf.getTextWidth(line)));
      const left = labelX - textWidth * (1 - side) / 2;
      const labelY = y + height / 2 + dy * anchorRadius - label.height * (1 - dy * (1 - Math.abs(dx))) / 2;
      return { ...label, x: labelX, y: labelY, left, right: left + textWidth,
        align: side === 0 ? 'center' : side > 0 ? 'left' : 'right' };
    });
  }

  function radialLabelsFit(labels: RadialLabel[]): boolean {
    const gap = fontSize * .2;
    return labels.every((label, index) => label.left >= x && label.right <= x + width
      && label.y >= y && label.y + label.height <= y + height
      && labels.slice(0, index).every((other) => label.right + gap <= other.left || other.right + gap <= label.left
        || label.y + label.height + gap <= other.y || other.y + other.height + gap <= label.y));
  }

  function measureLabels() {
    pdf.setFont('helvetica', 'bold').setFontSize(fontSize);
    const labels = chapters.map((_, index) => {
      const labelWidth = sideByIndex[index] === 0 ? Math.min(2 * maxRadius, 110) : railWidth;
      return measureLabel(index, labelWidth);
    });
    return {
      topLabel: labels[0],
      bottomLabel: labels[bottomIndex],
      rightLabels: labels.filter(({ index }) => sideByIndex[index] === 1),
      leftLabels: labels.filter(({ index }) => sideByIndex[index] === -1).reverse(),
    };
  }

  const railGap = Math.min(labelGap, height / count * .2);
  const railHeight = (labels: RadarLabel[]) => labels.reduce((total, label) => total + label.height + railGap, 0);
  let radialLabels = radial ? measureRadialLabels() : null;
  while (radialLabels && !radialLabelsFit(radialLabels)) {
    if (fontSize * .9 < 6) return drawInternalAuditRadar(pdf, chapters, bounds);
    fontSize *= .9;
    radialLabels = measureRadialLabels();
  }
  let labels = radial ? null : measureLabels();
  while (labels && (Math.max(railHeight(labels.rightLabels), railHeight(labels.leftLabels)) > height - 2
    || labels.topLabel.height + (labels.bottomLabel?.height ?? 0) > height * .4)) {
    fontSize *= .9;
    labels = measureLabels();
  }

  const lineHeight = fontSize * .42;
  const plotTop = y + (labels ? labels.topLabel.height + labelGap : 0);
  const plotBottom = y + height - (labels?.bottomLabel ? labels.bottomLabel.height + labelGap : 0);
  const centerY = (plotTop + plotBottom) / 2;
  const radius = Math.min(maxRadius, (plotBottom - plotTop) / 2);
  function point(index: number, level: number): Point {
    const distance = radius * level / 100;
    return [centerX + Math.cos(angles[index]) * distance, centerY + Math.sin(angles[index]) * distance];
  }

  const ends = chapters.map((_, index) => point(index, 100));
  const values = chapters.map(({ percentage }, index) => percentage === null ? null : point(index, percentage));
  if (count >= 3 && values.every((value) => value !== null)) {
    pdf.setFillColor(230, 238, 249);
    polygon(pdf, values, 'F');
  }
  for (const level of levels) {
    pdf.setDrawColor(...(level === 100 ? outline : grid)).setLineWidth(level === 100 ? .42 : .25);
    if (count >= 3) polygon(pdf, chapters.map((_, index) => point(index, level)), 'S');
    else pdf.circle(centerX, centerY, radius * level / 100, 'S');
  }
  pdf.setDrawColor(...grid).setLineWidth(.25);
  ends.forEach(([endX, endY]) => pdf.line(centerX, centerY, endX, endY));
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...muted);
  for (const level of levels) pdf.text(String(level), centerX + 2, point(0, level)[1] + 2.8);

  pdf.setDrawColor(...blue).setLineWidth(.65);
  values.forEach((value, index) => {
    const next = index + 1 < count ? values[index + 1] : count >= 3 ? values[0] : null;
    if (value && next) pdf.line(...value, ...next);
  });
  values.forEach((value, index) => {
    if (!value) return;
    pdf.setFillColor(...internalAuditScoreColor(chapters[index].percentage));
    pdf.circle(...value, 1.5, 'F');
  });

  function drawLabel(label: RadarLabel, labelX: number, top: number, align: LabelAlignment) {
    pdf.setFont('helvetica', 'bold').setFontSize(fontSize).setTextColor(...internalAuditScoreColor(chapters[label.index].percentage));
    label.lines.forEach((line, index) => pdf.text(line, labelX, top + (index + .8) * lineHeight, { align }));
    pdf.setFontSize(fontSize + 1);
    pdf.text(scoreLabel(label.index), labelX, top + (label.lines.length + 1) * lineHeight, { align });
  }

  function drawRail(labels: RadarLabel[], side: -1 | 1) {
    const labelX = centerX + side * (radius + 6);
    let bottom = y + height - 1;
    const positions = labels.map(() => 0);
    // Pack toward the top, then correct against the top boundary without overlapping.
    for (let index = labels.length - 1; index >= 0; index -= 1) {
      const label = labels[index];
      positions[index] = Math.min(ends[label.index][1] - label.height / 2, bottom - label.height);
      bottom = positions[index] - railGap;
    }
    let top = y + 1;
    labels.forEach((label, index) => {
      const labelY = Math.max(top, positions[index]);
      const [endX, endY] = ends[label.index];
      pdf.setDrawColor(...outline).setLineWidth(.25);
      pdf.line(endX, endY, labelX - side * 1.8, labelY + label.height / 2);
      drawLabel(label, labelX, labelY, side === 1 ? 'left' : 'right');
      top = labelY + label.height + railGap;
    });
  }

  if (radialLabels) {
    radialLabels.forEach((label) => drawLabel(label, label.x, label.y, label.align));
  } else if (labels) {
    const { topLabel, bottomLabel, rightLabels, leftLabels } = labels;
    drawLabel(topLabel, centerX, centerY - radius - topLabel.height - labelGap, 'center');
    if (bottomLabel) drawLabel(bottomLabel, centerX, centerY + radius + labelGap, 'center');
    drawRail(rightLabels, 1);
    drawRail(leftLabels, -1);
  }
}
