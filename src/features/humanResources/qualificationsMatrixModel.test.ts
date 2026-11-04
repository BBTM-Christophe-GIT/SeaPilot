// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HR_SEDENTARY_FUNCTIONS, type HrDocumentRecord, type HrDocumentTypeOption, type PersonRecord } from './peopleQueries';
import {
  buildQualificationsMatrix,
  isQualificationsMatrixSeafarer,
  QUALIFICATIONS_MATRIX_CATEGORIES,
  QUALIFICATIONS_MATRIX_STATUS_LABELS,
} from './qualificationsMatrixModel';

function person(id: number, patch: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id, userId: null, firstName: 'Camille', lastName: 'DEMO', email: 'PRIVATE_EMAIL',
    functionLabel: 'Matelot polyvalent', enimFunctionCode: '', enimCategory: null, gradeLabel: '',
    roleLabel: 'Navigant', registerLabel: '', sex: '', sailorNumber: '', employeeNumber: '',
    phone: 'PRIVATE_PHONE', postalAddress: 'PRIVATE_ADDRESS', birthDate: '', birthPlace: '',
    identityDocumentNumber: 'PRIVATE_IDENTITY', identityDocumentType: '', contractType: '',
    hiredOn: '2024-01-01', departedOn: '', departureReason: '', emergencyContactName: 'PRIVATE_CONTACT',
    emergencyContactRelationship: '', emergencyContactPhone: '', emergencyContactAddress: '',
    waistSize: '', chestSize: '', fullHeightSize: '', inseamSize: '', hipSize: '', weightKg: '',
    shoeSize: '', coverallSize: '', pantsSize: '', jacketSize: '', deckCertificateLabel: '',
    engineCertificateLabel: '', craneTrainingOn: '', craneInductionOn: '', active: true,
    ...patch,
  };
}

function document(id: number, patch: Partial<HrDocumentRecord> = {}): HrDocumentRecord {
  return {
    id, personId: 1, personName: 'Camille DEMO', personSharePointItemId: 'PRIVATE_SOURCE_ID',
    categoryKey: 'deck', title: 'Camille DEMO - Brevet 2025.pdf', status: 'valid',
    issuedOn: '2025-01-01', expiresOn: '2027-01-01', requiresCaptainValidation: false,
    medicalRestriction: 'PRIVATE_MEDICAL_RESTRICTION', medicalBridgeWatch: false, medicalUnfit: true,
    sourceLabel: 'PRIVATE_SOURCE', notes: 'PRIVATE_MEDICAL_NOTES', fileUrl: 'PRIVATE_FILE_URL',
    storageBucket: 'PRIVATE_BUCKET', storagePath: 'PRIVATE_STORAGE_PATH', drivePath: 'PRIVATE_DRIVE_PATH',
    driveFileId: 'PRIVATE_DRIVE_ID', driveSha256: 'PRIVATE_HASH', fileSizeBytes: 123, mimeType: 'application/pdf',
    ...patch,
  };
}

const visibleCategoryKeys = new Set<string>(QUALIFICATIONS_MATRIX_CATEGORIES.map(({ key }) => key));
const asOf = '2026-11-04';
const catalogue: HrDocumentTypeOption[] = [
  { id: 1, sourceItemId: 1, name: 'Formation de sécurité complète', fileName: 'CFBS', categoryKey: 'safety_training', categoryLabel: 'Formation de Sécurité' },
  { id: 2, sourceItemId: 2, name: 'Visite médicale de navigation', fileName: 'Visite Médicale', categoryKey: 'medical_visit', categoryLabel: 'Visite Médicale' },
];

