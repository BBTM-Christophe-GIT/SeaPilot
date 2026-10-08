export interface OrgExportContent {
  showPhotos?: boolean;
  showEmails?: boolean;
  showPhones?: boolean;
  showFunctions?: boolean;
  showVessels: boolean;
  showWatches?: boolean;
}

export function OrgExportFields({ options, onChange, disabled = false }: { options: OrgExportContent; onChange: (key: keyof OrgExportContent, value: boolean) => void; disabled?: boolean }) {
  return <fieldset className="org-export-fields" disabled={disabled}>
    <legend>Informations à inclure</legend>
    {([
      { key: 'showPhotos', label: 'Photos', accessible: 'Inclure les photos dans les exports', checked: options.showPhotos !== false },
      { key: 'showEmails', label: 'E-mails', accessible: 'Inclure les e-mails dans les exports', checked: !!options.showEmails },
      { key: 'showPhones', label: 'Téléphones', accessible: 'Inclure les téléphones dans les exports', checked: !!options.showPhones },
      { key: 'showFunctions', label: 'Fonctions', accessible: 'Inclure les fonctions dans les exports', checked: options.showFunctions !== false },
      { key: 'showVessels', label: 'Navires', accessible: 'Inclure les navires dans les exports', checked: options.showVessels },
      { key: 'showWatches', label: 'Bordées', accessible: 'Inclure les bordées dans les exports', checked: options.showWatches !== false },
    ] as const).map(({ key, label, accessible, checked }) => <label key={key}><input type="checkbox" aria-label={accessible} checked={checked} onChange={(event) => onChange(key, event.target.checked)} />{label}</label>)}
  </fieldset>;
}
