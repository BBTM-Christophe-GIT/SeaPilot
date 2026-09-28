import metrics from './assets/contract-previews/helvetica-metrics.json';
import terms from './assets/contract-previews/contract-terms.json';

export type StyledContractKind = 'towage' | 'bareboat';
type Weight = 'regular' | 'bold';
export type ContractDrawing =
  | { type: 'text'; x: number; y: number; lines: string[]; size: number; leading: number; weight: Weight; color: string }
  | { type: 'rect'; x: number; y: number; width: number; height: number; fill: string; stroke?: string }
  | { type: 'circle'; x: number; y: number; radius: number; fill: string }
  | { type: 'image'; x: number; y: number; width: number; height: number; source: 'logo' | 'signature' };

export interface StyledContractDocument {
  title: string;
  pages: ContractDrawing[][];
}

interface ContractField {
  key: string;
  previewKey: string;
  label: string;
}

interface ContractSection {
  title: string;
  fields: ContractField[];
}

const field = (key: string, previewKey: string, label: string): ContractField => ({ key, previewKey, label });

export const STYLED_CONTRACT_SECTIONS: Record<StyledContractKind, ContractSection[]> = {
  towage: [
    { title: 'Parties au contrat', fields: [
      field('CONTRACT_DATE_LONG', 'contractDate', '1. Date'),
      field('CHARTERER', 'charterer', '2. Affréteur'),
      field('OWNER', 'owner', '3. Armateur'),
    ] },
    { title: 'Moyens nautiques', fields: [
      field('TOWED_VESSEL', 'towed', '4. Remorqué'),
      field('TUG', 'tug', '5. Remorqueur'),
      field('TOWED_CONDITIONS', 'conditions', '6. Conditions du remorqué'),
    ] },
    { title: 'Voyage et opérations', fields: [
      field('PICKUP_PLACE', 'pickup', '7. Lieu de prise en charge'),
      field('DEPARTURE_WINDOW', 'departure', '8. Créneau de départ'),
      field('DESTINATION_PLACE', 'destination', '9. Lieu de destination'),
      field('ARRIVAL_WINDOW', 'arrival', '10. Créneau d’arrivée'),
      field('CONNECTION_TIME', 'connection', '11. Temps prévu pour la connexion et autres opérations connexes'),
      field('DISCONNECTION_TIME', 'disconnection', '12. Temps prévu pour la déconnexion et autres opérations connexes'),
    ] },
    { title: 'Conditions financières et particulières', fields: [
      field('FIXED_PRICE', 'fixedPrice', '13. Tarif forfaitaire HT'),
      field('OPTIONAL_COSTS', 'optionalCosts', '14. Coûts additionnels facultatifs'),
      field('PAYMENT_TERMS', 'payment', '15. Conditions de paiement'),
      field('ADDITIONAL_CHARGES', 'additional', '16. Frais supplémentaires'),
      field('SPECIAL_CONDITIONS', 'special', '17. Autres conditions particulières'),
    ] },
  ],
  bareboat: [
    { title: 'Parties au contrat', fields: [
      field('CONTRACT_PLACE_AND_DATE', 'contractDate', '1. Lieu et date de signature'),
      field('CHARTERER', 'charterer', '2. Affréteur'),
      field('OWNER', 'owner', '3. Propriétaire'),
    ] },
    { title: 'Navire et titres de navigation', fields: [
      field('VESSEL_IDENTITY', 'vesselIdentity', '4. Navire'),
      field('VESSEL_DETAILS', 'vesselDetails', '4. Construction et limites d’exploitation'),
      field('LAST_ADMIN_VISIT', 'lastAdminVisit', '5. Dernière visite administrative'),
      field('NAVIGATION_TITLES', 'navigationTitles', '6. Validité des titres de navigation'),
    ] },
    { title: 'Livraison et restitution', fields: [
      field('DELIVERY', 'delivery', '7. Date et port de livraison'),
      field('MOBILISATION', 'mobilisation', '8. Forfait de mobilisation'),
      field('REDELIVERY', 'redelivery', '9. Date et port de restitution'),
      field('DEMOBILISATION', 'demobilisation', '10. Forfait de démobilisation'),
    ] },
    { title: 'Durée et conditions financières', fields: [
      field('MINIMUM_DURATION', 'minimumDuration', '11. Durée d’affrètement minimale'),
      field('EXTENSIONS', 'extensions', '12. Options de prolongation'),
      field('CHARTER_HIRE', 'charterHire', '13. Loyer journalier'),
      field('EARLY_TERMINATION', 'earlyTermination', '14. Indemnité de fin de contrat anticipé'),
    ] },
    { title: 'Assurance et droit applicable', fields: [
      field('INSURED_VALUE', 'insuredValue', '15. Valeur à assurer (si applicable)'),
      field('INSURANCE_PAYER', 'insurancePayer', '16. Assurance à la charge de'),
      field('APPLICABLE_LAW', 'applicableLaw', '17. Loi applicable'),
      field('JURISDICTION', 'jurisdiction', '18. Juridiction compétente'),
    ] },
  ],
};

