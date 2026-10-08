import { disciplinaryBodyHasContent, disciplinaryBodyToHtml, disciplinaryBodyToPlainText, disciplinaryTextToHtml } from './disciplinaryRichText';

export const LEGAL_REVIEWED_ON = '2026-09-15';
export const LEGAL_SOURCES = [
  { label: 'Service Public · sanctions disciplinaires', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2234' },
  { label: 'Service Public · faute et conséquences', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1137' },
  { label: 'Service Public · procédure de licenciement', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2839' },
  { label: 'Service Public · indemnité de licenciement', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F987' },
  { label: 'Service Public · recours et délais', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2360' },
  { label: 'Service Public · modification du contrat', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2339' },
  { label: 'Code des transports · L5531-22', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033555230' },
  { label: 'Code des transports · L5531-31', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033555250' },
] as const;

export const FAULTS = {
  simple: { label: 'Faute simple', definition: 'Manquement professionnel qui permet le maintien dans l’entreprise. Un licenciement suppose néanmoins une cause réelle et sérieuse.' },
  grave: { label: 'Faute grave', definition: 'Manquement rendant impossible le maintien dans l’entreprise, même pendant le préavis. La gravité dépend des circonstances et des fonctions exercées.' },
  lourde: { label: 'Faute lourde', definition: 'Faute d’une particulière gravité assortie d’une intention de nuire à l’employeur, à établir distinctement. La consommation d’alcool ou de stupéfiants ne suffit pas à établir cette intention.' },
} as const;

export const SANCTIONS = {
  avertissement: { label: 'Avertissement', definition: 'Reproche écrit et motivé sans suspension du contrat.' },
  blame: { label: 'Blâme', definition: 'Réprobation formelle et écrite. Vérifier les effets prévus par le règlement intérieur : un blâme affectant la carrière appelle un entretien.' },
  mise_a_pied: { label: 'Mise à pied disciplinaire', definition: 'Suspension temporaire du contrat et de la rémunération. La durée maximale doit être prévue par le règlement intérieur applicable.' },
  mutation: { label: 'Mutation disciplinaire', definition: 'Changement d’affectation ou de lieu de travail. Une modification du contrat exige l’accord du salarié.' },
  retrogradation: { label: 'Rétrogradation', definition: 'Abaissement de la position hiérarchique. La modification du contrat nécessite l’accord exprès du salarié.' },
  licenciement: { label: 'Licenciement disciplinaire (CDI)', definition: 'Rupture du CDI pour faute simple, grave ou lourde, après une procédure de licenciement pour motif personnel.' },
} as const;

export const REASONS = {
  stupefiants_averes: {
    label: 'Consommation de stupéfiants avérée',
    definition: 'Décrire les éléments licitement recueillis établissant la consommation, leur date, les fonctions exercées et le manquement professionnel précis.',
    paragraph: 'Les éléments établissant une consommation de stupéfiants et le manquement professionnel reproché sont exposés ci-dessous. Leur origine et les conditions de leur recueil doivent être précisées.',
  },
  alcool_avere: {
    label: 'Consommation d’alcool avérée',
    definition: 'Distinguer consommation, dépassement d’un seuil applicable et manquement au règlement intérieur. Préciser la preuve et le contexte de travail.',
    paragraph: 'Les éléments établissant une consommation d’alcool dans le contexte professionnel et le manquement aux obligations applicables sont exposés ci-dessous.',
  },
  impregnation_presumee: {
    label: 'Signes laissant présumer une imprégnation alcoolique',
    definition: 'Consigner des observations précises sans conclure à une consommation certaine. L5531-22 encadre le contrôle de l’alcoolémie, notamment les exceptions pendant le repos.',
    paragraph: 'Des éléments ou signes manifestes laissant présumer une imprégnation alcoolique ont été observés. Ces signes sont décrits ci-dessous ; ils ne constituent pas, à eux seuls, une preuve de consommation. L’article L5531-22 du Code des transports encadre les contrôles de l’alcoolémie à bord, notamment pendant le repos.',
  },
  ivresse_manifeste: {
    label: 'État d’ivresse manifeste',
    definition: 'Décrire les manifestations observées, leur impact et les témoignages. L5531-31 prévoit, dans son champ d’application, un dépistage ou une vérification de l’alcoolémie.',
    paragraph: 'Un état d’ivresse manifeste a été constaté au regard des manifestations concrètes relatées ci-dessous. À bord d’un navire battant pavillon français et pour les personnes concernées dans l’exercice de leurs fonctions, l’article L5531-31 du Code des transports encadre le dépistage ou les vérifications de l’alcoolémie par le capitaine ou son suppléant.',
  },
  comportement_evocateur: {
    label: 'Comportement évocateur d’alcool ou de stupéfiants',
    definition: 'Retenir uniquement les signes effectivement observés : comportement, élocution, équilibre, odeur d’alcool, désorientation, agressivité inhabituelle ou somnolence. Aucune substance ne doit être affirmée sans preuve.',
    paragraph: 'Un comportement susceptible d’évoquer une consommation d’alcool ou de stupéfiants a été observé. Les signes effectivement constatés sont détaillés ci-dessous, sans préjuger de leur cause ni tenir une consommation pour établie. L’article L5531-31 du Code des transports concerne le contrôle de l’alcoolémie ; il ne constitue pas un fondement de dépistage des stupéfiants.',
  },
} as const;

export type FaultKey = keyof typeof FAULTS;
export type SanctionKey = keyof typeof SANCTIONS;
export type ReasonKey = keyof typeof REASONS;
export type LetterKind = 'convocation' | 'notification' | 'conservatoire';
export const LETTER_KINDS: Record<LetterKind, string> = {
  convocation: 'Convocation à un entretien préalable', notification: 'Notification / proposition de sanction', conservatoire: 'Mise à pied conservatoire',
};

export interface DisciplinaryPerson {
  id: number; companyId: number; firstName: string; lastName: string; functionLabel: string;
  postalAddress: string; hiredOn: string; departedOn: string; contractType: string;
}
export interface DisciplinaryForm {
  employeeName: string; address: string; fault: FaultKey; sanction: SanctionKey; reason: ReasonKey;
  facts: string; factsOn: string; knownOn: string; vessel: string; evidence: string; rules: string;
  summonsSentOn: string; summonsReceivedOn: string; interviewAt: string; interviewPlace: string; explanations: string;
  notificationOn: string; extraHolidays: string; optionalInterview: boolean; representatives: boolean;
  advisorAddresses: string; contractType: string; protectedEmployee: boolean;
  sanctionDetails: string; harmfulIntent: string;
}
export interface DisciplinaryLetter {
  kind: LetterKind; date: string; subject: string; body: string;
  employeeName: string; address: string; emitterName: string; emitterFunction: string; signatureDataUrl: string;
  reviewedForm?: string;
}
export interface DisciplinaryCase {
  id: string; company_id: number; person_id: number; case_date: string; data: DisciplinaryForm;
  letter: DisciplinaryLetter | null; updated_at: string;
  issuer_id: string; workflow_status: 'draft' | 'in_review' | 'validated';
  validated_at?: string | null; validated_by?: string | null;
}
export interface DisciplinaryDocument {
  id: string; case_id: string; file_name: string; drive_path: string; drive_url: string; document_date: string;
  kind: 'letter' | 'attachment'; created_at: string; letter_snapshot: DisciplinaryLetter | null;
}

export function formFingerprint(form: DisciplinaryForm): string {
  return JSON.stringify(Object.fromEntries(Object.entries(form).sort(([a], [b]) => a.localeCompare(b))));
}
export function isLetterReviewed(form: DisciplinaryForm, letter: DisciplinaryLetter): boolean {
  try { return formFingerprint(JSON.parse(letter.reviewedForm || 'null')) === formFingerprint(form); }
  catch { return false; }
}
export function todayParis(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function frenchDate(value: string): string {
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.split('-').reverse().join('/') : 'à renseigner';
}
export function personName(person: Pick<DisciplinaryPerson, 'firstName' | 'lastName'>): string {
  return `${person.firstName} ${person.lastName.toLocaleUpperCase('fr-FR')}`.trim();
}
export function isEmployed(person: DisciplinaryPerson, on = todayParis()): boolean {
  return Boolean(person.hiredOn && person.hiredOn <= on && (!person.departedOn || person.departedOn > on));
}
export function initialForm(person: DisciplinaryPerson): DisciplinaryForm {
  return {
    employeeName: personName(person), address: person.postalAddress, fault: 'simple', sanction: 'avertissement',
    reason: 'impregnation_presumee', facts: '', factsOn: todayParis(), knownOn: todayParis(), vessel: '', evidence: '', rules: '',
    summonsSentOn: '', summonsReceivedOn: '', interviewAt: '', interviewPlace: '', explanations: '', notificationOn: '', extraHolidays: '',
    optionalInterview: false, representatives: true, advisorAddresses: '', contractType: person.contractType || '',
    protectedEmployee: false, sanctionDetails: '', harmfulIntent: '',
  };
}
export function requiresInterview(form: DisciplinaryForm): boolean {
  return !['avertissement', 'blame'].includes(form.sanction) || form.optionalInterview;
}

// UTC date-only arithmetic avoids daylight-saving and browser time-zone drift.
function parseDay(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error('Date invalide.');
  return date;
}
function key(date: Date): string { return date.toISOString().slice(0, 10); }
function next(date: Date): Date { return new Date(+date + 86_400_000); }
export function frenchHolidays(year: number): string[] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, day, 12));
  return [...['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map((v) => `${year}-${v}`),
    ...[1, 39, 50].map((offset) => key(new Date(+easter + offset * 86_400_000)))];
}
function isHoliday(date: Date, extra: string[]): boolean { return [...frenchHolidays(date.getUTCFullYear()), ...extra].includes(key(date)); }
function extendExpiry(date: Date, extra: string[]): Date {
  while ([0, 6].includes(date.getUTCDay()) || isHoliday(date, extra)) date = next(date);
  return date;
}
export function monthDeadline(value: string, months: number, extra: string[] = []): string {
  const date = parseDay(value), originalDay = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, last));
  return key(extendExpiry(date, extra));
}
export function afterClearWorkingDays(value: string, count: number, extra: string[] = []): string {
  let date = parseDay(value), elapsed = 0;
  while (elapsed < count) { date = next(date); if (date.getUTCDay() !== 0 && !isHoliday(date, extra)) elapsed++; }
  date = next(extendExpiry(date, extra));
  while (date.getUTCDay() === 0 || isHoliday(date, extra)) date = next(date);
  return key(date);
}
export function deadlines(form: DisciplinaryForm) {
  const extra = form.extraHolidays.split(/[\s,;]+/).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
  return {
    initiateBy: form.knownOn ? monthDeadline(form.knownOn, 2, extra) : '',
    interviewFrom: form.sanction === 'licenciement' && form.summonsReceivedOn ? afterClearWorkingDays(form.summonsReceivedOn, 5, extra) : '',
    notifyFrom: requiresInterview(form) && form.interviewAt ? afterClearWorkingDays(form.interviewAt, 2, extra) : '',
    notifyBy: requiresInterview(form) && form.interviewAt ? monthDeadline(form.interviewAt, 1, extra) : '',
  };
}

export function procedureNotes(form: DisciplinaryForm): { title: string; text: string }[] {
  const dismissal = form.sanction === 'licenciement';
  return [
    { title: 'Engagement de la procédure', text: 'Engager les poursuites dans les 2 mois suivant la connaissance des faits. Les exceptions, notamment pénales, exigent une analyse du dossier. Vérifier le règlement intérieur, la convention collective et les règles maritimes applicables.' },
    { title: 'Entretien préalable', text: requiresInterview(form)
      ? `Convoquer par LRAR ou remise contre décharge, en précisant objet, date, heure, lieu et assistance. ${dismissal ? 'Respecter 5 jours ouvrables entiers après la première présentation ou la remise. Sans représentants du personnel, mentionner aussi le conseiller du salarié et les adresses de consultation de la liste.' : 'Prévoir un délai raisonnable de préparation ; aucun minimum général de 5 jours pour cette sanction.'} Recueillir les explications sans annoncer la décision pendant l’entretien.`
      : 'En principe facultatif pour un avertissement ou un blâme sans effet sur la présence, la fonction, la carrière ou la rémunération. Cocher « Entretien nécessaire ou choisi » si le règlement, la convention ou les effets de la sanction l’exigent. Un entretien volontaire déclenche les délais de notification.' },
    { title: 'Notification', text: `${requiresInterview(form) ? 'Attendre 2 jours ouvrables entiers après l’entretien ; notifier au plus tard 1 mois après. ' : ''}Motiver précisément l’écrit. ${dismissal ? 'Envoyer le licenciement par LRAR.' : 'Remettre contre décharge ou adresser en recommandé.'} Conserver les preuves de présentation, d’envoi et de remise.` },
    { title: 'Préavis et indemnités', text: !dismissal
      ? form.sanction === 'mise_a_pied' ? 'Pas de préavis de rupture ni d’indemnité de licenciement. La suspension et la retenue de salaire correspondent strictement à la durée disciplinaire autorisée et notifiée.' : 'Le contrat continue : pas de préavis de rupture ni d’indemnité de licenciement. Les amendes et autres sanctions pécuniaires sont interdites.'
      : form.fault === 'simple' ? 'CDI : préavis selon ancienneté, convention et contrat (règle générale : 1 mois entre 6 mois et moins de 2 ans ; 2 mois dès 2 ans ; en dessous, texte ou usage applicable). Dispense décidée par l’employeur : indemnité compensatrice. Indemnité légale dès 8 mois d’ancienneté ininterrompue : 1/4 de mois par année jusqu’à 10 ans, puis 1/3 au-delà, sauf formule plus favorable. Congés payés acquis non pris à indemniser.' : 'Faute grave ou lourde : pas de préavis ni d’indemnité légale de licenciement, sous réserve de dispositions plus favorables. Les congés payés acquis non pris restent indemnisables. Remettre les documents de fin de contrat.' },
    ...(['mutation', 'retrogradation'].includes(form.sanction) ? [{ title: 'Accord sur le contrat', text: 'Si la sanction modifie le contrat, solliciter l’accord exprès du salarié avant application. Son refus n’est pas une nouvelle faute. Une autre sanction éventuelle nécessite de respecter la procédure et les délais applicables.' }] : []),
    ...(form.sanction === 'mise_a_pied' ? [{ title: 'Durée de suspension', text: 'Indiquer la durée et les dates d’exécution, dans la limite du règlement intérieur. La mise à pied conservatoire est une mesure d’attente distincte : elle ne constitue pas une sanction et impose d’engager rapidement la procédure.' }] : []),
    { title: 'Proportionnalité et protection', text: 'Aucune sanction automatique selon le motif. Ne pas sanctionner deux fois les mêmes faits ; une sanction de plus de 3 ans ne peut appuyer une nouvelle sanction. Pour un salarié protégé, vérifier la procédure spéciale et l’autorisation administrative avant tout licenciement. Les modèles de licenciement proposés concernent le CDI, pas la rupture anticipée d’un CDD.' },
    { title: 'Motifs interdits', text: 'Une sanction ne peut reposer sur une discrimination, l’exercice régulier du droit de grève ou de retrait, une liberté fondamentale ou un signalement protégé. Une observation uniquement orale ne constitue pas une sanction disciplinaire.' },
    { title: 'Contestation', text: dismissal ? 'Recours devant le conseil de prud’hommes : délai général de 12 mois à compter de la notification de la rupture. Des délais particuliers existent notamment pour les salaires, le harcèlement et la discrimination.' : 'Recours devant le conseil de prud’hommes : délai général de 2 ans à compter de la connaissance des faits permettant d’agir pour l’exécution du contrat. Des délais particuliers existent notamment pour les salaires, le harcèlement et la discrimination.' },
  ];
}

export function generateLetter(form: DisciplinaryForm, kind: LetterKind, emitter: { name: string; function: string; signature?: string }): DisciplinaryLetter {
  const dismissal = form.sanction === 'licenciement';
  const fragments: string[] = [];
  // Insert rich fields as complete paragraphs after escaping all plain template values.
  const rich = (value: string, fallback: string) => {
    fragments.push(disciplinaryBodyHasContent(value) ? disciplinaryBodyToHtml(value) : disciplinaryTextToHtml(fallback));
    return `\n\n\uE000${fragments.length - 1}\uE001\n\n`;
  };
  const detail = rich(form.sanctionDetails, '[Préciser les modalités, dates et conséquences de la sanction]');
  const facts = `Le ${frenchDate(form.factsOn)}, ${form.vessel ? `à bord / sur le site ${form.vessel}, ` : ''}les faits suivants ont été relevés :${rich(form.facts, '[Décrire des faits précis, datés et personnellement imputables]')}${REASONS[form.reason].paragraph}${rich(form.evidence, '[Préciser les constats, témoignages et preuves licitement recueillis]')}Obligations professionnelles concernées :${rich(form.rules, '[Identifier les obligations, le règlement intérieur ou les consignes applicables]')}`;
  let subject: string, body: string;
  if (kind === 'convocation') {
    subject = `Convocation à un entretien préalable à une éventuelle ${dismissal ? 'mesure de licenciement' : 'sanction disciplinaire'}`;
    const assistance = dismissal && !form.representatives
      ? `Vous pouvez être assisté(e) par une personne de votre choix appartenant au personnel de l’entreprise ou par un conseiller du salarié inscrit sur la liste départementale. Cette liste peut être consultée aux adresses suivantes : ${form.advisorAddresses || '[Adresses de l’inspection du travail et de la mairie compétentes]'}.`
      : 'Vous pouvez être assisté(e) par une personne de votre choix appartenant au personnel de l’entreprise.';
    body = `Nous envisageons à votre égard une éventuelle ${dismissal ? 'mesure de licenciement pour motif disciplinaire' : 'sanction disciplinaire'}. Aucune décision n’est prise à ce stade.\n\nNous vous invitons à un entretien le ${frenchDate(form.interviewAt)} à ${form.interviewAt.slice(11, 16) || '[heure]'}, à ${form.interviewPlace || '[lieu de l’entretien]'}. Nous vous exposerons les motifs envisagés et recueillerons vos explications.\n\n${assistance}\n\nLes éléments à examiner sont les suivants :\n${facts}`;
  } else if (kind === 'conservatoire') {
    subject = 'Notification d’une mise à pied à titre conservatoire';
    body = `Au regard des faits ci-dessous et dans l’attente de la décision à intervenir, nous vous informons de votre mise à pied à titre conservatoire, prenant effet selon les modalités suivantes : ${detail}\n\nCette mesure provisoire ne constitue pas une sanction disciplinaire et ne préjuge pas de la décision finale. Une procédure disciplinaire est engagée sans délai ; les modalités de votre entretien vous sont communiquées par convocation distincte. Le traitement de la rémunération sera régularisé selon l’issue de la procédure et les règles applicables.\n\n${facts}`;
  } else {
    const sanctionSubjects = { avertissement: 'Notification d’un avertissement', blame: 'Notification d’un blâme', mise_a_pied: 'Notification d’une mise à pied disciplinaire', mutation: 'Proposition de mutation disciplinaire', retrogradation: 'Proposition de rétrogradation', licenciement: `Notification de licenciement pour ${FAULTS[form.fault].label.toLowerCase()}` };
    subject = sanctionSubjects[form.sanction];
    const hearing = requiresInterview(form) ? `À la suite de l’entretien préalable du ${frenchDate(form.interviewAt)}, nous avons examiné vos explications : ${form.explanations || '[Restituer les explications ou constater l’absence à l’entretien]'}.\n\n` : '';
    const decision = dismissal
      ? `Nous vous notifions votre licenciement pour ${FAULTS[form.fault].label.toLowerCase()}. ${form.fault === 'simple' ? `Les modalités du préavis et les indemnités applicables sont les suivantes : ${detail}` : `Les circonstances qui rendent votre maintien impossible, même pendant le préavis, sont les suivantes : ${detail} La rupture intervient sans préavis ni indemnité légale de licenciement, sous réserve des dispositions plus favorables applicables. Les congés payés acquis non pris restent indemnisables.`}${form.fault === 'lourde' ? `\nL’intention de nuire à l’employeur est caractérisée par les éléments distincts suivants : ${form.harmfulIntent || '[Établir l’intention de nuire]'}.` : ''}\nLes documents de fin de contrat vous seront remis selon les modalités convenues.`
      : ['mutation', 'retrogradation'].includes(form.sanction) ? `Nous vous proposons une ${SANCTIONS[form.sanction].label.toLowerCase()} selon les modalités suivantes : ${detail} Si cette mesure modifie votre contrat, elle ne sera appliquée qu’après votre accord exprès. Nous vous invitons à nous faire connaître votre réponse écrite dans le délai indiqué ci-dessus.`
        : form.sanction === 'mise_a_pied' ? `Nous vous notifions une mise à pied disciplinaire selon les modalités suivantes : ${detail} La suspension du contrat et de la rémunération est limitée à cette période et respecte la durée maximale autorisée par le règlement intérieur.`
          : `Nous vous notifions un ${SANCTIONS[form.sanction].label.toLowerCase()}.${disciplinaryBodyHasContent(form.sanctionDetails) ? ` Modalités de la sanction : ${detail}` : ' '}Nous vous demandons de respecter les obligations et consignes rappelées ci-dessus et de ne pas réitérer les manquements établis.`;
    body = `${hearing}${facts}\n\nAprès examen des faits établis, de leur contexte et de leur proportionnalité, ${decision[0].toLowerCase()}${decision.slice(1)}`;
  }
  const bodyHtml = disciplinaryTextToHtml(`Madame, Monsieur,\n\n${body}\n\nVeuillez agréer, Madame, Monsieur, l’expression de nos salutations distinguées.`)
    .replace(/<p>\uE000(\d+)\uE001<\/p>/g, (_, index: string) => fragments[Number(index)] || '');
  return { kind, date: todayParis(), subject, body: bodyHtml, employeeName: form.employeeName, address: form.address, emitterName: emitter.name, emitterFunction: emitter.function, signatureDataUrl: emitter.signature || '', reviewedForm: formFingerprint(form) };
}

export function letterIssues(form: DisciplinaryForm, letter: DisciplinaryLetter): string[] {
  const errors: string[] = [];
  if (!isLetterReviewed(form, letter)) errors.push('La préparation a changé : relire et adapter le courrier, puis confirmer sa relecture ou régénérer le modèle.');
  if (!letter.subject.trim() || !disciplinaryBodyHasContent(letter.body)) errors.push('Renseigner l’objet et le corps du courrier.');
  if (!letter.employeeName.trim() || !letter.address.trim()) errors.push('Renseigner le nom et l’adresse du collaborateur.');
  if (!letter.emitterName.trim() || !letter.emitterFunction.trim()) errors.push('Renseigner le nom et la fonction de l’émetteur.');
  if (!letter.signatureDataUrl) errors.push('Ajouter la signature de l’émetteur avant de classer le courrier final.');
  if (!disciplinaryBodyHasContent(form.facts) || !disciplinaryBodyHasContent(form.evidence) || !disciplinaryBodyHasContent(form.rules)) errors.push('Préciser les faits, leurs éléments justificatifs et les obligations applicables.');
  if (!form.factsOn || !form.knownOn || !letter.date) errors.push('Renseigner les dates des faits, de leur connaissance et du courrier.');
  if (/\[[^\]]+\]/.test(disciplinaryBodyToPlainText(letter.body))) errors.push('Compléter les passages entre crochets du modèle.');
  if (form.sanction === 'licenciement' && !/^cdi$/i.test(form.contractType.trim())) errors.push('Le modèle de licenciement nécessite un CDI confirmé ; faire adapter la procédure pour un autre contrat.');
  if (form.protectedEmployee && form.sanction === 'licenciement' && letter.kind === 'notification') errors.push('Salarié protégé : adapter le courrier après la procédure spéciale et l’autorisation administrative ; ce modèle générique ne suffit pas.');
  if (form.fault === 'lourde' && !form.harmfulIntent.trim()) errors.push('Documenter séparément l’intention de nuire pour une faute lourde.');
  if ((letter.kind === 'convocation' || (letter.kind === 'notification' && requiresInterview(form))) && (!form.interviewAt || !form.interviewPlace)) errors.push('Renseigner la date, l’heure et le lieu de l’entretien.');
  if (form.factsOn > form.knownOn) errors.push('La connaissance des faits ne peut précéder les faits.');
  if (form.sanction === 'licenciement' && letter.kind === 'convocation' && !form.representatives && !form.advisorAddresses.trim()) errors.push('Indiquer les adresses où consulter la liste des conseillers du salarié.');
  const dates = deadlines(form);
  const notificationDate = form.notificationOn || letter.date;
  if (letter.kind === 'notification' && form.notificationOn && form.notificationOn < letter.date) errors.push('L’envoi ne peut précéder la date du courrier.');
  if (letter.kind === 'convocation' && form.summonsSentOn && form.summonsSentOn < letter.date) errors.push('L’envoi de la convocation ne peut précéder la date du courrier.');
  if (form.summonsSentOn && form.summonsReceivedOn && form.summonsSentOn > form.summonsReceivedOn) errors.push('La remise de la convocation ne peut précéder son envoi.');
  if (letter.kind === 'notification' && requiresInterview(form) && !form.summonsSentOn) errors.push('Renseigner la date d’envoi ou de remise de la convocation pour vérifier l’engagement de la procédure.');
  if (letter.kind === 'notification' && form.sanction === 'licenciement' && !form.summonsReceivedOn) errors.push('Renseigner la première présentation ou remise de la convocation au licenciement.');
  if (dates.initiateBy && ((letter.kind === 'convocation' && letter.date > dates.initiateBy)
    || (form.summonsSentOn && form.summonsSentOn > dates.initiateBy)
    || (letter.kind === 'notification' && !requiresInterview(form) && notificationDate > dates.initiateBy))) errors.push('Le délai initial de 2 mois est dépassé : faire vérifier les exceptions et adapter le dossier.');
  if (dates.interviewFrom && form.interviewAt && form.interviewAt.slice(0, 10) < dates.interviewFrom) errors.push('L’entretien ne respecte pas le délai de 5 jours ouvrables.');
  if (letter.kind === 'notification' && dates.notifyFrom && (letter.date < dates.notifyFrom || notificationDate < dates.notifyFrom)) errors.push('La notification est datée avant la fin du délai de réflexion.');
  if (letter.kind === 'notification' && dates.notifyBy && notificationDate > dates.notifyBy) errors.push('La notification dépasse le délai d’un mois : vérifier les exceptions avant de poursuivre.');
  return errors;
}
