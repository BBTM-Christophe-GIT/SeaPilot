# SeaPilot v3.12.2 — paramètres administrateur du temps de travail

Date de livraison : 3 août 2026.

Cette étape complète `/modules/workingTime` avec l’administration sécurisée des politiques datées déjà portées par `planning_work_rest_policies`. Aucun second moteur de règles et aucune nouvelle table de seuils ne sont créés.

## Paramètres disponibles

Un administrateur peut créer ou modifier une politique globale à l’entreprise ou propre à un navire, avec une date de début obligatoire et une date de fin facultative. La politique contient :

- le travail maximum sur toute fenêtre glissante de 24 heures ;
- le repos minimum sur toute fenêtre glissante de 24 heures ;
- le repos minimum consécutif ;
- le travail maximum sur 7 jours glissants ;
- le repos minimum sur 7 jours glissants ;
- le nombre maximum de périodes de repos sur 24 heures ;
- le début et la fin de la fenêtre de nuit ainsi que son maximum de travail ;
- l’inclusion ou non du temps de passation.

Les politiques actives de même portée ne peuvent pas se chevaucher. Une politique propre à un navire prend le pas sur la politique globale applicable dans le moteur P1.3.

## Absence de valeur réglementaire implicite

Tous les seuils et les deux bornes de la fenêtre de nuit sont vides à la création et ne possèdent aucune valeur par défaut en base. L’interface rappelle qu’ils doivent être vérifiés par l’administrateur avant activation.

Les valeurs lues ultérieurement dans les classeurs 2025 ou 2026 pourront être affichées comme suggestions de configuration d’import. Elles ne devront jamais être activées automatiquement, présentées comme une norme ou qualifiées de vérité légale. La référence du classeur peut être conservée dans les notes administratives de la politique validée.

## Sécurité

La visibilité du bouton d’administration reste pilotée par `getPlanningPermissions`, qui ne l’accorde qu’au rôle `admin`. La migration `20260803220107_working_time_admin_policy_settings.sql` renforce la frontière serveur : `save_planning_work_rest_policy` vérifie directement `has_company_role(..., array['admin'])`. Une permission Planning déléguée ou une autorisation ponctuelle sur un navire ne permet donc plus d’administrer ces seuils.

La fonction reste une RPC `SECURITY DEFINER` volontairement exposée au rôle `authenticated`, car le client doit pouvoir l’appeler. Elle contrôle explicitement l’identité, la société active, le rôle administrateur, la portée, le navire et les chevauchements avant toute écriture ; `anon` et `PUBLIC` n’ont aucun droit d’exécution.

## Vérifications

- test React du formulaire vide, de l’avertissement d’import et de la persistance des valeurs saisies ;
- test pgTAP de l’absence de valeurs par défaut et du refus du rôle Direction ;
- test pgTAP des politiques globales et propres à un navire créées par un administrateur ;
- remise à zéro de la base locale, lint Supabase, tests applicatifs, lint et build de production ;
- contrôle visuel de `/modules/workingTime?preview=1` sur ordinateur et mobile.

## Retour arrière

Revenir au client v3.12.1 masque les précisions d’interface sans supprimer de politique. Pour restaurer l’ancienne autorisation serveur, il faudrait réappliquer la définition P1.3 de `save_planning_work_rest_policy`, ce qui réouvrirait volontairement la possibilité de délégation. Les politiques déjà créées restent compatibles et ne doivent pas être supprimées.
