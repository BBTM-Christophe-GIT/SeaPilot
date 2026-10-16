import type { jsPDF } from 'jspdf';
import type { SeaOperationRecord } from './seaOperationQueries';
import { DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, SEA_OPERATION_SUPPLY_ITEMS } from './seaOperationModel';
import type { SeaOperationAnswer, SeaOperationCheck } from './seaOperationModel';

export const SEA_OPERATION_WORD_TEMPLATE_URL = '/templates/sea-operation/word-header-footer.pdf';
const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;
const LEFT = 49;
const RIGHT = 49;
const TOP = 100;
const BOTTOM = 55;
const BLUE: [number, number, number] = [21, 96, 130];

export interface SeaOperationPdfOptions {
  /** Private RH image resolved and hash-checked by the authorized query helper. */
  signatureImage?: string | null;
  hasUnsavedChanges?: boolean;
  /** Injectable source template bytes for offline rendering and deterministic verification. */
  templateBytes?: Uint8Array;
}
export interface SeaOperationGeneratedPdf { bytes: Uint8Array; filename: string; pageCount: number }

const value = (input: string | null | undefined) => input?.trim() ? input : 'À renseigner';
const answer = (input: SeaOperationAnswer) => input === 'yes' ? 'Oui' : input === 'no' ? 'Non' : 'À renseigner';
const clean = (input: string) => input.replace(/\u00a0/g, ' ').replace(/[\u2010-\u2015]/g, '-').replace(/\u202f/g, ' ');
const date = (input: string) => input.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2})(.*))?$/, (_match, year, month, day, time, suffix) => `${day}/${month}/${year}${time ? ` à ${time}${suffix || ''}` : ''}`) || 'À renseigner';
function timestamp(input: string | null) {
  if (!input) return 'À renseigner';
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : input;
}
function checkAnswer(check: SeaOperationCheck, input: SeaOperationAnswer) {
  if (input === 'yes') return check.yesLabel || 'Oui';
  if (input === 'no') return check.noLabel || (check.blocking ? 'Non - NE PAS APPAREILLER (NO GO automatique)' : check.justifyNo ? 'Non - justifier et transmettre à l’Armement' : 'Non');
  return 'À renseigner';
}

export function seaOperationPdfFilename(record: SeaOperationRecord): string {
  const safe = (input: string) => Array.from(input).filter((character) => character.charCodeAt(0) >= 32).join('').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 90);
  return `Operation-en-Mer-${safe(record.draft.project || 'Brouillon')}-${safe(record.draft.vessel.name || 'Navire')}.pdf`;
}

async function loadWordTemplate(): Promise<Uint8Array> {
  const response = await fetch(SEA_OPERATION_WORD_TEMPLATE_URL);
  if (!response.ok) throw new Error('Le modèle Word d’en-tête et de pied de page est indisponible. Le PDF ne peut pas être créé fidèlement.');
  return new Uint8Array(await response.arrayBuffer());
}

