import {
  AlignCenter, AlignLeft, AlignRight, Bold, Italic, Link, List, ListOrdered, RemoveFormatting, Underline,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  sanitizeServiceNoteHtml, SERVICE_NOTE_FONT_STACK, SERVICE_NOTE_MAX_BODY_LENGTH, serviceNoteBodyToHtml, serviceNoteBodyToPlainText,
} from './serviceNoteRichText';

interface ServiceNoteRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  toolbarLabel?: string;
}

type EditorCommand = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'removeFormat';

export function ServiceNoteRichTextEditor({
  value,
  onChange,
  ariaLabel = 'Contenu',
  placeholder = 'Bonjour, rédigez ici votre note de service…',
  toolbarLabel = 'Mise en forme du message',
}: ServiceNoteRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = value ? serviceNoteBodyToHtml(value) : '';
    if (sanitizeServiceNoteHtml(editor.innerHTML) !== sanitizeServiceNoteHtml(nextHtml)) editor.innerHTML = nextHtml;
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
    const sanitized = sanitizeServiceNoteHtml(editor.innerHTML);
    if (serviceNoteBodyToPlainText(sanitized).length > SERVICE_NOTE_MAX_BODY_LENGTH) {
      editor.innerHTML = serviceNoteBodyToHtml(value);
      return;
    }
    onChange(sanitized);
  }

  function runCommand(command: EditorCommand, commandValue?: string) {
    restoreSelection();
    document.execCommand(command, false, commandValue);
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

  return (
    <div className="service-note-rich-editor" style={{ fontFamily: SERVICE_NOTE_FONT_STACK }}>
      <div aria-label={toolbarLabel} className="service-note-rich-toolbar" role="toolbar">
        <select aria-label="Style de paragraphe" defaultValue="p" onChange={(event) => formatBlock(event.target.value)} onMouseDown={rememberSelection}>
          <option value="p">Normal</option><option value="h2">Titre</option><option value="h3">Sous-titre</option><option value="blockquote">Citation</option>
        </select>
        <select aria-label="Police" defaultValue="Aptos" onChange={(event) => { restoreSelection(); document.execCommand('fontName', false, event.target.value); emitValue(); }} onMouseDown={rememberSelection}>
          <option value="Aptos">Aptos</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option>
        </select>
        <i aria-hidden="true" />
        {toolbarButton('Gras', 'bold', <Bold size={16} />)}
        {toolbarButton('Italique', 'italic', <Italic size={16} />)}
        {toolbarButton('Souligné', 'underline', <Underline size={16} />)}
        <i aria-hidden="true" />
        {toolbarButton('Liste à puces', 'insertUnorderedList', <List size={16} />)}
        {toolbarButton('Liste numérotée', 'insertOrderedList', <ListOrdered size={16} />)}
        <i aria-hidden="true" />
        {toolbarButton('Aligner à gauche', 'justifyLeft', <AlignLeft size={16} />)}
        {toolbarButton('Centrer', 'justifyCenter', <AlignCenter size={16} />)}
        {toolbarButton('Aligner à droite', 'justifyRight', <AlignRight size={16} />)}
        <i aria-hidden="true" />
        <button aria-label="Ajouter un lien" onClick={createLink} onMouseDown={(event) => event.preventDefault()} title="Ajouter un lien" type="button"><Link size={16} /></button>
        {toolbarButton('Effacer la mise en forme', 'removeFormat', <RemoveFormatting size={16} />)}
      </div>
      <div
        aria-label={ariaLabel}
        aria-multiline="true"
        className="service-note-rich-content"
        contentEditable
        data-placeholder={placeholder}
        onBlur={rememberSelection}
        onInput={emitValue}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}