const NAVY = '#123d68';
const BLUE = '#2e6de9';
const MUTED = '#617381';
const TEXT = '#233b57';
const BORDER = '#d8e2ed';
const PAGE_BOTTOM = 784;
export const CONTRACT_PAGE_SIZE = { width: 595.28, height: 841.89 };

/** Helvetica metrics keep the SVG preview and vector PDF on the same page breaks. */
export function contractTextWidth(value: string, size: number, weight: Weight = 'regular'): number {
  const widths = metrics[weight] as Record<string, number>;
  return [...value].reduce((width, character) => width + (widths[character] ?? widths['?']), 0) * size / 1000;
}

export function wrapContractText(value: string, width: number, size: number, weight: Weight = 'regular'): string[] {
  const widths = metrics[weight] as Record<string, number>;
  const safe = [...value.replace(/\r/g, '').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2010\u2011\u2012]/g, '-')].map((character) => (
    character === '\n' || widths[character] !== undefined ? character : '?'
  )).join('');
  return safe.split('\n').flatMap((paragraph) => {
    const lines: string[] = [];
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (contractTextWidth(candidate, size, weight) <= width) { current = candidate; continue; }
      if (current) lines.push(current);
      current = '';
      for (const character of word) {
        if (current && contractTextWidth(current + character, size, weight) > width) {
          lines.push(current);
          current = '';
        }
        current += character;
      }
    }
    return [...lines, current];
  });
}

export function contractPreviewFields(kind: StyledContractKind, values: Record<string, string>): Record<string, string> {
  return {
    ...Object.fromEntries(STYLED_CONTRACT_SECTIONS[kind].flatMap((section) => section.fields.map((item) => [item.key, values[item.previewKey] || '']))),
    PROJECT_CODE: values.projectCode,
    CONTRACT_DATE_SHORT: values.headerDate,
    OWNER_SIGNATORY: values.ownerSignatory,
    OWNER_SIGNATORY_FUNCTION: values.ownerSignatoryFunction || '',
    CHARTERER_SIGNATORY: values.chartererSignatory,
    SIGNATURE_STATEMENT: values.signatureStatement || values.signatureDate,
  };
}

