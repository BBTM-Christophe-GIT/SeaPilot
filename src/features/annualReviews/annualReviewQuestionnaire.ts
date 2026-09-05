export const ANNUAL_REVIEW_TITLE = 'Entretien Professionnel et d’Evaluation';

export const ANNUAL_REVIEW_RATINGS = [
  'Non Applicable',
  'Très faible',
  'Faible',
  'Moyen',
  'Bon',
  'Excellent',
] as const;

export const ANNUAL_REVIEW_SATISFACTION = [
  'très satisfait',
  'satisfait',
  'peu satisfait',
  'insatisfait',
] as const;

export const ANNUAL_REVIEW_EVOLUTION_CHOICES = [
  '1. Poursuivre tel qu’aujourd’hui',
  '2. Changer de poste au sein de BBTM',
  '3. Aller en formation',
  '4. Changer de compagnie',
  '5. Changer de voie professionnelle',
] as const;

export interface EvaluationQuestion {
  id: string;
  label: string;
}

export interface EvaluationGroup {
  id: string;
  label: string;
  questions: EvaluationQuestion[];
}

export const ANNUAL_REVIEW_EVALUATION_GROUPS: EvaluationGroup[] = [
  {
    id: 'bridge', label: 'A. Compétences Passerelle', questions: [
      { id: 'bridge_manoeuvres', label: 'Manœuvres & règles de barre' },
      { id: 'bridge_management', label: "Management de l'équipage" },
      { id: 'bridge_certificates', label: 'Suivi des certificats' },
      { id: 'bridge_calls', label: 'Gestion administrative des escales (FALs)' },
    ],
  },
  {
    id: 'engine', label: 'B. Compétences Machine / Entretien', questions: [
      { id: 'engine_operation', label: 'Conduite de la machine' },
      { id: 'engine_breakdowns', label: 'Gestion des avaries' },
      { id: 'engine_inventory', label: 'Gestion des commandes et inventaires' },
      { id: 'engine_lifting', label: 'Opérations de levage' },
      { id: 'engine_deck', label: 'Apparaux de pont' },
      { id: 'engine_maintenance', label: 'Entretien et réparation' },
    ],
  },
  {
    id: 'qhse', label: 'C. Compétences QHSE', questions: [
      { id: 'qhse_policy', label: 'Respect de la politique de la compagnie' },
      { id: 'qhse_sms', label: "Participe à l'évolution et à la mise en place du SMS" },
      { id: 'qhse_procedures', label: 'Respect des procédures de travail et de la hiérarchie' },
      { id: 'qhse_ppe', label: 'Port et entretien des EPIs' },
    ],
  },
  {
    id: 'administrative', label: 'D. Compétences administratives', questions: [
      { id: 'admin_english', label: 'Langue étrangère : Anglais' },
      { id: 'admin_reporting', label: 'Remplissage des documents de bord et reporting de la compagnie' },
      { id: 'admin_writing', label: "Rédaction d'emails et production d'écrits" },
      { id: 'admin_it', label: 'Outils informatiques' },
      { id: 'admin_certificates', label: 'Suivi des brevets et qualifications' },
    ],
  },
  {
    id: 'behaviour', label: 'E. Savoir être au travail', questions: [
      { id: 'behaviour_clients', label: 'Relationnel avec les clients' },
      { id: 'behaviour_team', label: 'Capacité à collaborer avec l’équipage' },
      { id: 'behaviour_image', label: 'Implication personnelle dans la bonne image de la compagnie' },
      { id: 'behaviour_initiative', label: "Esprit d'initiative et anticipation" },
    ],
  },
];

export const ANNUAL_REVIEW_ESG_PROMPTS = [
  {
    id: 'environment',
    label: 'Impact Environnemental',
    help: "La manière dont l’entreprise se comporte vis-à-vis de l’environnement, et prend en compte le changement climatique, l'épuisement des ressources, la gestion des déchets et la pollution.",
  },
  {
    id: 'social',
    label: 'Social',
    help: "La manière dont l’entreprise gère ses relations avec ses employés, fournisseurs et clients, et plus globalement la communauté, au travers de ses pratiques en matière de diversité, des droits de l'homme et de protection des consommateurs.",
  },
  {
    id: 'governance',
    label: 'Gouvernance',
    help: "La manière dont l’entreprise est dirigée, l’existence d’audits externes, ainsi que les questions d’éthique dans les pratiques commerciales.",
  },
  { id: 'other', label: 'Autres', help: '' },
] as const;

