export const LIFTING_SECTIONS = [
  { key: 'lifting', path: 'apparaux', title: 'Registre des Apparaux de levage', description: 'Les équipements à bord, leur état et leurs contrôles.' },
  { key: 'towing', path: 'remorques', title: 'Registre des Remorques', description: 'Les lignes et accessoires de remorquage, leur état et leurs contrôles.' },
  { key: 'crane', path: 'grue', title: 'Examen à Fond - Grue', description: 'Structure, équipements et essais.' },
] as const;

export type LiftingSection = typeof LIFTING_SECTIONS[number]['key'];
