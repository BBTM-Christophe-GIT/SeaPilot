import { BookOpenCheck, CheckCircle2, Circle } from 'lucide-react';
import { ServiceNoteRichTextEditor } from '../serviceNotes/ServiceNoteRichTextEditor';
import { sanitizeServiceNoteHtml } from '../serviceNotes/serviceNoteRichText';
import {
  ANNUAL_REVIEW_ESG_PROMPTS,
  ANNUAL_REVIEW_EVALUATION_GROUPS,
  ANNUAL_REVIEW_EVOLUTION_CHOICES,
  ANNUAL_REVIEW_GUIDE,
  ANNUAL_REVIEW_RATINGS,
  ANNUAL_REVIEW_SATISFACTION,
  ANNUAL_REVIEW_TABS,
  ANNUAL_REVIEW_WORK_CONDITIONS,
  type AnnualReviewAnswers,
  type AnnualReviewTabKey,
} from './annualReviewQuestionnaire';

interface AnnualReviewQuestionnaireProps {
  answers: AnnualReviewAnswers;
  activeTab: AnnualReviewTabKey;
  readOnly?: boolean;
  onChange: (answers: AnnualReviewAnswers) => void;
  onTabChange: (tab: AnnualReviewTabKey) => void;
}

export function AnnualReviewQuestionnaire({ answers, activeTab, readOnly = false, onChange, onTabChange }: AnnualReviewQuestionnaireProps) {
  const setRating = (questionId: string, rating: string) => onChange({
    ...answers,
    evaluation: { ...answers.evaluation, [questionId]: { rating, comment: answers.evaluation[questionId]?.comment || '' } },
  });
  const setComment = (questionId: string, comment: string) => onChange({
    ...answers,
    evaluation: { ...answers.evaluation, [questionId]: { rating: answers.evaluation[questionId]?.rating || '', comment } },
  });

  return (
    <section className="annual-review-questionnaire">
      <nav aria-label="Sections du questionnaire" className="annual-review-tabs">
        {ANNUAL_REVIEW_TABS.map(([key, label]) => (
          <button aria-current={activeTab === key ? 'page' : undefined} className={activeTab === key ? 'is-active' : ''} key={key} onClick={() => onTabChange(key)} type="button">
            {key === 'guide' ? <BookOpenCheck aria-hidden="true" size={16} /> : null}{label}
          </button>
        ))}
      </nav>

      <div className="annual-review-tab-panel">
        {activeTab === 'guide' ? <GuideSection /> : null}
        {activeTab === 'evaluation' ? (
          <section className="annual-review-form-section">
            <header><span>01</span><div><p>Auto-évaluation et appréciation</p><h2>Critères d’évaluation métier</h2></div></header>
            <p className="annual-review-help">Une seule réponse par critère. Un commentaire peut apporter un exemple ou préciser un axe de progression.</p>
            {ANNUAL_REVIEW_EVALUATION_GROUPS.map((group) => (
              <section className="annual-review-rating-group" key={group.id}>
                <h3>{group.label}</h3>
                {group.questions.map((question) => {
                  const response = answers.evaluation[question.id] || { rating: '', comment: '' };
                  return (
                    <article className="annual-review-rating-card" key={question.id}>
                      <strong>{question.label}</strong>
                      <div className="annual-review-rating-options" role="radiogroup" aria-label={question.label}>
                        {ANNUAL_REVIEW_RATINGS.map((rating) => (
                          <label className={response.rating === rating ? 'is-selected' : ''} key={rating}>
                            <input checked={response.rating === rating} disabled={readOnly} name={`rating-${question.id}`} onChange={() => setRating(question.id, rating)} type="radio" value={rating} />
                            {response.rating === rating ? <CheckCircle2 aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={15} />}
                            <span>{rating}</span>
                          </label>
                        ))}
                      </div>
                      <label className="annual-review-comment-field">Commentaire<textarea disabled={readOnly} maxLength={2_000} onChange={(event) => setComment(question.id, event.target.value)} rows={2} value={response.comment} /></label>
                    </article>
                  );
                })}
              </section>
            ))}
          </section>
        ) : null}
        {activeTab === 'esg' ? (
          <section className="annual-review-form-section">
            <header><span>02</span><div><p>Propositions d’amélioration</p><h2>Performances Environnement, Sociales et de Gouvernance</h2></div></header>
            {ANNUAL_REVIEW_ESG_PROMPTS.map((prompt) => (
              <label className="annual-review-long-field" key={prompt.id}>
                <strong>{prompt.label}</strong>{prompt.help ? <small>{prompt.help}</small> : null}
                <textarea disabled={readOnly} maxLength={4_000} onChange={(event) => onChange({ ...answers, esg: { ...answers.esg, [prompt.id]: event.target.value } })} rows={5} value={answers.esg[prompt.id] || ''} />
              </label>
            ))}
          </section>
        ) : null}
        {activeTab === 'life' ? (
          <section className="annual-review-form-section">
            <header><span>03</span><div><p>Expression du collaborateur</p><h2>Ma vie au sein de l’entreprise</h2></div></header>
            <ChoiceField disabled={readOnly} label="D’une manière générale, je suis… de ma présence dans l’entreprise BBTM" name="overall-satisfaction" onChange={(overall) => onChange({ ...answers, life: { ...answers.life, overall } })} options={ANNUAL_REVIEW_SATISFACTION} value={answers.life.overall} />
            <h3>Évaluation de mes conditions de travail</h3>
            <div className="annual-review-condition-grid">
              {ANNUAL_REVIEW_WORK_CONDITIONS.map(([id, label]) => (
                <ChoiceField disabled={readOnly} key={id} label={label} name={`condition-${id}`} onChange={(value) => onChange({ ...answers, life: { ...answers.life, conditions: { ...answers.life.conditions, [id]: value } } })} options={ANNUAL_REVIEW_SATISFACTION} value={answers.life.conditions[id] || ''} />
              ))}
            </div>
            <label className="annual-review-long-field"><strong>Pourquoi ?</strong><small>Texte libre facultatif</small><textarea disabled={readOnly} maxLength={4_000} onChange={(event) => onChange({ ...answers, life: { ...answers.life, why: event.target.value } })} rows={5} value={answers.life.why} /></label>
          </section>
        ) : null}
        {activeTab === 'evolution' ? (
          <section className="annual-review-form-section">
            <header><span>04</span><div><p>Projection</p><h2>Évolution professionnelle et personnelle</h2></div></header>
            <label className="annual-review-select-field"><strong>Dans les années à venir, je souhaite</strong><select disabled={readOnly} onChange={(event) => onChange({ ...answers, evolution: { ...answers.evolution, choice: event.target.value } })} value={answers.evolution.choice}><option value="">Sélectionner une réponse</option>{ANNUAL_REVIEW_EVOLUTION_CHOICES.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>
            {answers.evolution.choice.startsWith('2.') ? <TextAreaField disabled={readOnly} label="Quel poste souhaitez-vous ?" onChange={(desiredPosition) => onChange({ ...answers, evolution: { ...answers.evolution, desiredPosition } })} value={answers.evolution.desiredPosition} /> : null}
            {answers.evolution.choice.startsWith('3.') ? <TextAreaField disabled={readOnly} label="Quelle formation souhaitez-vous ?" onChange={(desiredTraining) => onChange({ ...answers, evolution: { ...answers.evolution, desiredTraining } })} value={answers.evolution.desiredTraining} /> : null}
            {/^[45]\./u.test(answers.evolution.choice) ? <TextAreaField disabled={readOnly} label="Pour quelles raisons ?" onChange={(reasons) => onChange({ ...answers, evolution: { ...answers.evolution, reasons } })} value={answers.evolution.reasons} /> : null}
            <TextAreaField disabled={readOnly} label="Autres informations que je souhaite porter à la connaissance de la compagnie" onChange={(other) => onChange({ ...answers, evolution: { ...answers.evolution, other } })} value={answers.evolution.other} />
          </section>
        ) : null}
        {activeTab === 'objectives' ? (
          <section className="annual-review-form-section">
            <header><span>05</span><div><p>Cap sur l’année prochaine</p><h2>Objectifs personnels</h2></div></header>
            <label className="annual-review-rich-field"><strong>Objectif(s) personnel(s) pour l’année N+1</strong><small>Décrivez des objectifs concrets, mesurables et les moyens nécessaires.</small></label>
            {readOnly ? <div className="annual-review-rich-readonly" dangerouslySetInnerHTML={{ __html: sanitizeServiceNoteHtml(answers.objectives) }} /> : <ServiceNoteRichTextEditor ariaLabel="Objectifs personnels pour l’année N+1" onChange={(objectives) => onChange({ ...answers, objectives })} placeholder="Décrivez ici vos objectifs personnels…" toolbarLabel="Mise en forme des objectifs" value={answers.objectives} />}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function ChoiceField({ label, name, options, value, disabled, onChange }: { label: string; name: string; options: readonly string[]; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <fieldset className="annual-review-choice-field"><legend>{label}</legend><div>{options.map((option) => <label className={value === option ? 'is-selected' : ''} key={option}><input checked={value === option} disabled={disabled} name={name} onChange={() => onChange(option)} type="radio" value={option} />{option}</label>)}</div></fieldset>;
}

function TextAreaField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="annual-review-long-field"><strong>{label}</strong><textarea disabled={disabled} maxLength={4_000} onChange={(event) => onChange(event.target.value)} rows={5} value={value} /></label>;
}

function GuideSection() {
  return (
    <section className="annual-review-guide">
      <header><BookOpenCheck aria-hidden="true" size={28} /><div><p>À consulter à tout moment</p><h2>Guide du collaborateur</h2></div></header>
      {ANNUAL_REVIEW_GUIDE.map((section) => <article key={section.title}><h3>{section.title}</h3>{'paragraphs' in section ? section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}{'subsections' in section ? <div className="annual-review-guide-grid">{section.subsections.map((subsection) => <section key={subsection.title}><h4>{subsection.title}</h4><p>{subsection.body}</p></section>)}</div> : null}{'bullets' in section ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</article>)}
    </section>
  );
}