export const ANNUAL_REVIEW_WORK_CONDITIONS = [
  ['missions', 'Les missions'],
  ['compensation', 'La rémunération'],
  ['recognition', 'La reconnaissance'],
  ['crew', 'Mon équipage'],
  ['rhythm', 'Le rythme'],
  ['position', 'Mon poste'],
] as const;

export const ANNUAL_REVIEW_TABS = [
  ['guide', 'Guide'],
  ['evaluation', '1. Évaluation'],
  ['esg', '2. ESG'],
  ['life', '3. Vie entreprise'],
  ['evolution', '4. Évolution'],
  ['objectives', '5. Objectifs'],
] as const;

export type AnnualReviewTabKey = (typeof ANNUAL_REVIEW_TABS)[number][0];

export interface AnnualReviewAnswers {
  evaluation: Record<string, { rating: string; comment: string }>;
  esg: Record<string, string>;
  life: { overall: string; conditions: Record<string, string>; why: string };
  evolution: { choice: string; desiredPosition: string; desiredTraining: string; reasons: string; other: string };
  objectives: string;
}

export function emptyAnnualReviewAnswers(): AnnualReviewAnswers {
  return {
    evaluation: {},
    esg: {},
    life: { overall: '', conditions: {}, why: '' },
    evolution: { choice: '', desiredPosition: '', desiredTraining: '', reasons: '', other: '' },
    objectives: '',
  };
}

export function annualReviewValidationErrors(answers: AnnualReviewAnswers): string[] {
  const errors: string[] = [];
  const missingRatings = ANNUAL_REVIEW_EVALUATION_GROUPS
    .flatMap((group) => group.questions)
    .filter((question) => !answers.evaluation[question.id]?.rating);
  if (missingRatings.length) errors.push(`${missingRatings.length} critère(s) d’évaluation sans réponse.`);
  if (!answers.life.overall) errors.push('La satisfaction générale doit être renseignée.');
  const missingConditions = ANNUAL_REVIEW_WORK_CONDITIONS.filter(([id]) => !answers.life.conditions[id]);
  if (missingConditions.length) errors.push(`${missingConditions.length} condition(s) de travail sans réponse.`);
  if (!answers.evolution.choice) errors.push('Le souhait d’évolution doit être renseigné.');
  if (answers.evolution.choice.startsWith('2.') && !answers.evolution.desiredPosition.trim()) {
    errors.push('Le poste souhaité doit être précisé.');
  }
  if (answers.evolution.choice.startsWith('3.') && !answers.evolution.desiredTraining.trim()) {
    errors.push('La formation souhaitée doit être précisée.');
  }
  if (/^[45]\./u.test(answers.evolution.choice) && !answers.evolution.reasons.trim()) {
    errors.push('La raison du souhait d’évolution doit être précisée.');
  }
  if (!answers.objectives.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' ').trim()) {
    errors.push('Les objectifs personnels pour l’année N+1 sont requis.');
  }
  return errors;
}

export const ANNUAL_REVIEW_GUIDE = [
  {
    title: "1. Objectif de l'entretien",
    paragraphs: [
      "L’entretien professionnel et d’évaluation constitue une étape stratégique dans la gestion des parcours et des compétences au sein de BBTM. Ce guide vous aide à en comprendre la portée et à vous y préparer dans les meilleures conditions.",
      "L’entretien se décline en quatre volets complémentaires : évaluation des résultats et compétences, performances environnementales/sociales/de gouvernance, vie dans l’entreprise, puis perspectives d’évolution et besoins en formation.",
    ],
  },
  {
    title: "2. Comment préparer l'entretien ?",
    subsections: [
      { title: "Entretien d'évaluation", body: 'Préparez un bilan factuel de vos réalisations, avec des exemples concrets. Identifiez vos points forts, les difficultés rencontrées et des solutions.' },
      { title: 'Volet Environnement, Social et Gouvernance', body: 'Réfléchissez aux pratiques qui réduisent l’impact environnemental, aux initiatives responsables déjà menées et aux actions d’amélioration à proposer.' },
      { title: 'Vie dans l’entreprise', body: 'Préparez un retour honnête et constructif sur votre quotidien, vos attentes et vos ambitions à court, moyen et long terme.' },
      { title: 'Évolution / Entretien professionnel', body: 'Listez les formations utiles, les postes ou responsabilités souhaités et les exemples qui justifient ces besoins.' },
    ],
  },
  {
    title: "3. Au jour de l'entretien",
    bullets: [
      'Relisez vos objectifs précédents et leurs résultats.',
      'Préparez des exemples concrets pour illustrer vos compétences.',
      'Réfléchissez à vos attentes et à vos besoins en formation.',
      'Familiarisez-vous avec la politique BBTM.',
    ],
  },
] as const;