export function buildStyledContract(
  kind: StyledContractKind,
  fields: Record<string, string>,
  projectTitle: string,
  hasSignature: boolean,
): StyledContractDocument {
  const title = kind === 'towage' ? 'CONTRAT DE REMORQUAGE' : 'CONTRAT D’AFFRÈTEMENT';
  const pages: ContractDrawing[][] = [];
  let page: ContractDrawing[] = [];
  let y = 0;
  const text = (value: string, x: number, top: number, width: number, size = 9, weight: Weight = 'regular', color = TEXT) => {
    const lines = wrapContractText(value, width, size, weight);
    page.push({ type: 'text', x, y: top, lines, size, leading: size * 1.4, weight, color });
    return lines.length * size * 1.4;
  };
  const rect = (x: number, top: number, width: number, height: number, fill: string, stroke?: string) => {
    page.push({ type: 'rect', x, y: top, width, height, fill, stroke });
  };
  const newPage = (subtitle: string) => {
    page = [];
    pages.push(page);
    rect(0, 0, CONTRACT_PAGE_SIZE.width, 83, '#091f32');
    page.push({ type: 'image', source: 'logo', x: 40, y: 14, width: 57, height: 57 });
    text(title, 110, 30, 342, 15, 'bold', '#ffffff');
    text(kind === 'bareboat' ? 'COQUE NUE' : 'BBTM', 110, 55, 270, 8, 'bold', '#cfdae6');
    text(fields.PROJECT_CODE || 'PROJET', 464, 30, 90, 11, 'bold', '#ffffff');
    text(fields.CONTRACT_DATE_SHORT || '', 464, 52, 90, 8, 'regular', '#cfdae6');
    text(subtitle, 42, 99, 511, 9, 'bold', MUTED);
    y = 125;
  };
  const ensureSpace = (height: number, subtitle = 'CLAUSES PARTICULIÈRES · SUITE') => {
    if (y + height > PAGE_BOTTOM) newPage(subtitle);
  };
  const heading = (label: string, number: string) => {
    ensureSpace(78);
    page.push({ type: 'circle', x: 54, y: y + 14, radius: 11, fill: BLUE });
    text(number, 51, y + 8, 20, 9, 'bold', '#ffffff');
    text(label, 83, y + 7, 458, 10, 'bold', NAVY);
    y += 38;
  };
  const signatures = () => {
    const signatories = [
      { label: kind === 'towage' ? '19. Armateur' : '20. Propriétaire', name: fields.OWNER_SIGNATORY, role: fields.OWNER_SIGNATORY_FUNCTION, owner: true },
      { label: kind === 'towage' ? '18. Affréteur' : '19. Affréteur', name: fields.CHARTERER_SIGNATORY, role: '', owner: false },
    ];
    const statement = fields.SIGNATURE_STATEMENT || fields.SIGNATURE_DATE || '';
    const statementHeight = wrapContractText(statement, 511, 8).length * 11.2 + 10;
    const nameHeight = Math.max(...signatories.map((signatory) => wrapContractText(signatory.name || 'Nom et qualité', 231, 8, 'bold').length * 11.2));
    const roleHeight = Math.max(...signatories.map((signatory) => wrapContractText(signatory.role || 'Signature, date et cachet', 231, 7).length * 9.8));
    const boxHeight = 28 + nameHeight + 5 + roleHeight + 42;
    ensureSpace(statementHeight + boxHeight + 14, 'SIGNATURES');
    text(statement, 42, y, 511, 8, 'regular', MUTED);
    y += statementHeight;
    signatories.forEach((signatory, index) => {
      const x = 42 + index * 255.5;
      rect(x, y, 255.5, boxHeight, '#ffffff', BORDER);
      text(signatory.label, x + 12, y + 10, 231, 9, 'bold', NAVY);
      text(signatory.name || 'Nom et qualité', x + 12, y + 28, 231, 8, 'bold');
      text(signatory.role || 'Signature, date et cachet', x + 12, y + 33 + nameHeight, 231, 7, 'regular', MUTED);
      if (signatory.owner && hasSignature) page.push({ type: 'image', source: 'signature', x: x + 12, y: y + boxHeight - 36, width: 102, height: 28 });
    });
    y += boxHeight + 14;
  };

  newPage('CLAUSES PARTICULIÈRES');
  const projectLines = wrapContractText(projectTitle || 'Nouveau projet', 487, 11, 'bold');
  rect(42, y, 511, 33 + projectLines.length * 15.4, '#f3f6fa');
  rect(42, y, 3, 33 + projectLines.length * 15.4, BLUE);
  text('PROJET', 54, y + 8, 487, 7, 'bold', MUTED);
  text(projectTitle || 'Nouveau projet', 54, y + 22, 487, 11, 'bold', NAVY);
  y += 48 + projectLines.length * 15.4;
  STYLED_CONTRACT_SECTIONS[kind].forEach((section, sectionIndex) => {
    heading(section.title, String(sectionIndex + 1));
    section.fields.forEach((item) => {
      const values = wrapContractText(fields[item.key] || '—', 324, 9);
      let offset = 0;
      do {
        const label = offset ? `${item.label} (suite)` : item.label;
        const labels = wrapContractText(label, 155, 8, 'bold');
        ensureSpace(Math.max(32, labels.length * 11.2 + 14));
        const availableLines = Math.max(1, Math.floor((PAGE_BOTTOM - y - 14) / 12.6));
        const visibleLines = values.slice(offset, offset + availableLines);
        const rowHeight = Math.max(labels.length * 11.2, visibleLines.length * 12.6) + 14;
        rect(42, y, 511, rowHeight, '#ffffff', BORDER);
        text(label, 54, y + 7, 155, 8, 'bold', MUTED);
        page.push({ type: 'text', x: 217, y: y + 7, lines: visibleLines, size: 9, leading: 12.6, weight: 'regular', color: TEXT });
        y += rowHeight;
        offset += visibleLines.length;
      } while (offset < values.length);
    });
    y += 16;
  });
  signatures();
  newPage('CLAUSES GÉNÉRALES');
  terms[kind].sections.forEach((section, index) => {
    const label = kind === 'towage' ? `${index + 1}. ${section.title}` : section.title;
    const headingLines = wrapContractText(label, 487, 10, 'bold');
    const height = headingLines.length * 14 + 16;
    ensureSpace(height + 40, 'CLAUSES GÉNÉRALES · SUITE');
    rect(42, y, 511, height, '#f3f6fa');
    rect(42, y, 3, height, BLUE);
    text(label, 54, y + 8, 487, 10, 'bold', NAVY);
    y += height + 10;
    section.paragraphs.forEach((paragraph) => {
      const lines = wrapContractText(paragraph, 511, 9);
      let offset = 0;
      while (offset < lines.length) {
        ensureSpace(25.2, 'CLAUSES GÉNÉRALES · SUITE');
        const visibleLines = lines.slice(offset, offset + Math.floor((PAGE_BOTTOM - y) / 12.6));
        page.push({ type: 'text', x: 42, y, lines: visibleLines, size: 9, leading: 12.6, weight: 'regular', color: TEXT });
        y += visibleLines.length * 12.6;
        offset += visibleLines.length;
      }
      y += 7;
    });
    y += 10;
  });
  signatures();
  pages.forEach((items, index) => {
    items.push({ type: 'rect', x: 42, y: 806, width: 511, height: .5, fill: BORDER });
    items.push({ type: 'text', x: 42, y: 816, lines: [`BBTM · ${fields.PROJECT_CODE || 'Projet'} · ${index + 1} / ${pages.length}`], size: 7, leading: 9.8, weight: 'regular', color: MUTED });
  });
  return { title, pages };
}