/** PDF pages reuse the original Word vector header/footer, including its embedded fonts and cropped logo. */
export async function generateSeaOperationPdf(record: SeaOperationRecord, options: SeaOperationPdfOptions = {}): Promise<SeaOperationGeneratedPdf> {
  const [{ jsPDF: Pdf }, { default: autoTable }, { PDFDocument }, template] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('pdf-lib'), options.templateBytes || loadWordTemplate(),
  ]);
  const form = record.draft;
  const signed = record.status === 'signed';
  const unsaved = Boolean(options.hasUnsavedChanges && !signed);
  const document = new Pdf({ orientation: 'portrait', unit: 'pt', format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });
  document.setProperties({ title: `GO / NO GO - OPÉRATION EN MER - ${form.project}`, subject: 'OPE-FOR-10-C', author: 'BBTM', creator: 'SeaPilot' });
  let y = TOP;
  const page = (space = 25) => { if (y + space > PAGE_HEIGHT - BOTTOM) { document.addPage(); y = TOP; } };
  const paragraph = (text: string, bold = false) => {
    document.setFont('helvetica', bold ? 'bold' : 'normal'); document.setFontSize(9); document.setTextColor(0, 0, 0);
    const lines = document.splitTextToSize(clean(text), PAGE_WIDTH - LEFT - RIGHT) as string[];
    for (const line of lines) { page(13); document.text(line, LEFT, y); y += 12; }
    y += 5;
  };
  const heading = (text: string, minor = false) => {
    page(45); y += minor ? 5 : 9;
    document.setFont('helvetica', 'bold'); document.setFontSize(minor ? 10 : 12); document.setTextColor(...BLUE);
    document.text(clean(text), LEFT, y); y += minor ? 15 : 18;
  };
  const table = (rows: string[][], headers?: string[], widths?: Record<number, { cellWidth: number }>) => {
    autoTable(document, {
      startY: y, margin: { top: TOP, bottom: BOTTOM, left: LEFT, right: RIGHT },
      head: headers ? [headers.map(clean)] : undefined, body: rows.map((row) => row.map(clean)), theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: .35, cellPadding: 5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [255, 255, 255], textColor: BLUE, fontStyle: 'bold' },
      columnStyles: widths, rowPageBreak: 'avoid', showHead: 'everyPage',
    });
    y = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 8;
  };
  const fields = (rows: Array<[string, string]>) => table(rows.map(([label, content]) => [label, value(content)]), undefined, { 0: { cellWidth: 170 } });

  paragraph(signed ? `Décision ${form.decision === 'NO_GO' ? 'NO GO' : 'GO'} signée.` : `BROUILLON - décision non signée${unsaved ? ' - modifications non enregistrées' : ''}.`, true);
  if (!unsaved && record.id) paragraph(`Fiche ${record.id} - Version ${record.version}.`);
  heading('À remplir par l’Armement');
  fields([['Projet', form.project], ['Client', form.client], ['Coordonnées du client (information opérationnelle)', form.clientContact], ['Description', form.description]]);
  heading('Personnel spécial à embarquer', true);
  if (form.specialPersonnel.length) table(form.specialPersonnel.map((person) => [value(person.name), value(person.phone)]), ['Prénom NOM', 'N° téléphone']);
  else paragraph('Aucun personnel spécial renseigné.');
  heading('Demande d’Attribution de Poste À Quai (DAPAQ)', true);
  paragraph('Caen, Le Havre, Dieppe et Rouen : DAPAQ préparée dans NOMADE par l’Armement ou le Capitaine. Autres ports : DAPAQ réalisée par mail et transmise à la Capitainerie.');
  fields([
    ['Mode', form.dapaq.method === 'nomade' ? 'NOMADE' : form.dapaq.method === 'email' ? 'Mail à la Capitainerie' : ''],
    ['Réalisée par', form.dapaq.preparedBy === 'armament' ? 'L’Armement' : form.dapaq.preparedBy === 'captain' ? 'Le Capitaine' : form.dapaq.preparedBy === 'agent' ? 'L’agent consignataire' : ''],
    ...(form.dapaq.preparedBy === 'agent' ? [['Agent consignataire', form.dapaq.agentName], ['Coordonnées de l’agent', form.dapaq.agentContact]] as Array<[string, string]> : []),
    ['Port de départ / Quai', `${value(form.vessel.departurePort)} / ${value(form.vessel.departureQuay)}`],
    ['Port d’arrivée / Quai', `${value(form.vessel.arrivalPort)} / ${value(form.vessel.arrivalQuay)}`],
    ['ETD - Date / Heure', date(form.vessel.etd)], ['ETA - Date / Heure', date(form.vessel.eta)],
  ]);
  heading('1 - Informations navire');
  fields([['Navire', form.vessel.name], ['Capitaine', form.vessel.captainName], ['N° immatriculation / IMO', form.vessel.registrationImo],
    ['Port de départ / Quai', `${value(form.vessel.departurePort)} / ${value(form.vessel.departureQuay)}`],
    ['Port à destination / Quai', `${value(form.vessel.arrivalPort)} / ${value(form.vessel.arrivalQuay)}`],
    ['ETD - Date / Heure', date(form.vessel.etd)], ['ETA - Date / Heure', date(form.vessel.eta)]]);
  heading('2 - Inspection avant appareillage');
  paragraph('Toute réponse négative marquée NO GO automatique interdit l’appareillage. Le Capitaine doit trouver une solution afin de pouvoir appareiller et justifier dûment toute situation ne le permettant pas.', true);
  for (const section of SEA_OPERATION_SECTIONS) {
    page(105);
    heading(`${section.id} - ${section.title}`, true);
    if (section.applicability && form.applicability[section.applicability] !== 'yes') {
      paragraph(form.applicability[section.applicability] === 'no' ? 'Non applicable.' : 'Applicabilité à renseigner.');
      continue;
    }
    if (section.applicability) paragraph('Rubrique applicable : Oui.');
    const checks = SEA_OPERATION_CHECKS.filter((check) => check.section === section.id);
    if (checks.length) table(checks.map((check) => [check.label + (check.help ? `\n${check.help}` : ''), checkAnswer(check, form.checks[check.id])
      + (form.justifications[check.id]?.trim() ? `\nJustification : ${form.justifications[check.id]}` : form.checks[check.id] === 'no' && check.justifyNo ? '\nJustification à transmettre à l’Armement : à renseigner.' : '')]), ['Contrôle', 'Réponse / justification'], { 0: { cellWidth: 280 } });
    if (section.id === '2.5' && form.applicability.towing === 'yes') {
      fields([['Besoin d’aller sur le remorqué', answer(form.towedVesselBoarding.required)]]);
      if (form.towedVesselBoarding.required === 'yes') fields([['Ronde de sécurité, zones dangereuses et mesures prises', form.towedVesselBoarding.measures === 'sms' ? 'L’opération ne nécessite pas de mesures autres que celles définies dans le SMS.' : form.towedVesselBoarding.measures === 'specific' ? `Les mesures spécifiques suivantes ont été prises :\n${value(form.towedVesselBoarding.details)}` : '']]);
    }
    if (section.id === '2.7') {
      const labels = { towing: 'Remorquage', pilotage: 'Pilotage', mooring: 'Lamanage', none: 'Le règlement portuaire n’exige pas ces services' };
      fields([['Services à l’arrivée', form.portServices.map((service) => labels[service]).join(' ; ')]]);
      if (form.portServices.some((service) => service !== 'none')) fields([['Services obligatoires prévenus au besoin', form.mandatoryServicesNotified ? 'Confirmé par le Capitaine' : 'Non confirmé']]);
    }
    if (section.id === '2.8') {
      fields([['Délégation à un shipchandler', form.supplies.delegated === 'yes' ? `Oui - ${value(form.supplies.shipchandlerName)}\n${value(form.supplies.shipchandlerContact)}` : form.supplies.delegated === 'no' ? 'Non - Le Capitaine gère l’escale avec l’appui de l’Armement au besoin.' : ''],
        ...(['Approvisionnement', 'Avitaillement'] as const).map((category): [string, string] => [category, SEA_OPERATION_SUPPLY_ITEMS.filter((item) => item.category === category && form.supplies.items.includes(item.id)).map((item) => item.label).join(' ; ') || 'Aucun besoin renseigné dans cette catégorie.']),
        ['Fournisseurs et besoins identifiés', form.supplies.suppliers], ['Comptes clients préparés avec la Direction financière au besoin', form.supplies.customerAccountsPrepared ? 'Confirmé' : 'Non confirmé / sans besoin déclaré']]);
    }
  }
  heading('3 - Plan de passage');
  fields([['Numéro de la ou des cartes marines', form.charts]]);
  paragraph('ETA : date et heure, ou heure seule si le point est atteint le même jour.');
  if (form.waypoints.length) table(form.waypoints.map((point) => [value(point.number), value(point.descriptionVhf), value(point.latitude), value(point.longitude), value(point.ukc), date(point.eta), point.denseTraffic ? 'Oui' : 'Non']), ['N°', 'Description / Contact VHF', 'Latitude', 'Longitude', 'UKC', 'ETA', 'Trafic dense']);
  else paragraph('Aucun point de passage renseigné.');
  heading('4 - Décision du Capitaine');
  paragraph(form.decision === 'GO' ? 'GO - La mission peut être réalisée.' : form.decision === 'NO_GO' ? 'NO GO - La mission ne peut être réalisée. Transmettre à l’Armement les risques identifiés.' : 'Décision à renseigner.', true);
  if (!signed) paragraph('BROUILLON - cette décision n’a pas été signée.', true);
  fields([['Risques identifiés / informations à transmettre à l’Armement', form.risks], ['Prénom NOM du Capitaine', form.signature.captainName], ['Date / Lieu', `${date(form.signature.date)} / ${value(form.signature.place)}`]]);
  if (form.signature.acknowledged) paragraph(signed ? 'En qualité de Capitaine, je confirme les informations renseignées et signe cette décision.' : 'Attestation cochée dans le brouillon - signature non enregistrée.');
  page(signed ? 260 : 130);
  if (options.signatureImage) {
    page(100); heading(signed ? 'Signature RH du Capitaine' : 'Signature RH préparée - décision non signée', true);
    try {
      const image = document.getImageProperties(options.signatureImage);
      const ratio = Math.min(210 / image.width, 65 / image.height);
      document.addImage(options.signatureImage, image.fileType, LEFT, y, image.width * ratio, image.height * ratio);
      y += image.height * ratio + 12;
    } catch { throw new Error('L’image privée de signature RH ne peut pas être lue. Aucun PDF avec une signature remplacée ne sera produit.'); }
  } else paragraph(signed ? 'Image de signature RH non disponible pour cette fiche historique. La preuve de décision enregistrée figure ci-dessous.' : 'Aucune signature RH apposée - décision non signée.');
  if (signed) fields([['Identité du compte signataire', value(record.signedByName)], ['Capitaine signataire enregistré', value(record.captainName)], ['Horodatage de signature (heure de Paris)', timestamp(record.signedAt)], ['État de la fiche', 'Signée et figée'], ['Identifiant / Version', `${record.id} / ${record.version}`]]);
  if (form.applicability.divingSupport === 'yes') {
    heading('Annexe - Kit médical plongée prévu par le formulaire');
    paragraph('En plus de la dotation médicale réglementaire, tout navire ayant des plongeurs professionnels à bord est équipé en permanence d’une trousse de secours plongée, comme défini dans la division 217 citée par le formulaire.');
    table(DIVING_MEDICAL_KIT.map((item) => [item.article, String(item.quantity), item.detail || 'Unité']), ['Article', 'Quantité', 'Présentation / remarques']);
  }

  let source;
  try { source = await PDFDocument.load(template); } catch { throw new Error('Le modèle Word d’en-tête et de pied de page est invalide.'); }
  if (source.getPageCount() !== 1) throw new Error('Le modèle Word d’en-tête et de pied de page est invalide.');
  const output = await PDFDocument.create();
  const [chrome] = await output.embedPdf(source, [0]);
  const bodyDocument = await PDFDocument.load(document.output('arraybuffer'));
  const body = await output.embedPdf(bodyDocument, bodyDocument.getPageIndices());
  for (const content of body) {
    const sheet = output.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    sheet.drawPage(chrome, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    sheet.drawPage(content, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
  }
  output.setTitle(`GO / NO GO - OPÉRATION EN MER - ${form.project}`);
  output.setSubject('OPE-FOR-10-C'); output.setCreator('SeaPilot'); output.setProducer('SeaPilot');
  return { bytes: await output.save(), filename: seaOperationPdfFilename(record), pageCount: output.getPageCount() };
}

export async function exportSeaOperationPdf(record: SeaOperationRecord, options: SeaOperationPdfOptions = {}): Promise<SeaOperationGeneratedPdf> {
  const generated = await generateSeaOperationPdf(record, options);
  const url = URL.createObjectURL(new Blob([new Uint8Array(generated.bytes)], { type: 'application/pdf' }));
  const anchor = window.document.createElement('a');
  anchor.href = url; anchor.download = generated.filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return generated;
}
