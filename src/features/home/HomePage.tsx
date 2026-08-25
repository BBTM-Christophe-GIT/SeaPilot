import {
  Anchor,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  MessageCircleMore,
  Settings,
  ShieldCheck,
  Ship,
  ShoppingCart,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ManagerHomeDashboard } from './ManagerHomeDashboard';

type StatusTone = 'blue' | 'green' | 'amber' | 'slate';

interface HomeAction {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface HomePriority extends HomeAction {
  description: string;
  status: string;
  tone: StatusTone;
}

interface HomeCommunication {
  title: string;
  description: string;
  meta: string;
  icon: LucideIcon;
  tone: StatusTone;
  to: string;
}

interface HomeProfile {
  intro: string;
  primaryAction: HomeAction;
  secondaryAction: HomeAction;
  priorities: HomePriority[];
  prioritiesLink: HomeAction;
  contextLabel: string;
  contextTitle: string;
  contextDescription: string;
  contextIcon: LucideIcon;
  journey: string[];
  contextLink: HomeAction;
  quickActions: HomeAction[];
  communicationsTitle: string;
  communications: HomeCommunication[];
  communicationsLink: HomeAction;
}

const PROFILE_PRIORITY: RoleKey[] = ['admin', 'direction', 'armement', 'capitaine', 'marin'];

const HOME_PROFILES: Record<RoleKey, HomeProfile> = {
  admin: {
    intro: 'Voici les points de contrôle de votre espace SeaPilot.',
    primaryAction: { label: 'Gérer les utilisateurs', to: '/modules/admin', icon: UserCog },
    secondaryAction: { label: 'Consulter les indicateurs', to: '/modules/kpi', icon: BarChart3 },
    priorities: [
      { label: 'Comptes et invitations', description: 'Contrôler les accès et les profils utilisateurs.', status: 'Administrer', tone: 'blue', to: '/modules/admin', icon: Users },
      { label: 'Droits de navigation', description: 'Vérifier la visibilité des modules par rôle.', status: 'À vérifier', tone: 'amber', to: '/modules/admin', icon: ShieldCheck },
      { label: "Plan d'action QHSE", description: 'Suivre les actions ouvertes et leurs responsables.', status: 'Suivi', tone: 'green', to: '/modules/actionPlan', icon: ClipboardCheck },
    ],
    prioritiesLink: { label: 'Voir les contrôles', to: '/modules/admin', icon: ArrowRight },
    contextLabel: 'Supervision SeaPilot',
    contextTitle: 'Espace de travail BBTM',
    contextDescription: 'Pilotez les accès, la qualité des référentiels et les modules métiers depuis un même point.',
    contextIcon: Settings,
    journey: ['Accès', 'Référentiels', 'Contrôles', 'Suivi'],
    contextLink: { label: "Ouvrir l'administration", to: '/modules/admin', icon: ArrowRight },
    quickActions: [
      { label: 'Administration', to: '/modules/admin', icon: Settings },
      { label: 'Ressources humaines', to: '/modules/humanResources', icon: Users },
      { label: 'Certificats flotte', to: '/modules/certificates', icon: FileCheck2 },
      { label: "Plan d'action", to: '/modules/actionPlan', icon: ClipboardCheck },
    ],
    communicationsTitle: 'Contrôles recommandés',
    communications: [
      { title: 'Configuration des profils', description: 'Revoyez régulièrement les rôles et les droits attribués.', meta: 'Administration', icon: UserCog, tone: 'blue', to: '/modules/admin' },
      { title: 'Qualité documentaire', description: 'Contrôlez les documents flotte et RH arrivant à échéance.', meta: 'QHSE', icon: BookOpenCheck, tone: 'green', to: '/modules/certificates' },
    ],
    communicationsLink: { label: 'Voir les paramètres', to: '/modules/admin', icon: ArrowRight },
  },
  direction: {
    intro: 'Voici les sujets qui appellent votre attention aujourd’hui.',
    primaryAction: { label: 'Consulter la synthèse', to: '/modules/kpi', icon: BarChart3 },
    secondaryAction: { label: 'Ouvrir les projets', to: '/modules/projects', icon: FolderKanban },
    priorities: [
      { label: 'Indicateurs QHSE', description: 'Examiner les tendances et les points de vigilance.', status: 'Pilotage', tone: 'blue', to: '/modules/kpi', icon: BarChart3 },
      { label: "Plan d'action", description: 'Arbitrer les actions et les échéances prioritaires.', status: 'Décision', tone: 'amber', to: '/modules/actionPlan', icon: ClipboardCheck },
      { label: "Demandes d'achat", description: 'Suivre les demandes nécessitant une décision.', status: 'À arbitrer', tone: 'green', to: '/modules/purchaseRequests', icon: ShoppingCart },
    ],
    prioritiesLink: { label: 'Voir les priorités', to: '/modules/kpi', icon: ArrowRight },
    contextLabel: 'Vue consolidée',
    contextTitle: 'Activité de la flotte BBTM',
    contextDescription: 'Accédez rapidement aux opérations, aux risques et aux décisions qui structurent la journée.',
    contextIcon: Ship,
    journey: ['Activité', 'Risques', 'Décisions', 'Suivi'],
    contextLink: { label: 'Voir les indicateurs', to: '/modules/kpi', icon: ArrowRight },
    quickActions: [
      { label: 'Indicateurs QHSE', to: '/modules/kpi', icon: BarChart3 },
      { label: 'Projets', to: '/modules/projects', icon: FolderKanban },
      { label: 'Planning', to: '/modules/planning', icon: CalendarDays },
      { label: "Demandes d'achat", to: '/modules/purchaseRequests', icon: ShoppingCart },
    ],
    communicationsTitle: 'Repères de pilotage',
    communications: [
      { title: 'Exposition QHSE', description: 'Consultez les risques et les actions associées avant arbitrage.', meta: 'QHSE', icon: ShieldCheck, tone: 'green', to: '/modules/actionPlan' },
      { title: 'Capacité opérationnelle', description: 'Croisez le planning des équipages avec les projets en cours.', meta: 'Opérations', icon: Gauge, tone: 'blue', to: '/modules/planning' },
    ],
    communicationsLink: { label: 'Voir les projets', to: '/modules/projects', icon: ArrowRight },
  },
  armement: {
    intro: 'Voici les priorités de préparation des équipages.',
    primaryAction: { label: 'Ajuster le planning', to: '/modules/planning', icon: CalendarDays },
    secondaryAction: { label: 'Consulter les brevets', to: '/modules/humanResources', icon: FileCheck2 },
    priorities: [
      { label: 'Relèves et affectations', description: 'Contrôler les besoins et les disponibilités équipage.', status: 'À préparer', tone: 'blue', to: '/modules/planning', icon: Users },
      { label: 'Brevets et aptitudes', description: 'Vérifier les documents nécessaires aux affectations.', status: 'À vérifier', tone: 'amber', to: '/modules/humanResources', icon: FileCheck2 },
      { label: 'Temps de travail', description: 'Suivre les saisies et les validations du personnel navigant.', status: 'Suivi', tone: 'green', to: '/modules/workingTime', icon: Clock3 },
    ],
    prioritiesLink: { label: 'Voir les affectations', to: '/modules/planning', icon: ArrowRight },
    contextLabel: 'Préparation des relèves',
    contextTitle: 'Équipages et disponibilité',
    contextDescription: 'Coordonnez les affectations, la conformité documentaire et le temps de travail.',
    contextIcon: Users,
    journey: ['Besoins', 'Affectations', 'Conformité', 'Relève'],
    contextLink: { label: 'Voir le planning équipage', to: '/modules/planning', icon: ArrowRight },
    quickActions: [
      { label: 'Planning équipage', to: '/modules/planning', icon: CalendarDays },
      { label: 'RH / Brevets', to: '/modules/humanResources', icon: Users },
      { label: 'Temps de travail', to: '/modules/workingTime', icon: Clock3 },
      { label: 'Certificats flotte', to: '/modules/certificates', icon: FileCheck2 },
    ],
    communicationsTitle: 'Préparation opérationnelle',
    communications: [
      { title: 'Dossiers équipage', description: 'Vérifiez la conformité avant de confirmer une affectation.', meta: 'Ressources humaines', icon: FileCheck2, tone: 'amber', to: '/modules/humanResources' },
      { title: 'Coordination des relèves', description: 'Consultez les périodes et les besoins dans le planning.', meta: 'Planning', icon: CalendarDays, tone: 'blue', to: '/modules/planning' },
    ],
    communicationsLink: { label: 'Voir les ressources humaines', to: '/modules/humanResources', icon: ArrowRight },
  },
  capitaine: {
    intro: 'Voici vos priorités à bord aujourd’hui.',
    primaryAction: { label: 'Créer le DPR du jour', to: '/modules/dpr', icon: FileText },
    secondaryAction: { label: 'Consulter le planning', to: '/modules/planning', icon: CalendarDays },
    priorities: [
      { label: 'Daily Progress Report', description: 'Créer ou poursuivre le rapport opérationnel du jour.', status: 'À traiter', tone: 'blue', to: '/modules/dpr', icon: FileText },
      { label: 'Certificats du navire', description: 'Contrôler les échéances et les documents de bord.', status: 'À vérifier', tone: 'amber', to: '/modules/certificates', icon: FileCheck2 },
      { label: "Demandes d'achat", description: 'Suivre les besoins transmis depuis le bord.', status: 'Suivi', tone: 'green', to: '/modules/purchaseRequests', icon: ShoppingCart },
    ],
    prioritiesLink: { label: 'Voir toutes les tâches', to: '/modules/dpr', icon: ArrowRight },
    contextLabel: 'Mon navire',
    contextTitle: 'Espace opérationnel du bord',
    contextDescription: 'Préparez la mission, suivez les opérations et transmettez les informations de relève.',
    contextIcon: Ship,
    journey: ['Planification', 'Embarquement', 'Opérations', 'Relève'],
    contextLink: { label: 'Voir le planning', to: '/modules/planning', icon: ArrowRight },
    quickActions: [
      { label: 'Daily Progress Report', to: '/modules/dpr', icon: FileText },
      { label: 'Planning équipage', to: '/modules/planning', icon: Users },
      { label: 'Certificats flotte', to: '/modules/certificates', icon: FileCheck2 },
      { label: 'Temps de travail', to: '/modules/workingTime', icon: Clock3 },
    ],
    communicationsTitle: 'Relève & communications',
    communications: [
      { title: 'Relève de passerelle', description: 'Consultez les dernières informations opérationnelles avant la prise de quart.', meta: 'Opérations', icon: MessageCircleMore, tone: 'blue', to: '/modules/dpr' },
      { title: 'Suivi des interventions', description: 'Retrouvez les documents techniques et les points à contrôler à bord.', meta: 'Maintenance', icon: Wrench, tone: 'green', to: '/modules/technicalDocuments' },
    ],
    communicationsLink: { label: 'Voir les opérations', to: '/modules/dpr', icon: ArrowRight },
  },
  marin: {
    intro: 'Voici vos prochaines étapes et vos documents personnels.',
    primaryAction: { label: 'Saisir mes heures', to: '/modules/workingTime', icon: Clock3 },
    secondaryAction: { label: 'Voir mon planning', to: '/modules/planning', icon: CalendarDays },
    priorities: [
      { label: 'Temps de travail', description: 'Saisir ou contrôler vos périodes de travail et de repos.', status: 'À compléter', tone: 'blue', to: '/modules/workingTime', icon: Clock3 },
      { label: 'Mes documents', description: 'Consulter vos brevets, visites et échéances personnelles.', status: 'À vérifier', tone: 'amber', to: '/modules/humanResources', icon: FileCheck2 },
      { label: 'Prochain embarquement', description: 'Retrouver votre affectation et les dates associées.', status: 'Planifié', tone: 'green', to: '/modules/planning', icon: Anchor },
    ],
    prioritiesLink: { label: 'Voir mes prochaines étapes', to: '/modules/workingTime', icon: ArrowRight },
    contextLabel: 'Mon embarquement',
    contextTitle: 'Espace personnel navigant',
    contextDescription: 'Retrouvez les informations utiles avant, pendant et après votre période à bord.',
    contextIcon: Anchor,
    journey: ['Préparation', 'Embarquement', 'À bord', 'Repos'],
    contextLink: { label: 'Voir mon planning', to: '/modules/planning', icon: ArrowRight },
    quickActions: [
      { label: 'Mon planning', to: '/modules/planning', icon: CalendarDays },
      { label: 'Temps de travail', to: '/modules/workingTime', icon: Clock3 },
      { label: 'RH / Brevets', to: '/modules/humanResources', icon: FileCheck2 },
      { label: 'Daily Progress Report', to: '/modules/dpr', icon: FileText },
    ],
    communicationsTitle: 'Informations utiles',
    communications: [
      { title: 'Préparer mon embarquement', description: 'Vérifiez votre planning et la validité de vos documents.', meta: 'Avant le départ', icon: CheckCircle2, tone: 'green', to: '/modules/planning' },
      { title: 'Registre du temps de travail', description: 'Tenez vos périodes à jour pour faciliter la validation.', meta: 'À bord', icon: Clock3, tone: 'blue', to: '/modules/workingTime' },
    ],
    communicationsLink: { label: 'Voir mes documents', to: '/modules/humanResources', icon: ArrowRight },
  },
};

function getPrimaryRole(roles: RoleKey[]): RoleKey {
  return PROFILE_PRIORITY.find((role) => roles.includes(role)) ?? 'marin';
}

function ActionLink({ action, variant }: { action: HomeAction; variant: 'primary' | 'secondary' }) {
  const Icon = action.icon;
  return (
    <Link className={`home-action home-action-${variant}`} to={action.to}>
      <Icon aria-hidden="true" size={19} />
      <span>{action.label}</span>
    </Link>
  );
}

function SectionLink({ action }: { action: HomeAction }) {
  const Icon = action.icon;
  return (
    <Link className="home-section-link" to={action.to}>
      <span>{action.label}</span>
      <Icon aria-hidden="true" size={16} />
    </Link>
  );
}

export function HomePage() {
  const { roles, client, currentPerson, previewMode } = useOutletContext<AppShellOutletContext>();
  const role = getPrimaryRole(roles);
  const firstName = currentPerson?.firstName.trim();
  if (role === 'admin' || role === 'direction') {
    return <ManagerHomeDashboard client={client} firstName={firstName || ''} />;
  }

  const profile = HOME_PROFILES[role];
  const ContextIcon = profile.contextIcon;
  const contextTitle = previewMode && (role === 'capitaine' || role === 'marin')
    ? 'M/V Démonstration'
    : profile.contextTitle;

  return (
    <section className="home-page" data-home-role={role}>
      <header className="home-hero">
        <h1>{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</h1>
        <p>{profile.intro}</p>
        <div className="home-hero-actions">
          <ActionLink action={profile.primaryAction} variant="primary" />
          <ActionLink action={profile.secondaryAction} variant="secondary" />
        </div>
      </header>

      <div className="home-dashboard-grid">
        <div className="home-dashboard-column">
          <section className="home-section home-priorities" aria-labelledby="home-priorities-title">
            <h2 id="home-priorities-title">À traiter aujourd’hui</h2>
            <div className="home-priority-list">
              {profile.priorities.map((priority) => {
                const Icon = priority.icon;
                return (
                  <Link className="home-priority-row" key={priority.label} to={priority.to}>
                    <span className={`home-row-icon is-${priority.tone}`}><Icon aria-hidden="true" size={21} /></span>
                    <span className="home-priority-copy">
                      <strong>{priority.label}</strong>
                      <small>{priority.description}</small>
                    </span>
                    <span className={`home-status is-${priority.tone}`}>{priority.status}</span>
                    <ChevronRight aria-hidden="true" className="home-row-chevron" size={19} />
                  </Link>
                );
              })}
            </div>
            <SectionLink action={profile.prioritiesLink} />
          </section>

          <section className="home-section home-quick-access" aria-labelledby="home-quick-title">
            <h2 id="home-quick-title">Accès rapides</h2>
            <div className="home-quick-grid">
              {profile.quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link className="home-quick-link" key={action.label} to={action.to}>
                    <Icon aria-hidden="true" size={24} />
                    <span>{action.label}</span>
                    <ChevronRight aria-hidden="true" size={18} />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <div className="home-dashboard-column">
          <section className="home-section home-context" aria-labelledby="home-context-title">
            <h2 id="home-context-title">{profile.contextLabel}</h2>
            <div className="home-context-heading">
              <span className="home-context-icon"><ContextIcon aria-hidden="true" size={31} /></span>
              <div>
                <h3>{contextTitle}</h3>
                <p>{profile.contextDescription}</p>
              </div>
            </div>
            <div className="home-journey" aria-label={`Parcours ${profile.contextLabel}`}>
              {profile.journey.map((step, index) => (
                <div className={index === 0 ? 'is-current' : ''} key={step}>
                  <span>{index === 0 ? <CheckCircle2 aria-hidden="true" size={18} /> : index + 1}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
            <SectionLink action={profile.contextLink} />
          </section>

          <section className="home-section home-communications" aria-labelledby="home-communications-title">
            <h2 id="home-communications-title">{profile.communicationsTitle}</h2>
            <div className="home-communication-list">
              {profile.communications.map((communication) => {
                const Icon = communication.icon;
                return (
                  <Link className="home-communication-row" key={communication.title} to={communication.to}>
                    <span className={`home-row-icon is-${communication.tone}`}><Icon aria-hidden="true" size={20} /></span>
                    <span>
                      <strong>{communication.title}</strong>
                      <small>{communication.description}</small>
                    </span>
                    <em>{communication.meta}</em>
                    <ChevronRight aria-hidden="true" size={18} />
                  </Link>
                );
              })}
            </div>
            <SectionLink action={profile.communicationsLink} />
          </section>
        </div>
      </div>
    </section>
  );
}
