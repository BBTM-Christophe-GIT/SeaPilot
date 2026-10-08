// Transcribed from the user's inspection notice. Codes identify a different check for each accessory.
export const CONTROL_CODES = ['EG', 'ID', 'NID', 'V1', 'V2', 'V3', 'V4', 'V5'] as const;
export type ControlCode = typeof CONTROL_CODES[number];
export type AccessoryCode = 'SH' | 'HK' | 'SL' | 'CH' | 'WI' | 'RO' | 'PU' | 'HC' | 'TL' | 'AN' | 'PN' | 'GP';
export type TowingType = 'chain_bridle' | 'textile_line' | 'towing_wire' | 'winch_wire' | 'textile_bridle';
export interface AccessoryItem { material_type: string; towing_type?: TowingType | null; description?: string }
export interface ControlText { fr: string; en: string }
export interface AccessoryDefinition {
  code: AccessoryCode; fr: string; en: string; aliases: string[];
  checks: Partial<Record<ControlCode, ControlText>>;
}
const point = (fr: string, en: string): ControlText => ({ fr, en });
const markedId = point('Présence du marquage de la CMU et du numéro de série ou d’identification.', 'Presence of the SWL marking and serial or identification number.');
export const ACCESSORIES: AccessoryDefinition[] = [
  { code: 'SH', fr: 'Manilles', en: 'Shackles', aliases: ['Manille'], checks: {
    EG: point('État de l’anneau : absence d’étirement, usure, fissure, déformation, choc, corrosion et défaut de taraudage.', 'Shackle body: no stretching, wear, cracks, deformation, impact damage, corrosion or internal thread defects.'),
    ID: markedId,
    V1: point('Axe : absence d’étirement, usure, fissure, déformation, choc, corrosion et défaut de filetage. Axe droit ; tous les filets de l’axe vissé complètement engagés.', 'Pin: no stretching, wear, cracks, deformation, impact damage, corrosion or thread defects. The pin must be straight and all screw-pin threads fully engaged.'),
  } },
  { code: 'HK', fr: 'Crocs', en: 'Hooks', aliases: ['Croc', 'Crochet'], checks: {
    EG: point('État du croc : absence d’étirement, usure, fissure, déformation, choc et corrosion.', 'Hook condition: no stretching, wear, cracks, deformation, impact damage or corrosion.'),
    ID: markedId,
    V1: point('Présence et fonctionnement du linguet de sécurité.', 'Presence and operation of the safety latch.'),
  } },
  { code: 'SL', fr: 'Élingues / Sangles textiles', en: 'Textile slings', aliases: ['Élingue', 'Elingue', 'Élingues', 'Sangle', 'Sangles', 'Élingues/Sangles'], checks: {
    EG: point('État de l’enveloppe / sangle : absence de détérioration distincte de l’usure générale.', 'Sleeve / webbing condition: no deterioration other than general wear.'),
    ID: point('Présence de la plaque / étiquette constructeur, du numéro d’identification et de la CMU.', 'Presence of the manufacturer’s plate / label, identification number and SWL.'),
    V1: point('Enveloppe : absence de coupure longitudinale ou transversale ; fils porteurs non visibles.', 'Sleeve: no longitudinal or transverse cuts; load-bearing fibres must not be exposed.'),
    V2: point('Coutures : absence de détérioration.', 'Stitching: no deterioration.'),
    V3: point('Absence de dommage causé par la chaleur ou de brûlure.', 'No heat damage or burns.'),
    V4: point('Absence de souillure importante par des hydrocarbures ou de traces de produits chimiques.', 'No significant oil contamination or traces of chemicals.'),
    V5: point('Attaches / extrémités des sangles : absence de déformation, fissure et usure.', 'Webbing attachments / ends: no deformation, cracks or wear.'),
  } },
  { code: 'CH', fr: 'Chaînes', en: 'Chains', aliases: ['Chaîne', 'Chaine'], checks: {
    EG: point('État de la chaîne : absence de déformation, fissure, corrosion et entaille.', 'Chain condition: no deformation, cracks, corrosion or notches.'),
    ID: markedId,
    V1: point('Maillons de la chaîne de levage : usure < 10 % des dimensions d’origine ; allongement de la longueur des maillons < 5 %.', 'Load-chain links: wear < 10% of original dimensions; link length elongation < 5%.'),
    V2: point('Articulation libre des maillons de la chaîne de levage entre eux.', 'Load-chain links must articulate freely with each other.'),
  } },
  { code: 'WI', fr: 'Câbles', en: 'Wire ropes', aliases: ['Câble', 'Cable'], checks: {
    EG: point('État du câble : absence de déformation, écrasement, fils / torons cassés, coques, corrosion externe et interne, décoloration.', 'Wire-rope condition: no deformation, crushing, broken wires / strands, kinks, external or internal corrosion, or discolouration.'),
    ID: point('Présence du certificat du câble avec CMU et numéro de série ou d’identification.', 'Presence of the wire-rope certificate stating the SWL and serial or identification number.'),
    V1: point('Vérification de l’âme du câble, si elle existe.', 'Check the wire-rope core, where present.'),
    V2: point('Réduction du diamètre du câble : < 10 % pour un câble standard et < 3 % pour un câble antigiratoire.', 'Wire-rope diameter reduction: < 10% for standard rope and < 3% for rotation-resistant rope.'),
  } },
  { code: 'AN', fr: 'Anneaux de levage', en: 'Lifting rings', aliases: ['Anneau', 'Anneaux'], checks: {
    EG: point('Absence de fissures, rayures profondes, corrosion excessive et déformations. Anneau ni tordu ni ouvert.', 'No cracks, deep scratches, excessive corrosion or deformation. The ring must not be twisted or open.'),
    ID: point('Présence de la plaque / étiquette constructeur, du numéro d’identification et de la CMU.', 'Presence of the manufacturer’s plate / label, identification number and SWL.'),
  } },
  { code: 'PN', fr: 'Pinces à tôles', en: 'Plate lifting clamps', aliases: ['Pince', 'Pinces', 'Pinces de levage'], checks: {
    EG: point('Corps, soudures et zones contraintes : absence de fissures, torsion, déformation ou ouverture anormale. Œillet / manille d’articulation sans ovalisation, allongement ni axe plié.', 'Body, welds and stressed areas: no cracks, twisting, deformation or abnormal opening. Lifting eye / pivot shackle: no ovalisation, elongation or bent pin.'),
    ID: point('CMU et capacité d’ouverture (épaisseur de tôle admissible) parfaitement lisibles sur la plaque ou le corps de la pince.', 'SWL and jaw opening capacity (permitted plate thickness) clearly legible on the plate or clamp body.'),
    V1: point('Mâchoires : dents et cannelures ni émoussées, ébréchées, aplaties ni encrassées. Retirer limaille, peinture, graisse et huile entre came et base. Came pivotant librement sans point dur.', 'Jaws: teeth and grooves must not be blunt, chipped, flattened or fouled. Remove swarf, paint, grease and oil between cam and base. The cam must pivot freely without tight spots.'),
    V2: point('Verrouillage initial fonctionnel, ni trop dur ni trop mou. Ressorts ni détendus, cassés, déformés ni corrodés. Contrôler l’usure et le jeu des axes selon le fabricant (exemple indiqué : 0,5 mm). Ouverture et mouvement libres ; lubrifier le mécanisme selon ses préconisations.', 'Initial locking operates correctly, neither too stiff nor too loose. Springs must not be slack, broken, deformed or corroded. Check pin wear and clearance against manufacturer limits (stated example: 0.5 mm). Free opening and movement; lubricate as instructed.'),
    V3: point('Poids et épaisseur de la tôle compatibles avec la capacité de la pince. Respecter la charge minimale de serrage prescrite par le fabricant, lorsqu’elle existe (exemple indiqué : 10 % de la CMU).', 'Plate weight and thickness compatible with clamp capacity. Observe the manufacturer’s minimum gripping load where specified (stated example: 10% of SWL).'),
  } },
  // The workbook identifies grapples, but no inspection notice has been supplied yet.
  { code: 'GP', fr: 'Grappins', en: 'Grapples', aliases: ['Grappin'], checks: {} },
  { code: 'RO', fr: 'Aussières textiles', en: 'Ropes', aliases: ['Aussière', 'Aussière textile'], checks: {} },
  { code: 'PU', fr: 'Moufles et poulies de retour', en: 'Blocks and return pulleys', aliases: ['Poulie', 'Poulies', 'Moufle'], checks: {
    EG: point('État général : absence de fissure, déformation, corrosion et usure excessive.', 'General condition: no cracks, deformation, corrosion or excessive wear.'),
    ID: markedId,
    V1: point('Réa : absence d’impact, voile, difficulté de roulement, déformation, corrosion et usure excessive.', 'Sheave: no impact damage, wobble, rolling difficulty, deformation, corrosion or excessive wear.'),
    V2: point('Crochet : absence de fissure, déformation, corrosion et entaille ; présence et fonctionnement du linguet de sécurité.', 'Hook: no cracks, deformation, corrosion or notches; safety latch present and operational.'),
  } },
  { code: 'HC', fr: 'Palans à chaîne et tireforts manuels', en: 'Chain hoists and manual wire-rope pullers', aliases: ['Palan', 'Palan à chaîne', 'Tirefort'], checks: {
    EG: point('Carter : absence de déformation.', 'Housing: no deformation.'),
    ID: point('Présence de la plaque / étiquette constructeur et de la CMU.', 'Presence of the manufacturer’s plate / label and SWL.'),
    V1: point('Noix et guide-chaîne : absence de déformation, fissure et usure.', 'Load-chain wheel and chain guide: no deformation, cracks or wear.'),
    V2: point('Crochets : absence de déformation, fissure et corrosion. Chaîne de levage : absence de déformation, fissure, corrosion et entaille ; usure < 10 % des dimensions d’origine, allongement des maillons < 5 %, articulation libre.', 'Hooks: no deformation, cracks or corrosion. Load chain: no deformation, cracks, corrosion or notches; wear < 10% of original dimensions, link elongation < 5%, free articulation.'),
    V3: point('Chaîne de manœuvre : absence de déformation, fissure et corrosion.', 'Hand chain: no deformation, cracks or corrosion.'),
    V4: point('Essai de fonctionnement à la CMU : fonctionnement libre de la chaîne de manœuvre sans point dur, limiteurs de course haut et bas, essai à charge nominale.', 'Functional test at SWL: hand chain runs freely without tight spots; upper and lower travel limiters; test at rated load.'),
  } },
  { code: 'TL', fr: 'Remorque', en: 'Towing line', aliases: ['Remorques', 'Towing line'], checks: {} },
];
const baseChecks = (code: AccessoryCode) => ACCESSORIES.find((type) => type.code === code)!.checks;
const chain = baseChecks('CH'); const wire = baseChecks('WI'); const textile = baseChecks('SL');
// Applicability supplied explicitly by the verifier. Descriptions follow the corresponding material notice.
export const TOWING_TYPES: { key: TowingType; fr: string; en: string; checks: AccessoryDefinition['checks'] }[] = [
  { key: 'chain_bridle', fr: 'Patte d’oie chaîne de remorquage', en: 'Chain towing bridle', checks: { EG: chain.EG, NID: chain.ID, V1: chain.V1, V2: chain.V2 } },
  { key: 'textile_line', fr: 'Remorque textile', en: 'Textile towing line', checks: {
    EG: point('État de la remorque textile : absence de détérioration distincte de l’usure générale.', 'Textile towing-line condition: no deterioration other than general wear.'), NID: textile.ID,
  } },
  { key: 'towing_wire', fr: 'Câble de remorquage', en: 'Towing wire', checks: { EG: wire.EG, NID: wire.ID } },
  { key: 'winch_wire', fr: 'Câble de treuil', en: 'Winch wire', checks: { EG: wire.EG, NID: wire.ID } },
  { key: 'textile_bridle', fr: 'Patte d’oie textile', en: 'Textile towing bridle', checks: { EG: textile.EG, NID: textile.ID, V1: textile.V1, V2: textile.V2, V3: textile.V3, V4: textile.V4, V5: textile.V5 } },
];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function accessoryDefinition(materialType: string): AccessoryDefinition | undefined {
  const normalized = normalize(materialType);
  return ACCESSORIES.find((type) => [type.code, type.fr, ...type.aliases].some((alias) => normalize(alias) === normalized));
}
export function itemDefinition(item: AccessoryItem): AccessoryDefinition | undefined {
  const definition = accessoryDefinition(item.material_type);
  if (definition?.code !== 'TL') return definition;
  const towing = TOWING_TYPES.find((type) => type.key === item.towing_type);
  return towing ? { ...definition, ...towing } : definition;
}
export function applicableCodes(item: string | AccessoryItem): ControlCode[] {
  const definition = typeof item === 'string' ? accessoryDefinition(item) : itemDefinition(item);
  return CONTROL_CODES.filter((code) => definition?.checks[code]);
}
export function groupByAccessory<T>(rows: T[], itemOf: (row: T) => AccessoryItem & { reference: string }) {
  const groups = new Map<string, { definition?: AccessoryDefinition; label: string; rows: T[] }>();
  for (const row of rows) {
    const item = itemOf(row); const definition = itemDefinition(item);
    const key = definition?.fr || item.material_type;
    if (!groups.has(key)) groups.set(key, { definition, label: definition?.fr || item.material_type, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr')).map((group) => ({ ...group,
    rows: group.rows.sort((a, b) => itemOf(a).reference.localeCompare(itemOf(b).reference, 'fr', { numeric: true })),
  }));
}
