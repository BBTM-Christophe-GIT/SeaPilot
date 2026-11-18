import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BriefcaseBusiness, Check, RotateCcw, UserRoundMinus } from 'lucide-react';
import { AppContextMenu, AppContextMenuItem, type AppContextMenuPosition } from '../../components/AppContextMenu';
import { AppDialog } from '../../components/AppDialog';
import { ORG_CARD_COLORS, type OrgCardColor } from './organigrammeCardColors';

interface MenuProps {
  name: string;
  color: OrgCardColor | null;
  position: AppContextMenuPosition;
  onClose: () => void;
  onSelectColor: (color: OrgCardColor | null) => void;
  onEditFunction: () => void;
  assignmentRemoval?: { label: string; onSelect: () => void };
}

export function OrgPersonCardMenu({ name, color, position, onClose, onSelectColor, onEditFunction, assignmentRemoval }: MenuProps) {
  return createPortal(<div onKeyDown={(event) => {
    if (event.key === 'Tab') onClose();
  }}>
    <AppContextMenu label={'Couleur et fonction de ' + name} position={position} onClose={onClose}>
      <AppContextMenuItem onSelect={onEditFunction}>
        <BriefcaseBusiness size={16} aria-hidden="true" />Fonction temporaire…
      </AppContextMenuItem>
      {assignmentRemoval && <AppContextMenuItem onSelect={assignmentRemoval.onSelect}>
        <UserRoundMinus size={16} aria-hidden="true" />{assignmentRemoval.label}
      </AppContextMenuItem>}
      <div className="app-context-menu__label" aria-hidden="true">Couleur de la carte</div>
      <AppContextMenuItem onSelect={() => onSelectColor(null)}>
        <RotateCcw size={16} aria-hidden="true" />Couleur par défaut
        {color === null && <Check size={15} className="org-card-color-current" aria-label="Couleur actuelle" />}
      </AppContextMenuItem>
      {(Object.keys(ORG_CARD_COLORS) as OrgCardColor[]).map((value) => {
        const choice = ORG_CARD_COLORS[value];
        return <AppContextMenuItem key={value} onSelect={() => onSelectColor(value)}>
          <span className="org-card-color-swatch" style={{ backgroundColor: choice.fill }} aria-hidden="true" />{choice.label}
          {color === value && <Check size={15} className="org-card-color-current" aria-label="Couleur actuelle" />}
        </AppContextMenuItem>;
      })}
    </AppContextMenu>
  </div>, document.body);
}

interface FunctionProps {
  name: string;
  initialValue: string;
  onSave: (label: string | null) => Promise<void>;
  onClose: () => void;
}

export function OrgTemporaryFunctionDialog({ name, initialValue, onSave, onClose }: FunctionProps) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const label = value.trim();
  const valid = Boolean(label && label !== initialValue);

  async function save(next: string | null) {
    if (saving) return;
    setSaving(true);
    setError('');
    try { await onSave(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }

  return createPortal(<AppDialog
    size="sm"
    title={'Fonction temporaire de ' + name}
    description="Cette fonction s’affiche uniquement dans l’organigramme sélectionné."
    isBusy={saving}
    onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); if (valid) void save(label); }}
    footer={<div className="app-dialog__actions">
      <button type="button" disabled={saving} onClick={onClose}>Annuler</button>
      {initialValue && <button type="button" disabled={saving} onClick={() => void save(null)}>Retirer la fonction temporaire</button>}
      <button type="submit" className="is-primary" disabled={!valid || saving}>Enregistrer</button>
    </div>}
  >
    <label className="org-card-function-field">Fonction temporaire
      <input value={value} onChange={(event) => setValue(event.target.value)} maxLength={300} disabled={saving} autoFocus />
    </label>
    {error && <p className="org-error" role="alert">{error}</p>}
  </AppDialog>, document.body);
}