describe('qualifications matrix population', () => {
  it.each(HR_SEDENTARY_FUNCTIONS)('excludes the office function %s even with a historical sailor number', (functionLabel) => {
    expect(isQualificationsMatrixSeafarer(person(1, { functionLabel, roleLabel: '', sailorNumber: 'DEMO-OLD' }))).toBe(false);
  });

  it.each([
    ['a primary RH function with legacy missing role', { functionLabel: '02 - Second Capitaine', roleLabel: '' }, true],
    ['a trainee seafarer', { functionLabel: 'Stagiaire', roleLabel: 'Stagiaire' }, true],
    ['an unknown marine function with a Navigant role', { functionLabel: 'Fonction spécialisée', roleLabel: 'Navigant' }, true],
    ['an unknown function with a Marin grade', { functionLabel: 'Fonction spécialisée', roleLabel: '', gradeLabel: 'Marin' }, true],
    ['an unnamed function with a sailor number', { functionLabel: '', roleLabel: '', sailorNumber: 'DEMO-123' }, true],
    ['an unknown function without marine evidence', { functionLabel: 'Fonction inconnue', roleLabel: '' }, false],
    ['a Direction role alone', { functionLabel: 'Fonction inconnue', roleLabel: 'Direction' }, false],
    ['a known marine function with Direction role', { functionLabel: 'Capitaine', roleLabel: 'Direction' }, true],
    ['an explicit sedentary role', { roleLabel: 'Sédentaire', sailorNumber: 'DEMO-OLD' }, false],
    ['an explicit sedentary grade', { gradeLabel: 'Sédentaire' }, false],
    ['an explicit sedentary register', { registerLabel: 'Sédentaire' }, false],
    ['a normalized office function', { functionLabel: ' 05 - PRESIDENT ', roleLabel: 'Navigant' }, false],
  ] as const)('classifies %s without using medical-document presence', (_label, patch, expected) => {
    expect(isQualificationsMatrixSeafarer(person(1, patch))).toBe(expected);
  });

  it('groups functions in RH order, normalizes aliases and sorts surnames before given names', () => {
    const matrix = buildQualificationsMatrix({
      people: [
        person(3, { firstName: 'Alice', lastName: 'ZOLA', functionLabel: 'Capitaine' }),
        person(4, { functionLabel: 'Second Capitaine' }),
        person(1, { firstName: 'Zoe', lastName: 'ALBERT', functionLabel: '01 - Capitaine' }),
        person(2, { firstName: 'Alice', lastName: 'ALBERT', functionLabel: 'Capitaine' }),
        person(5, { functionLabel: 'Chef Mécanicien' }),
        person(6, { functionLabel: 'Matelot Qualifié' }),
        person(7, { functionLabel: '', roleLabel: 'Marin' }),
      ], documents: [], visibleCategoryKeys, asOf,
    });
    expect(matrix.groups.map(({ functionLabel }) => functionLabel)).toEqual([
      'Capitaine', 'Chef Mécanicien', '2nd Capitaine', 'Matelot Qualifié', 'Fonction non renseignée',
    ]);
    expect(matrix.groups[0].people.map(({ personName }) => personName)).toEqual(['Alice ALBERT', 'Zoe ALBERT', 'Alice ZOLA']);
    expect(matrix.peopleCount).toBe(7);
  });

  it('includes active, archived and trainee records by default while describing employment from RH periods', () => {
    const people = [
      person(1, { active: false }),
      person(2, { departedOn: asOf, active: true }),
      person(3, { functionLabel: 'Stagiaire', roleLabel: 'Stagiaire' }),
      person(4, { hiredOn: '2027-01-01' }),
      person(5, { hiredOn: '' }),
      person(6, { hiredOn: '2020-01-01', departedOn: '2021-01-01', employmentPeriods: [
        { hiredOn: '2026-01-01', departedOn: '', contractType: 'CDI', departureReason: '' },
      ] }),
    ];
    const matrix = buildQualificationsMatrix({ people, documents: [], visibleCategoryKeys, asOf });
    const rows = matrix.groups.flatMap(({ people: groupPeople }) => groupPeople);
    expect(rows.find(({ personId }) => personId === 1)).toMatchObject({ active: false, employmentStatusLabel: 'En poste' });
    expect(rows.find(({ personId }) => personId === 2)).toMatchObject({ active: true, employmentStatusLabel: 'Ancien' });
    expect(rows.find(({ personId }) => personId === 4)?.employmentStatusLabel).toBe('À venir');
    expect(rows.find(({ personId }) => personId === 5)?.employmentStatusLabel).toBe('Non renseigné');
    expect(rows.find(({ personId }) => personId === 6)?.employmentStatusLabel).toBe('En poste');
    expect(matrix.peopleCount).toBe(6);
    const current = buildQualificationsMatrix({ people, documents: [], visibleCategoryKeys, asOf, population: 'current', includeTrainees: false });
    expect(current.groups.flatMap(({ people: groupPeople }) => groupPeople.map(({ personId }) => personId))).toEqual([6]);
  });

  it('limits current population to unarchived employment intervals, including current rehires', () => {
    const oldPeriod = { hiredOn: '2020-01-01', departedOn: '2021-01-01', contractType: 'CDD', departureReason: '' };
    const people = [
      person(1, { active: false }),
      person(2, { departedOn: asOf }),
      person(3, { departedOn: '2026-11-03' }),
      person(4, { hiredOn: '2026-11-05' }),
      person(5, { employmentPeriods: [oldPeriod,
        { hiredOn: '2026-11-05', departedOn: '', contractType: 'CDI', departureReason: '' },
      ] }),
      person(6, { hiredOn: oldPeriod.hiredOn, departedOn: oldPeriod.departedOn, employmentPeriods: [oldPeriod,
        { hiredOn: asOf, departedOn: '2026-12-01', contractType: 'CDD', departureReason: '' },
      ] }),
      person(7),
      person(8, { active: false, employmentPeriods: [oldPeriod,
        { hiredOn: asOf, departedOn: '', contractType: 'CDI', departureReason: '' },
      ] }),
      person(9, { hiredOn: '' }),
      person(10, { hiredOn: '2027-01-01', employmentPeriods: [
        { hiredOn: '2026-01-01', departedOn: '2026-12-01', contractType: 'CDD', departureReason: '' },
        { hiredOn: '2027-01-01', departedOn: '', contractType: 'CDI', departureReason: '' },
      ] }),
    ];
    const matrix = buildQualificationsMatrix({ people, documents: [], visibleCategoryKeys, asOf, population: 'current', includeTrainees: false });
    expect(matrix.groups.flatMap(({ people: groupPeople }) => groupPeople.map(({ personId }) => personId))).toEqual([6, 7, 10]);
    expect(matrix.peopleCount).toBe(3);
  });

  it.each([
    ['role', { roleLabel: 'Stagiaire', functionLabel: 'Capitaine' }],
    ['function', { roleLabel: 'Navigant', functionLabel: 'Stagiaire' }],
    ['grade', { gradeLabel: 'STAGIAIRE', functionLabel: 'Capitaine' }],
  ] as const)('excludes trainees identified by %s when the caller selects current staff without trainees', (_label, patch) => {
    const people = [person(1), person(2, patch)];
    const all = buildQualificationsMatrix({ people, documents: [], visibleCategoryKeys, asOf });
    expect(all.peopleCount).toBe(2);
    const current = buildQualificationsMatrix({ people, documents: [], visibleCategoryKeys, asOf, population: 'current', includeTrainees: false });
    expect(current.groups.flatMap(({ people: groupPeople }) => groupPeople.map(({ personId }) => personId))).toEqual([1]);
  });
});

