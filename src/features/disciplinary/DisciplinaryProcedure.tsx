import { deadlines, frenchDate, LEGAL_REVIEWED_ON, LEGAL_SOURCES, procedureNotes, type DisciplinaryForm } from './disciplinaryModel';

export function DisciplinaryProcedure({ form }: { form: DisciplinaryForm }) {
  const dates = deadlines(form);
  return <aside className="disciplinary-procedure" aria-label="Procédure légale">
    <h2>Procédure légale</h2>
    <dl className="disciplinary-deadlines">
      <dt>Engager au plus tard</dt><dd>{frenchDate(dates.initiateBy)}</dd>
      {dates.interviewFrom ? <><dt>Entretien au plus tôt</dt><dd>{frenchDate(dates.interviewFrom)}</dd></> : null}
      {dates.notifyFrom ? <><dt>Notification à partir du</dt><dd>{frenchDate(dates.notifyFrom)}</dd><dt>Notification au plus tard</dt><dd>{frenchDate(dates.notifyBy)}</dd></> : null}
    </dl>
    <p className="disciplinary-muted">Calendrier indicatif : repos le dimanche, jours fériés nationaux chômés et jours supplémentaires saisis. Vérifier les règles propres au salarié et les éventuelles exceptions.</p>
    <ol>{procedureNotes(form).map((note) => <li key={note.title}><h3>{note.title}</h3><p>{note.text}</p></li>)}</ol>
    <details><summary>Sources officielles</summary>{LEGAL_SOURCES.map((source) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}<small>Vérifiées le {frenchDate(LEGAL_REVIEWED_ON)}</small></details>
    <details><summary>Guide complémentaire</summary><a href="https://fr.indeed.com/recrutement/c/info/sanction-disciplinaire-procedure-et-modele-de-lettre" target="_blank" rel="noreferrer">Indeed · procédure et modèle de lettre</a><p>Les délais affichés suivent les sources officielles. Pour contester, le délai général est de 2 ans pour l’exécution du contrat ou 12 mois pour sa rupture, sous réserve des règles particulières.</p></details>
  </aside>;
}
