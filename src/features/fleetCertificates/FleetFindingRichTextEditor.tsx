import {
  AlignCenter, AlignLeft, AlignRight, Bold, Italic, Link, List, ListOrdered, RemoveFormatting, Underline,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  FLEET_FINDING_ACTION_MAX_LENGTH,
  fleetFindingActionToHtml,
  fleetFindingActionToPlainText,
  sanitizeFleetFindingActionHtml,
} from './fleetFindingRichText';

interface FleetFindingRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type EditorCommand = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'removeFormat';

export function FleetFindingRichTextEditor({ value, onChange }: FleetFindingRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = value ? fleetFindingActionToHtml(value) : '';
    if (sanitizeFleetFindingActionHtml(editor.innerHTML) !== sanitizeFleetFindingActionHtml(nextHtml)) editor.innerHTML = nextHtml;
  }, [value]);

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selectionRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
  }

  function emitValue() {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeFleetFindingActionHtml(editor.innerHTML);
    if (fleetFindingActionToPlainText(sanitized).length > FLEET_FINDING_ACTION_MAX_LENGTH) {
      editor.innerHTML = fleetFindingActionToHtml(value);
      return;
    }
    onChange(sanitized);
  }

  function runCommand(command: EditorCommand) {
    restoreSelection();
    document.execCommand(command, false);
    rememberSelection();
    emitValue();
  }

  function formatBlock(tagName: string) {
    restoreSelection();
    document.execCommand('formatBlock', false, tagName);
    rememberSelection();
    emitValue();
  }

  function createLink() {
    restoreSelection();
    const href = window.prompt('Adresse du lien (https:// ou mailto:)');
    if (!href) return;
    if (!/^(https?:|mailto:)/iu.test(href.trim())) {
      window.alert('Le lien doit commencer par https://, http:// ou mailto:.');
      return;
    }
    document.execCommand('createLink', false, href.trim());
    emitValue();
  }

  const toolbarButton = (label: string, command: EditorCommand, icon: ReactNode) => (
    <button aria-label={label} onClick={() => runCommand(command)} onMouseDown={(event) => event.preventDefault()} title={label} type="button">{icon}</button>
  );

  return <div className="fcx-corrective-rich-editor">
    <div aria-label="Mise en forme de l’action corrective" className="fcx-corrective-rich-toolbar" role="toolbar">
      <select aria-label="Style de l’action corrective" defaultValue="p" onChange={(event) => formatBlock(event.target.value)} onMouseDown={rememberSelection}>
        <option value="p">Normal</option><option value="h2">Titre</option><option value="h3">Sous-titre</option><option value="blockquote">Citation</option>
      </select>
      <i aria-hidden="true" />
      {toolbarButton('Gras', 'bold', <Bold size={15} />)}
      {toolbarButton('Italique', 'italic', <Italic size={15} />)}
      {toolbarButton('Souligné', 'underline', <Underline size={15} />)}
      <i aria-hidden="true" />
      {toolbarButton('Liste à puces', 'insertUnorderedList', <List size={15} />)}
      {toolbarButton('Liste numérotée', 'insertOrderedList', <ListOrdered size={15} />)}
      <i aria-hidden="true" />
      {toolbarButton('Aligner à gauche', 'justifyLeft', <AlignLeft size={15} />)}
      {toolbarButton('Centrer', 'justifyCenter', <AlignCenter size={15} />)}
      {toolbarButton('Aligner à droite', 'justifyRight', <AlignRight size={15} />)}
      <i aria-hidden="true" />
      <button aria-label="Ajouter un lien" onClick={createLink} onMouseDown={(event) => event.preventDefault()} title="Ajouter un lien" type="button"><Link size={15} /></button>
      {toolbarButton('Effacer la mise en forme', 'removeFormat', <RemoveFormatting size={15} />)}
    </div>
    <div
      aria-label="Action corrective"
      aria-multiline="true"
      className="fcx-corrective-rich-content"
      contentEditable
      data-placeholder="Décrivez l’action à réaliser, les moyens prévus et les critères de clôture…"
      onBlur={rememberSelection}
      onInput={emitValue}
      onKeyUp={rememberSelection}
      onMouseUp={rememberSelection}
      ref={editorRef}
      role="textbox"
      suppressContentEditableWarning
    />
  </div>;
}