describe('qualifications matrix documents', () => {
  it('has exactly the six requested categories in order, including explicitly empty lists', () => {
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [], visibleCategoryKeys, asOf });
    expect(matrix.categories).toEqual([
      { key: 'deck', label: 'Pont' }, { key: 'engine', label: 'Machine' },
      { key: 'safety_training', label: 'Formation de Sécurité' }, { key: 'medical_visit', label: 'Visite Médicale' },
      { key: 'safety_induction', label: 'Safety Induction' }, { key: 'lifting', label: 'Levage' },
    ]);
    expect(matrix.groups[0].people[0].categories).toEqual({
      deck: [], engine: [], safety_training: [], medical_visit: [], safety_induction: [], lifting: [],
    });
    expect(JSON.stringify(matrix)).not.toContain('Manquant');
  });

  it('uses complete catalogue names, person-prefix/year removal and the individual sheet saved status', () => {
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [
      document(1, { categoryKey: 'safety_training', title: 'Camille DEMO - CFBS 2025.pdf', status: 'valid', expiresOn: '2001-02-03' }),
      document(2, { categoryKey: 'medical_visit', title: 'Camille DEMO - Visite Médicale 2026.pdf', status: 'renew_due' }),
      document(3, { categoryKey: 'deck', title: 'Camille DEMO - CFBS 2025.pdf', status: 'pending_validation' }),
    ], documentTypes: catalogue, visibleCategoryKeys, asOf });
    const categories = matrix.groups[0].people[0].categories;
    expect(categories.safety_training).toEqual([{
      documentId: 1, title: 'Formation de sécurité complète', expiresOn: '2001-02-03', expiresOnLabel: '03/02/2001', status: 'valid', statusLabel: 'À jour',
    }]);
    expect(categories.medical_visit[0]).toMatchObject({ title: 'Visite médicale de navigation', statusLabel: 'À renouveler' });
    expect(categories.deck[0]).toMatchObject({ title: 'CFBS', statusLabel: 'Validation' });
  });

  it.each([
    'Léa-Anne DU RIVAGE - CFBS - 2027.pdf',
    'DU RIVAGE Léa-Anne - CFBS - 2027.pdf',
    'lea anne du rivage–CFBS–2027.PDF',
    'Léa-Anne DU RIVAGE–CFBS–2027.pdf'.normalize('NFD'),
    'DU_RIVAGE_LEA_ANNE_CFBS_2027.pdf',
    '  Léa-Anne   DU RIVAGE-CFBS-2027.pdf',
    'DU RIVAGE - CFBS - 2027.pdf',
    'CFBS - 2027.pdf',
    'Léa-Anne DU RIVAGE - CFBS - Certificat de Formation de Base à la Sécurité - 2027.pdf',
  ])('resolves the full same-category catalogue label for the historical title %s', (title) => {
    const fullName = 'CFBS - Certificat de Formation de Base à la Sécurité';
    const profile = person(1, { firstName: 'Léa-Anne', lastName: 'DU RIVAGE' });
    const matrix = buildQualificationsMatrix({ people: [profile], documents: [
      document(1, { personName: 'Léa-Anne DU RIVAGE', title, categoryKey: 'safety_training' }),
    ], documentTypes: [{ ...catalogue[0], name: fullName }], visibleCategoryKeys, asOf });
    expect(matrix.groups[0].people[0].categories.safety_training[0].title).toBe(fullName);
  });

  it('recognizes both the stored historical identity and the current profile without changing either record', () => {
    const profile = person(1, { firstName: 'Léa-Anne', lastName: 'DU RIVAGE' });
    const sourceDocuments = [
      document(1, { personName: 'Alix DE LA PLAINE', title: 'Alix DE LA PLAINE – CFBS – 2027.pdf', categoryKey: 'safety_training' }),
      document(2, { personName: 'Alix DE LA PLAINE', title: 'DU RIVAGE Léa-Anne-CFBS-2027.pdf', categoryKey: 'safety_training' }),
    ];
    const before = JSON.stringify({ profile, sourceDocuments, catalogue });
    const matrix = buildQualificationsMatrix({ people: [profile], documents: sourceDocuments, documentTypes: catalogue, visibleCategoryKeys, asOf });
    expect(matrix.groups[0].people[0].categories.safety_training.map(({ title }) => title)).toEqual([
      catalogue[0].name, catalogue[0].name,
    ]);
    expect(JSON.stringify({ profile, sourceDocuments, catalogue })).toBe(before);
  });

  it('resolves every authorized person and all six categories while retaining legitimate years in catalogue labels', () => {
    const types: HrDocumentTypeOption[] = QUALIFICATIONS_MATRIX_CATEGORIES.map(({ key, label }, index) => ({
      id: index + 1, sourceItemId: index + 1, categoryKey: key, categoryLabel: label,
      fileName: `QUAL-${index + 1}`, name: `Qualification complète ${label} STCW 2010`,
    }));
    const profiles = [
      person(1, { firstName: 'Léa-Anne', lastName: 'DU RIVAGE' }),
      person(2, { firstName: 'Noé', lastName: 'DE LA PLAINE' }),
    ];
    const documents = profiles.flatMap((profile) => types.map((type, index) => document(profile.id * 10 + index, {
      personId: profile.id, personName: `${profile.firstName} ${profile.lastName}`, categoryKey: type.categoryKey,
      title: `${profile.lastName}_${profile.firstName}–${index % 2 ? type.name : type.fileName}–2027.pdf`,
    })));
    documents.push(document(99, { personId: 2, personName: 'Noé DE LA PLAINE', categoryKey: 'deck',
      title: `Noé DE LA PLAINE-${types[0].name}.pdf` }));
    const matrix = buildQualificationsMatrix({ people: profiles, documents, documentTypes: types, visibleCategoryKeys, asOf });
    expect(matrix.peopleCount).toBe(2);
    for (const row of matrix.groups.flatMap(({ people }) => people)) {
      for (const type of types) {
        const category = row.categories[type.categoryKey as keyof typeof row.categories];
        expect(category.length).toBeGreaterThan(0);
        expect(category.every(({ title }) => title === type.name)).toBe(true);
      }
    }
  });

  it('keeps confirmed historical aliases limited to their own catalogue category', () => {
    const types = [
      { ...catalogue[0], id: 10, fileName: 'CQALI', name: 'CQALI - Qualification avancée de démonstration' },
      { ...catalogue[0], id: 11, categoryKey: 'safety_induction', fileName: 'LEMS - HSE Induction', name: 'LEMS — HSE Induction complète' },
    ];
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [
      document(1, { categoryKey: 'safety_training', title: 'DEMO Camille-CQUALI-2027.pdf' }),
      document(2, { categoryKey: 'safety_induction', title: 'Camille DEMO–HSE Induction–2027.pdf' }),
      document(3, { categoryKey: 'deck', title: 'Camille DEMO-CQUALI-2027.pdf' }),
    ], documentTypes: types, visibleCategoryKeys, asOf });
    const categories = matrix.groups[0].people[0].categories;
    expect(categories.safety_training[0].title).toBe(types[0].name);
    expect(categories.safety_induction[0].title).toBe(types[1].name);
    expect(categories.deck[0].title).toBe('CQUALI');
  });

  it.each([
    ['Autorisation grue 2.5t', 'Autorisation grue 2.5t'],
    ['Autorisation grue 2.5t.pdf', 'Autorisation grue 2.5t'],
    ['Camille DEMO - Autorisation grue 2.5t - 2027.pdf', 'Autorisation grue 2.5t'],
    ['Camille DEMO - Formation Niv. II - 2027.pdf', 'Formation Niv. II'],
    ['Formation Niv. II', 'Formation Niv. II'],
    ['Camille DEMO - Méthode de qualification', 'Camille DEMO - Méthode de qualification'],
    ['Camille DEMO - Méthode de qualification.pdf', 'Camille DEMO - Méthode de qualification'],
  ])('preserves the exact genuine catalogue label for %s', (title, expected) => {
    const types = ['Autorisation grue 2.5t', 'Formation Niv. II', 'Camille DEMO - Méthode de qualification', 'Méthode de qualification']
      .map((name, index) => ({ ...catalogue[0], id: index + 1, name, fileName: name, categoryKey: 'lifting' }));
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [
      document(1, { categoryKey: 'lifting', title }),
    ], documentTypes: types, visibleCategoryKeys, asOf });
    expect(matrix.groups[0].people[0].categories.lifting[0].title).toBe(expected);
  });

  it('ignores synthetic fallback catalogue options and cleans unknown labels without guessing from other people', () => {
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [
      document(1, { categoryKey: 'safety_training', title: 'DEMO Camille–CFBS–2027.pdf' }),
      document(2, { categoryKey: 'engine', title: 'Camille DEMO_Qualification inconnue_2027.pdf' }),
      document(3, { categoryKey: 'engine', title: 'Autre Identité - Qualification inconnue - 2027.pdf' }),
    ], documentTypes: [{ ...catalogue[0], id: -1, sourceItemId: 0, name: 'Camille DEMO - CFBS - 2027' }], visibleCategoryKeys, asOf });
    const categories = matrix.groups[0].people[0].categories;
    expect(categories.safety_training[0].title).toBe('CFBS');
    expect(categories.engine.map(({ title }) => title)).toEqual([
      'Autre Identité - Qualification inconnue', 'Qualification inconnue',
    ]);
  });

  it('retains unknown or ambiguous catalogue names instead of inventing a qualification', () => {
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [
      document(1, { categoryKey: 'safety_training', title: 'Camille DEMO - CFBS.pdf' }),
      document(2, { categoryKey: 'engine', title: 'Camille DEMO - Qualification inconnue.pdf' }),
    ], documentTypes: [...catalogue, { ...catalogue[0], id: 9, name: 'Autre qualification' }], visibleCategoryKeys, asOf });
    expect(matrix.groups[0].people[0].categories.safety_training[0].title).toBe('CFBS');
    expect(matrix.groups[0].people[0].categories.engine[0].title).toBe('Qualification inconnue');
  });

  it('keeps all five statuses exactly as saved and treats absent or invalid dates as unknown', () => {
    const statuses = Object.keys(QUALIFICATIONS_MATRIX_STATUS_LABELS) as HrDocumentRecord['status'][];
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: statuses.map((status, index) => document(index + 1, {
      title: `Document ${index + 1}`, status, expiresOn: index % 2 ? '2026-02-31' : '',
    })), visibleCategoryKeys, asOf });
    const documents = matrix.groups[0].people[0].categories.deck;
    expect(documents.map(({ statusLabel }) => statusLabel)).toEqual(['À jour', 'À renouveler', 'Échu', 'Manquant', 'Validation']);
    expect(documents.every(({ expiresOn, expiresOnLabel }) => expiresOn === '' && expiresOnLabel === 'Non renseignée')).toBe(true);
    expect(JSON.stringify(matrix)).not.toContain('Sans échéance');
  });

  it('deduplicates repeated IDs but keeps distinct document records and sorts like the individual sheet', () => {
    const same = document(1, { title: 'Brevet 2', expiresOn: '2028-01-01' });
    const people = [person(1), person(1)];
    const matrix = buildQualificationsMatrix({ people, documents: [
      document(4, { title: 'Brevet 10' }), same, { ...same },
      document(3, { title: 'Brevet 2', expiresOn: '2027-01-01' }),
      document(2, { title: 'Brevet 2', expiresOn: '2027-01-01' }),
    ], visibleCategoryKeys, asOf });
    expect(matrix.peopleCount).toBe(1);
    expect(matrix.groups[0].people[0].categories.deck.map(({ documentId }) => documentId)).toEqual([2, 3, 1, 4]);
  });

  it('respects authorized people and categories and never matches an unassigned document by name', () => {
    const matrix = buildQualificationsMatrix({ people: [person(1)], documents: [
      document(1), document(2, { personId: 2, title: 'OTHER_PERSON' }),
      document(3, { personId: null, title: 'UNASSIGNED' }),
      document(4, { categoryKey: 'medical_visit', title: 'HIDDEN_MEDICAL_DOCUMENT' }),
      document(5, { categoryKey: 'administrative', title: 'ADMINISTRATIVE_DOCUMENT' }),
      document(6, { categoryKey: 'annual_review', title: 'ANNUAL_REVIEW' }),
    ], visibleCategoryKeys: new Set(['deck', 'administrative', 'medical']), asOf });
    expect(matrix.categories.map(({ key }) => key)).toEqual(['deck']);
    expect(matrix.groups[0].people[0].categories.medical_visit).toEqual([]);
    expect(JSON.stringify(matrix)).not.toMatch(/OTHER_PERSON|UNASSIGNED|HIDDEN_MEDICAL_DOCUMENT|ADMINISTRATIVE_DOCUMENT|ANNUAL_REVIEW/);
    const hidden = buildQualificationsMatrix({ people: [person(1)], documents: [document(1)], visibleCategoryKeys: new Set(), asOf });
    expect(hidden.categories).toEqual([]);
    expect(hidden.groups[0].people[0].categories.deck).toEqual([]);
  });

  it('projects only qualification metadata, excluding medical notes, private files, NSS, salaries and signatures', () => {
    const privatePerson = { ...person(1), socialSecurityNumber: 'PRIVATE_NSS', grossSalary: 'PRIVATE_PAY', signature: 'PRIVATE_SIGNATURE' };
    const matrix = buildQualificationsMatrix({ people: [privatePerson], documents: [document(1, { categoryKey: 'medical_visit' })], visibleCategoryKeys, asOf });
    expect(JSON.stringify(matrix)).not.toContain('PRIVATE_');
    const row = matrix.groups[0].people[0];
    expect(Object.keys(row).sort()).toEqual(['active', 'categories', 'employmentStatusLabel', 'functionLabel', 'personId', 'personName']);
    expect(Object.keys(row.categories.medical_visit[0]).sort()).toEqual(['documentId', 'expiresOn', 'expiresOnLabel', 'status', 'statusLabel', 'title']);
  });

  it('does not mutate or retain editable references to the input records', () => {
    const personRecord = Object.freeze(person(1));
    const documentRecord = Object.freeze(document(1));
    const people = Object.freeze([personRecord]);
    const documents = Object.freeze([documentRecord]);
    const matrix = buildQualificationsMatrix({ people, documents, visibleCategoryKeys, asOf });
    matrix.groups[0].people[0].personName = 'Changed output';
    matrix.groups[0].people[0].categories.deck[0].title = 'Changed document';
    matrix.categories[0].label = 'Changed category';
    expect(personRecord.firstName).toBe('Camille');
    expect(documentRecord.title).toBe('Camille DEMO - Brevet 2025.pdf');
    expect(QUALIFICATIONS_MATRIX_CATEGORIES[0].label).toBe('Pont');
  });
});
