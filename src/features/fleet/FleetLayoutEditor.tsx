import { ArrowDown, ArrowUp, LayoutList, RotateCcw } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { DEFAULT_FLEET_LAYOUT, type FleetLayout } from './fleetLayout';
import './FleetLayoutEditor.css';

const serializedDefault = JSON.stringify(DEFAULT_FLEET_LAYOUT);
const defaultCategoryEnglishLabels = new Map(DEFAULT_FLEET_LAYOUT.map(({ id, labelEn }) => [id, labelEn]));
const defaultFieldEnglishLabels = new Map(DEFAULT_FLEET_LAYOUT.flatMap(({ fields }) => (
  fields.map(({ id, labelEn }) => [id, labelEn] as const)
)));

interface FleetLayoutEditorProps {
  layout: FleetLayout;
  onClose: () => void;
  onSave: (layout: FleetLayout) => void;
  saving: boolean;
  error: string;
}

function moveItem<Item>(items: Item[], index: number, direction: -1 | 1): Item[] {
  const destination = index + direction;
  if (destination < 0 || destination >= items.length) return items;

  const reordered = [...items];
  [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
  return reordered;
}

function trimLabels<Item extends { label: string; labelEn?: string }>(item: Item): Item {
  const result = { ...item, label: item.label.trim() };
  const labelEn = item.labelEn?.trim();
  if (labelEn) result.labelEn = labelEn;
  else delete result.labelEn;
  return result;
}

function OrderButtons({ label, index, count, onMove }: {
  label: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="fleet-layout-editor__order">
      <button aria-label={`Monter ${label}`} className="sp-button sp-button--secondary" disabled={index === 0} onClick={() => onMove(-1)} title="Monter" type="button">
        <ArrowUp aria-hidden="true" size={16} />
      </button>
      <button aria-label={`Descendre ${label}`} className="sp-button sp-button--secondary" disabled={index === count - 1} onClick={() => onMove(1)} title="Descendre" type="button">
        <ArrowDown aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export function FleetLayoutEditor({ layout, onClose, onSave, saving, error }: FleetLayoutEditorProps) {
  const editorId = useId();
  const [draft, setDraft] = useState(layout);
  const [activeId, setActiveId] = useState(layout[0]?.id);
  const [editingEnglish, setEditingEnglish] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const fieldToFocus = useRef<string | null>(null);
  const activeIndex = draft.findIndex(({ id }) => id === activeId);
  const activeCategory = draft[activeIndex];
  const hasEmptyLabel = draft.some(({ label, fields }) => !label.trim() || fields.some((field) => !field.label.trim()));
  const draftToSave = draft.map((category) => ({ ...trimLabels(category), fields: category.fields.map(trimLabels) }));
  const serializedDraft = JSON.stringify(draftToSave);
  const canSave = !saving && !hasEmptyLabel && serializedDraft !== JSON.stringify(layout);
  const labelKey = editingEnglish ? 'labelEn' : 'label';

  function updateActiveCategory(update: (category: FleetLayout[number]) => FleetLayout[number]) {
    setDraft((current) => current.map((category) => category.id === activeId ? update(category) : category));
  }

  function moveField(field: FleetLayout[number]['fields'][number], destinationId: string) {
    const destination = draft.find(({ id }) => id === destinationId);
    if (!destination) return;

    setDraft((current) => current.map((category) => {
      if (category.id === activeId) return { ...category, fields: category.fields.filter(({ id }) => id !== field.id) };
      if (category.id === destinationId) return { ...category, fields: [...category.fields, field] };
      return category;
    }));
    fieldToFocus.current = field.id;
    setActiveId(destinationId);
    setAnnouncement(`« ${field.label} » a été déplacé dans « ${destination.label} ».`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    onSave(draftToSave);
  }

  return (
    <AppDialog
      description="Le nom et l’ordre des rubriques et des champs s’appliquent aux fiches et aux brochures de tous les navires."
      footer={(
        <div className="fleet-layout-editor__footer">
          <button
            className="sp-button sp-button--secondary"
            disabled={saving || serializedDraft === serializedDefault}
            onClick={() => {
              setDraft(DEFAULT_FLEET_LAYOUT);
              setActiveId(DEFAULT_FLEET_LAYOUT[0]?.id);
              setAnnouncement('Le modèle par défaut a été rétabli.');
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} /> Rétablir le modèle
          </button>
          <div className="app-dialog__actions">
            <button className="sp-button sp-button--secondary" disabled={saving} onClick={onClose} type="button">Annuler</button>
            <button className="sp-button sp-button--primary" disabled={!canSave} type="submit">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
      icon={<LayoutList aria-hidden="true" size={20} />}
      isBusy={saving}
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      title="Organisation des fiches navire"
    >
      {error ? <p className="form-error fleet-layout-editor__message" role="alert">{error}</p> : null}
      {hasEmptyLabel ? <p className="form-error fleet-layout-editor__message" role="status">Renseignez un libellé pour chaque rubrique et champ.</p> : null}
      <span className="fleet-layout-editor__sr-only" role="status">{announcement}</span>
      <fieldset aria-label="Rubriques et champs" className="fleet-layout-editor" disabled={saving}>
        <div className="fleet-layout-editor__navigation">
          <h3>Rubriques</h3>
          <ol>
            {draft.map((category) => (
              <li key={category.id}>
                <button
                  aria-controls={editorId}
                  aria-pressed={activeId === category.id}
                  className="sp-button sp-button--secondary"
                  onClick={() => setActiveId(category.id)}
                  type="button"
                >
                  {category.label.trim() || 'Rubrique sans nom'}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="fleet-layout-editor__details" id={editorId}>
          {activeCategory ? (
            <>
              <div aria-label="Langue des libellés" className="fleet-layout-editor__language" role="group">
                <button aria-pressed={!editingEnglish} className="sp-button sp-button--secondary" onClick={() => setEditingEnglish(false)} type="button">Français</button>
                <button aria-pressed={editingEnglish} className="sp-button sp-button--secondary" onClick={() => setEditingEnglish(true)} type="button">Anglais</button>
              </div>
              {editingEnglish ? (
                <p className="fleet-layout-editor__language-hint">Laissez un libellé anglais vide pour utiliser la traduction par défaut.</p>
              ) : null}
              <div className="fleet-layout-editor__category">
                <label>
                  {editingEnglish ? 'Nom de la rubrique en anglais' : 'Nom de la rubrique'}
                  <input
                    aria-invalid={!editingEnglish && !activeCategory.label.trim() || undefined}
                    maxLength={80}
                    onChange={(event) => {
                      const label = event.currentTarget.value;
                      updateActiveCategory((category) => ({ ...category, [labelKey]: label }));
                    }}
                    placeholder={editingEnglish ? defaultCategoryEnglishLabels.get(activeCategory.id) : undefined}
                    required={!editingEnglish}
                    value={activeCategory[labelKey] ?? ''}
                  />
                </label>
                <OrderButtons
                  count={draft.length}
                  index={activeIndex}
                  label={`la rubrique ${activeCategory.label.trim()}`}
                  onMove={(direction) => setDraft((current) => moveItem(current, activeIndex, direction))}
                />
              </div>
              <h3>Champs</h3>
              {activeCategory.fields.length ? (
                <ol className="fleet-layout-editor__fields">
                  {activeCategory.fields.map((field, index) => (
                    <li key={field.id}>
                      <div className="fleet-layout-editor__field-label">
                        {editingEnglish ? <span id={`${editorId}-${field.id}`}>{field.label}</span> : null}
                        <input
                          aria-describedby={editingEnglish ? `${editorId}-${field.id}` : undefined}
                          aria-invalid={!editingEnglish && !field.label.trim() || undefined}
                          aria-label={`Nom du champ ${index + 1}${editingEnglish ? ' en anglais' : ''}`}
                          maxLength={80}
                          onChange={(event) => {
                            const label = event.currentTarget.value;
                            updateActiveCategory((category) => ({
                              ...category,
                              fields: category.fields.map((entry) => entry.id === field.id ? { ...entry, [labelKey]: label } : entry),
                            }));
                          }}
                          placeholder={editingEnglish ? defaultFieldEnglishLabels.get(field.id) : undefined}
                          ref={(input) => {
                            if (!input || fieldToFocus.current !== field.id) return;
                            fieldToFocus.current = null;
                            input.focus();
                          }}
                          required={!editingEnglish}
                          value={field[labelKey] ?? ''}
                        />
                      </div>
                      <OrderButtons
                        count={activeCategory.fields.length}
                        index={index}
                        label={`le champ ${field.label.trim()}`}
                        onMove={(direction) => updateActiveCategory((category) => ({
                          ...category,
                          fields: moveItem(category.fields, index, direction),
                        }))}
                      />
                      {draft.length > 1 ? (
                        <select
                          aria-label={`Déplacer le champ ${field.label.trim()} vers une autre rubrique`}
                          onChange={(event) => moveField(field, event.currentTarget.value)}
                          value=""
                        >
                          <option disabled value="">Déplacer vers…</option>
                          {draft.filter(({ id }) => id !== activeId).map(({ id, label }) => (
                            <option key={id} value={id}>{label.trim() || 'Rubrique sans nom'}</option>
                          ))}
                        </select>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : <p className="fleet-layout-editor__empty">Cette rubrique ne contient aucun champ.</p>}
            </>
          ) : null}
        </div>
      </fieldset>
    </AppDialog>
  );
}
