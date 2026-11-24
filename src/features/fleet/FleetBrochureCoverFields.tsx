import { useId } from 'react';
import { hasValidEnglishBrochureMissions, type FleetBrochureCoverSettings } from './fleetLayout';
import './FleetBrochureCoverFields.css';

const TECHNICAL_TRANSLATIONS = [
  { key: 'navigationCategory', label: 'Catégorie de navigation' },
  { key: 'mainEngine', label: 'Moteur principal' },
  { key: 'gensets', label: 'Groupes électrogènes' },
  { key: 'rangeDescription', label: 'Autonomie' },
  { key: 'deckEquipment', label: 'Équipements de pont' },
  { key: 'electronicsCommunications', label: 'Navigation et communications' },
  { key: 'accommodation', label: 'Emménagements' },
] as const;

const MISSIONS_LIMIT = 'Saisissez au plus 24 usages de 100 caractères chacun.';

interface FleetBrochureCoverFieldsProps {
  subtitle: string;
  summary: string;
  operations: string;
  cover: FleetBrochureCoverSettings;
  onFrenchChange: (key: 'brochureSubtitle' | 'brochureSummary' | 'brochureOperations', value: string) => void;
  onCoverChange: (cover: FleetBrochureCoverSettings) => void;
}

export function FleetBrochureCoverFields({ subtitle, summary, operations, cover, onFrenchChange, onCoverChange }: FleetBrochureCoverFieldsProps) {
  const headingId = useId();
  const missionsLimitId = useId();
  const english = cover.en;
  const invalidMissions = !hasValidEnglishBrochureMissions(english?.operations);

  function updateEnglish(update: NonNullable<FleetBrochureCoverSettings['en']>) {
    onCoverChange({ ...cover, en: { ...english, ...update } });
  }

  return (
    <section aria-labelledby={headingId} className="fleet-brochure-cover-fields">
      <h3 id={headingId}>Brochure</h3>
      <p>Renseignez le contenu dans chaque langue. Les champs vides utilisent le contenu par défaut.</p>
      <div className="fleet-brochure-cover-fields__languages">
        <fieldset>
          <legend>Français</legend>
          <label>
            Sous-titre
            <input onChange={(event) => onFrenchChange('brochureSubtitle', event.currentTarget.value)} value={subtitle} />
          </label>
          <label>
            Présentation
            <textarea onChange={(event) => onFrenchChange('brochureSummary', event.currentTarget.value)} rows={3} value={summary} />
          </label>
          <label>
            Titre des missions
            <input
              maxLength={100}
              onChange={(event) => onCoverChange({ ...cover, fr: { ...cover.fr, missionsTitle: event.currentTarget.value } })}
              placeholder="Missions"
              value={cover.fr?.missionsTitle ?? ''}
            />
          </label>
          <label>
            Usages opérationnels (un par ligne)
            <textarea onChange={(event) => onFrenchChange('brochureOperations', event.currentTarget.value)} rows={4} value={operations} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Anglais</legend>
          <label>
            Sous-titre en anglais
            <input maxLength={100} onChange={(event) => updateEnglish({ subtitle: event.currentTarget.value })} value={english?.subtitle ?? ''} />
          </label>
          <label>
            Présentation en anglais
            <textarea maxLength={500} onChange={(event) => updateEnglish({ summary: event.currentTarget.value })} rows={3} value={english?.summary ?? ''} />
          </label>
          <label>
            Titre des missions en anglais
            <input maxLength={100} onChange={(event) => updateEnglish({ missionsTitle: event.currentTarget.value })} placeholder="Missions" value={english?.missionsTitle ?? ''} />
          </label>
          <label>
            Usages opérationnels en anglais (un par ligne)
            <textarea
              aria-describedby={invalidMissions ? missionsLimitId : undefined}
              aria-invalid={invalidMissions || undefined}
              onChange={(event) => {
                const lines = event.currentTarget.value.split('\n');
                event.currentTarget.setCustomValidity(excessiveMissions(lines) ? MISSIONS_LIMIT : '');
                updateEnglish({ operations: lines });
              }}
              rows={4}
              value={english?.operations?.join('\n') ?? ''}
            />
          </label>
          {invalidMissions ? <p className="form-error" id={missionsLimitId} role="status">{MISSIONS_LIMIT}</p> : null}
        </fieldset>
      </div>
      <details>
        <summary>Traduire les descriptions techniques en anglais</summary>
        <div className="fleet-brochure-cover-fields__translations">
          {TECHNICAL_TRANSLATIONS.map(({ key, label }) => (
            <label key={key}>
              {label} en anglais
              <textarea
                maxLength={6000}
                onChange={(event) => updateEnglish({ fieldValues: { ...english?.fieldValues, [key]: event.currentTarget.value } })}
                rows={2}
                value={english?.fieldValues?.[key] ?? ''}
              />
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
