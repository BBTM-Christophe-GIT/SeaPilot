import { describe, expect, it } from 'vitest';
import { buildExerciseReport, exerciseFilename } from './emergencyExercisesModel';
describe('emergency exercise report', () => {
  it('aggregates months, puts the two priority types first, and retains historical types', () => {
    const report = buildExerciseReport({person:null,vessel:null,year:2026,counts:[
      {exercise_key:'old',exercise_name:'Ancien exercice',month:12,count:2},
      {exercise_key:'abandon',exercise_name:'Évacuation et abandon du navire',month:1,count:1},
      {exercise_key:'fire',exercise_name:'Protection contre l’incendie',month:1,count:3},
      {exercise_key:'fire',exercise_name:'Protection contre l’incendie',month:2,count:1},
    ]});
    expect(report.rows.map(r=>r.key)).toEqual(['fire','abandon','old']);
    expect(report.months).toEqual([4,1,0,0,0,0,0,0,0,0,0,2]);
    expect(report.total).toBe(7);
    expect(report.rows.map(r=>r.priority)).toEqual([true,true,false]);
  });
  it('keeps the historical filename policy', () => {
    expect(exerciseFilename('Adrien BOIS',2026)).toBe('Exercices-Urgence-Adrien-BOIS-2026.pdf');
    expect(exerciseFilename('Éloïse  D’ARÇ / test',2025)).toBe('Exercices-Urgence-Eloise-D-ARC-test-2025.pdf');
  });
  it('includes TBT in monthly and annual totals without changing priority exercises', () => {
    const report = buildExerciseReport({ person: null, vessel: null, year: 2026, counts: [
      { exercise_key: 'tbt', exercise_name: 'TBT — thème libre', month: 1, count: 2 },
      { exercise_key: 'fire', exercise_name: "Protection contre l'incendie", month: 1, count: 1 },
      { exercise_key: 'tbt', exercise_name: 'TBT — thème libre', month: 9, count: 3 },
    ] });
    expect(report.rows.map((row) => row.key)).toEqual(['fire', 'tbt']);
    expect(report.rows[1]).toMatchObject({ name: 'TBT — thème libre', total: 5, priority: false });
    expect(report.months).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0]);
    expect(report.total).toBe(6);
  });
  it('rejects invalid counts and displays all twelve months for an empty year', () => {
    expect(buildExerciseReport({person:null,vessel:null,year:2020,counts:[]}).months).toEqual(Array(12).fill(0));
    expect(()=>buildExerciseReport({person:null,vessel:null,year:2020,counts:[{exercise_key:'bad',exercise_name:'bad',month:13,count:1}]})).toThrow();
  });
});
