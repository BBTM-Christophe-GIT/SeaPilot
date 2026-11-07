interface HistoryImageLabels {
  vesselName: string;
  year: number;
  asOf: string;
  costNote: string;
  costSourceLabel: string;
}

const themeTokens = ['--sp-surface', '--sp-surface-subtle', '--sp-heading', '--sp-muted', '--sp-border', '--sp-border-strong',
  '--sp-primary', '--sp-category-billing', '--sp-font'] as const;

export async function buildSeaOperationFleetFuelHistoryPng(svg: SVGSVGElement, labels: HistoryImageLabels): Promise<Blob> {
  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  if (!width || !height) throw new Error('Les dimensions du graphique sont indisponibles.');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const style = getComputedStyle(svg);
  const theme = (token: typeof themeTokens[number]) => style.getPropertyValue(token).trim();
  for (const token of themeTokens) clone.style.setProperty(token, theme(token));
  const source = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const padding = 16, scale = 2;
  const header = 62 + (labels.asOf ? 18 : 0) + (labels.costSourceLabel ? 18 : 0);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = (height + header + (labels.costNote ? 44 : 10)) * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Le rendu de l’image est indisponible.');
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Le graphique ne peut pas être converti en image.'));
      image.src = url;
    });
    context.scale(scale, scale);
    context.fillStyle = theme('--sp-surface') || 'white';
    context.fillRect(0, 0, width, canvas.height / scale);
    const font = theme('--sp-font') || 'sans-serif';
    context.fillStyle = theme('--sp-heading') || 'black';
    context.font = `bold 17px ${font}`;
    context.fillText(`${labels.vesselName} · ${labels.year}`, padding, 24, width - padding * 2);
    context.fillStyle = theme('--sp-muted') || 'black';
    context.font = `12px ${font}`;
    context.fillText('Historique annuel du carburant · DPR validés', padding, 44, width - padding * 2);
    if (labels.costSourceLabel) context.fillText(labels.costSourceLabel, padding, 62, width - padding * 2);
    if (labels.asOf) context.fillText(labels.asOf, padding, header - 18, width - padding * 2);
    context.drawImage(image, 0, header, width, height);
    if (labels.costNote) {
      let line = '';
      let y = header + height + 12;
      for (const word of labels.costNote.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > width - padding * 2) {
          context.fillText(line, padding, y);
          line = word;
          y += 14;
        } else line = next;
      }
      if (line) context.fillText(line, padding, y);
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob)
      : reject(new Error('Le graphique PNG ne peut pas être produit.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
