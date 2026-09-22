export const CHAPTERS = [
  ['01', '01 - Généralités'],
  ['02', "02 - Politique en Matière de Sécurité et de Protection de l'Environnement"],
  ['03', '03 - Responsabilité et Autorité de la Compagnie'],
  ['04', '04 - Personne(s) Désignée(s)'],
  ['05', '05 - Responsabilité et Autorité du Capitaine'],
  ['06', '06 - Ressources et Personnel'],
  ['07', '07 - Établissement de Plans pour les Opérations à Bord'],
  ['08', "08 - Préparation aux Situations d'Urgence"],
  ['09', '09 - Rapports et Analyse des Non-conformités, Accidents et Incidents'],
  ['10', '10 - Maintenance du Navire et de son Équipement'],
  ['11', '11 - Documentation'],
  ['12', '12 - Vérification, Examen et Évaluation de la Compagnie'],
  ['13', '13 - Certification, Vérification et Contrôle'],
  ['uncontrolled', 'Documents non contrôlés'],
  ['unassigned', 'ISM - Chapitre non renseigné'],
] as const;

export type ProcedureChapterKey = typeof CHAPTERS[number][0];

export function chapterKey(value: string): ProcedureChapterKey {
  const match = value.match(/^\s*(0[1-9]|1[0-3])/);
  if (match) return match[1] as ProcedureChapterKey;
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('non controle') ? 'uncontrolled' : 'unassigned';
}
