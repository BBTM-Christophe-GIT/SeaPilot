import gouryMainDeck from './assets/goury-pont-principal.webp';
import gouryUpperDeck from './assets/goury-pont-superieur.webp';
import gouryLowerDeck from './assets/goury-sous-pont-principal.webp';
import gouryProfile from './assets/goury-profil.webp';
import leHavreYard from './assets/yard-le-havre.webp';

export interface WorkPermitPlan {
  id: string;
  title: string;
  src: string;
}

const gouryPlans: readonly WorkPermitPlan[] = [
  { id: 'pont-principal', title: 'Pont principal', src: gouryMainDeck },
  { id: 'pont-superieur', title: 'Pont supérieur', src: gouryUpperDeck },
  { id: 'sous-pont-principal', title: 'Sous pont principal', src: gouryLowerDeck },
  { id: 'profil', title: 'Profil', src: gouryProfile },
];

const yardPlans: readonly WorkPermitPlan[] = [
  { id: 'yard-3d', title: 'Vue 3D du quai', src: leHavreYard },
];

export function workPermitPlansForAsset(assetName: string): readonly WorkPermitPlan[] {
  const name = assetName.trim().toLowerCase().replace(/[\s-]+/g, ' ');

  switch (name) {
    case 'goury':
      return gouryPlans;
    case 'yard le havre':
    case 'yard du havre':
      return yardPlans;
    default:
      return [];
  }
}
