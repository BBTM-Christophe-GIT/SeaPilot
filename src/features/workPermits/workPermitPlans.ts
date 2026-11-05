import gouryMainDeck from './assets/goury-pont-principal.webp';
import gouryUpperDeck from './assets/goury-pont-superieur.webp';
import gouryLowerDeck from './assets/goury-sous-pont-principal.webp';
import gouryProfile from './assets/goury-profil.webp';
import leHavreYard from './assets/yard-le-havre.webp';

import leRozelPontPrincipal from './assets/le-rozel-pont-principal.webp';
import leRozelPontSuperieur from './assets/le-rozel-pont-superieur.webp';
import leRozelSousPontPrincipal from './assets/le-rozel-sous-pont-principal.webp';
import leRozelPontPasserelle from './assets/le-rozel-pont-passerelle.webp';
import leRozelProfil from './assets/le-rozel-profil.webp';
import landemerPontPrincipal from './assets/landemer-pont-principal.webp';
import landemerSousPontPrincipal from './assets/landemer-sous-pont-principal.webp';
import landemerVueComplementaire from './assets/landemer-vue-complementaire.webp';
import landemerProfil from './assets/landemer-profil.webp';

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

const leRozelPlans: readonly WorkPermitPlan[] = [
  { id: 'pont-principal', title: 'Pont principal', src: leRozelPontPrincipal },
  { id: 'pont-superieur', title: 'Pont supérieur de passerelle', src: leRozelPontSuperieur },
  { id: 'sous-pont-principal', title: 'Pont inférieur', src: leRozelSousPontPrincipal },
  { id: 'pont-passerelle', title: 'Pont de la passerelle', src: leRozelPontPasserelle },
  { id: 'profil', title: 'Profil', src: leRozelProfil },
];

const landemerPlans: readonly WorkPermitPlan[] = [
  { id: 'pont-principal', title: 'Pont principal', src: landemerPontPrincipal },
  { id: 'sous-pont-principal', title: 'Sous pont principal', src: landemerSousPontPrincipal },
  { id: 'vue-complementaire', title: 'Vue de dessus · détail', src: landemerVueComplementaire },
  { id: 'profil', title: 'Profil', src: landemerProfil },
];

export function workPermitPlansForAsset(assetName: string): readonly WorkPermitPlan[] {
  const name = assetName.trim().toLowerCase().replace(/[\s-]+/g, ' ');

  switch (name) {
    case 'goury':
      return gouryPlans;
    case 'le rozel':
      return leRozelPlans;
    case 'landemer':
      return landemerPlans;
    case 'yard le havre':
    case 'yard du havre':
      return yardPlans;
    default:
      return [];
  }
}
