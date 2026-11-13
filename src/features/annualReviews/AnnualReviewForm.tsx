import { BookOpenCheck, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
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
  createAnnualReviewGoal,
  type AnnualReviewAnswers,
  type AnnualReviewGoal,
  type AnnualReviewTabKey,
} from './annualReviewQuestionnaire';

interface AnnualReviewQuestionnaireProps {
  answers: AnnualReviewAnswers;
  collaboratorAnswers?: AnnualReviewAnswers;
  activeTab: AnnualReviewTabKey;
  readOnly?: boolean;
  onChange: (answers: AnnualReviewAnswers) => void;
  onTabChange: (tab: AnnualReviewTabKey) => void;
}

const EVOLUTION_DETAILS = [
  { pattern: /^2\./u, field: 'desiredPosition', label: 'Quel poste souhaitez-vous ?' },
  { pattern: /^3\./u, field: 'desiredTraining', label: 'Quelle formation souhaitez-vous ?' },
  { pattern: /^[45]\./u, field: 'reasons', label: 'Pour quelles raisons ?' },
] as const;

export function AnnualReviewQuestionnaire({ answers, collaboratorAnswers, activeTab, readOnly = false, onChange, onTabChange }: AnnualReviewQuestionnaireProps) {
  const goals = answers.goals || [];
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
                  const shared = collaboratorAnswers?.evaluation[question.id];
                  const editableRating = (
                    <>
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
                    </>
                  );
                  return (
                    <article className="annual-review-rating-card" key={question.id}>
                      <strong>{question.label}</strong>
                      {collaboratorAnswers ? (
                        <ResponsePair collaborator={<RatingAnswer {...shared} />}>
                          {readOnly ? <RatingAnswer {...response} /> : editableRating}
                        </ResponsePair>
                      ) : editableRating}
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
              <TextAreaField
                disabled={readOnly} help={prompt.help} key={prompt.id} label={prompt.label}
                onChange={(value) => onChange({ ...answers, esg: { ...answers.esg, [prompt.id]: value } })}
                sharedValue={collaboratorAnswers ? collaboratorAnswers.esg?.[prompt.id] ?? '' : undefined}
                value={answers.esg?.[prompt.id] ?? ''}
              />
            ))}
          </section>
        ) : null}
        {activeTab === 'life' ? (
          <section className="annual-review-form-section">
            <header><span>03</span><div><p>Expression du collaborateur</p><h2>Ma vie au sein de l’entreprise</h2></div></header>
            <ChoiceField disabled={readOnly} label="D’une manière générale, je suis… de ma présence dans l’entreprise BBTM" name="overall-satisfaction" onChange={(overall) => onChange({ ...answers, life: { ...answers.life, overall } })} options={ANNUAL_REVIEW_SATISFACTION} sharedValue={collaboratorAnswers?.life.overall} value={answers.life.overall} />
            <h3>Évaluation de mes conditions de travail</h3>
            <div className="annual-review-condition-grid">
              {ANNUAL_REVIEW_WORK_CONDITIONS.map(([id, label]) => (
                <ChoiceField disabled={readOnly} key={id} label={label} name={`condition-${id}`} onChange={(value) => onChange({ ...answers, life: { ...answers.life, conditions: { ...answers.life.conditions, [id]: value } } })} options={ANNUAL_REVIEW_SATISFACTION} sharedValue={collaboratorAnswers ? collaboratorAnswers.life.conditions[id] || '' : undefined} value={answers.life.conditions[id] || ''} />
              ))}
            </div>
            <TextAreaField disabled={readOnly} help="Texte libre facultatif" label="Pourquoi ?" onChange={(why) => onChange({ ...answers, life: { ...answers.life, why } })} sharedValue={collaboratorAnswers ? collaboratorAnswers.life.why ?? '' : undefined} value={answers.life.why ?? ''} />
          </section>
        ) : null}
        {activeTab === 'evolution' ? (
          <section className="annual-review-form-section">
            <header><span>04</span><div><p>Projection</p><h2>Évolution professionnelle et personnelle</h2></div></header>
            <ResponseField className="annual-review-select-field" isComparison={Boolean(collaboratorAnswers)} label="Dans les années à venir, je souhaite">
              <ComparedField disabled={readOnly} sharedValue={collaboratorAnswers?.evolution.choice} value={answers.evolution.choice}>
                <select aria-label="Dans les années à venir, je souhaite" disabled={readOnly} onChange={(event) => onChange({ ...answers, evolution: { ...answers.evolution, choice: event.target.value } })} value={answers.evolution.choice}><option value="">Sélectionner une réponse</option>{ANNUAL_REVIEW_EVOLUTION_CHOICES.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>
              </ComparedField>
            </ResponseField>
            {EVOLUTION_DETAILS.map(({ pattern, field, label }) => {
              const appliesToManagement = pattern.test(answers.evolution.choice);
              const appliesToCollaborator = pattern.test(collaboratorAnswers?.evolution.choice || '');
              if (!appliesToManagement && !appliesToCollaborator) return null;
              return (
                <TextAreaField
                  disabled={readOnly} key={field} label={label}
                  onChange={(value) => onChange({ ...answers, evolution: { ...answers.evolution, [field]: value } })}
                  sharedValue={collaboratorAnswers ? appliesToCollaborator ? collaboratorAnswers.evolution[field] ?? '' : null : undefined}
                  value={appliesToManagement ? answers.evolution[field] ?? '' : null}
                />
              );
            })}
            <TextAreaField disabled={readOnly} label="Autres informations que je souhaite porter à la connaissance de la compagnie" onChange={(other) => onChange({ ...answers, evolution: { ...answers.evolution, other } })} sharedValue={collaboratorAnswers ? collaboratorAnswers.evolution.other ?? '' : undefined} value={answers.evolution.other ?? ''} />
          </section>
        ) : null}
        {activeTab === 'objectives' ? (
          <section className="annual-review-form-section">
            <header><span>05</span><div><p>Cap sur l’année prochaine</p><h2>Objectifs personnels</h2></div></header>
            <div className="annual-review-goals-heading"><div><strong>Objectifs de l’année N+1</strong>{!readOnly ? <small>Ajoutez autant d’objectifs que nécessaire et indiquez leur niveau d’atteinte initial.</small> : null}</div>{!collaboratorAnswers && !readOnly ? <AddGoalButton onClick={() => onChange({ ...answers, goals: [...goals, createAnnualReviewGoal()] })} /> : null}</div>
            {collaboratorAnswers ? (
              <ResponsePair collaborator={<GoalList goals={collaboratorAnswers.goals ?? []} />}>
                <GoalList goals={goals} onChange={readOnly ? undefined : (goals) => onChange({ ...answers, goals })} showAddButton />
              </ResponsePair>
            ) : <GoalList goals={goals} onChange={readOnly ? undefined : (goals) => onChange({ ...answers, goals })} />}
            <div className="annual-review-rich-field"><strong>Commentaire général</strong>{!readOnly ? <small>Ajoutez les moyens nécessaires, le contexte ou les points de vigilance.</small> : null}</div>
            <ComparedField disabled={readOnly} rich sharedValue={collaboratorAnswers?.objectives} value={answers.objectives}>
              {readOnly ? <div className="annual-review-rich-readonly"><RichAnswer value={answers.objectives} /></div> : <ServiceNoteRichTextEditor ariaLabel="Commentaire général" onChange={(objectives) => onChange({ ...answers, objectives })} placeholder="Saisissez le commentaire général…" toolbarLabel="Mise en forme du commentaire général" value={answers.objectives} />}
            </ComparedField>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function ResponsePair({ collaborator, children }: { collaborator: ReactNode; children: ReactNode }) {
  return (
    <div className="annual-review-response-pair">
      <div aria-label="Collaborateur" className="annual-review-answer is-collaborator" role="group">
        <strong className="annual-review-answer-label">Collaborateur</strong>
        {collaborator}
      </div>
      <div aria-label="Management" className="annual-review-answer is-management" role="group">
        <strong className="annual-review-answer-label">Management</strong>
        {children}
      </div>
    </div>
  );
}

function AnswerText({ value }: { value?: string | null }) {
  return value?.trim()
    ? <p className="annual-review-answer-text">{value}</p>
    : <p className="annual-review-answer-empty">{value === null ? 'Sans objet' : 'Non renseigné'}</p>;
}

function RatingAnswer({ rating, comment }: { rating?: string; comment?: string }) {
  return <><AnswerText value={rating} />{comment ? <AnswerText value={comment} /> : null}</>;
}

function RichAnswer({ value }: { value: string }) {
  const html = value.trim() ? sanitizeServiceNoteHtml(value) : '';
  return html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <AnswerText />;
}

function ComparedField({ children, disabled, rich, sharedValue, value }: {
  children: ReactNode; disabled: boolean; rich?: boolean; sharedValue?: string | null; value: string | null;
}) {
  if (sharedValue === undefined) return children;
  const displayAnswer = (answer: string | null) => rich ? <RichAnswer value={answer ?? ''} /> : <AnswerText value={answer} />;
  return (
    <ResponsePair collaborator={displayAnswer(sharedValue)}>
      {disabled || value === null ? displayAnswer(value) : children}
    </ResponsePair>
  );
}

function ResponseField({ children, className, help, isComparison, label }: {
  children: ReactNode; className: string; help?: string; isComparison: boolean; label: string;
}) {
  const Tag = isComparison ? 'div' : 'label';
  return <Tag className={className}><strong>{label}</strong>{help ? <small>{help}</small> : null}{children}</Tag>;
}

function ChoiceField({ label, name, options, sharedValue, value, disabled, onChange }: {
  label: string; name: string; options: readonly string[]; sharedValue?: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  return (
    <fieldset className="annual-review-choice-field">
      <legend>{label}</legend>
      <ComparedField disabled={disabled} sharedValue={sharedValue} value={value}>
        <div className="annual-review-choice-options" role={sharedValue === undefined ? undefined : 'radiogroup'} aria-label={sharedValue === undefined ? undefined : label}>
          {options.map((option) => <label className={value === option ? 'is-selected' : ''} key={option}><input checked={value === option} disabled={disabled} name={name} onChange={() => onChange(option)} type="radio" value={option} />{option}</label>)}
        </div>
      </ComparedField>
    </fieldset>
  );
}

function TextAreaField({ label, value, disabled, help, sharedValue, onChange }: {
  label: string; value: string | null; disabled: boolean; help?: string; sharedValue?: string | null; onChange: (value: string) => void;
}) {
  return (
    <ResponseField className="annual-review-long-field" help={help} isComparison={sharedValue !== undefined} label={label}>
      <ComparedField disabled={disabled} sharedValue={sharedValue} value={value}>
        <textarea aria-label={sharedValue === undefined ? undefined : label} disabled={disabled} maxLength={4_000} onChange={(event) => onChange(event.target.value)} rows={5} value={value ?? ''} />
      </ComparedField>
    </ResponseField>
  );
}

function AddGoalButton({ onClick }: { onClick: () => void }) {
  return <button className="is-secondary" onClick={onClick} type="button"><Plus size={16} />Ajouter un objectif</button>;
}

function GoalList({ goals, onChange, showAddButton }: {
  goals: AnnualReviewGoal[]; onChange?: (goals: AnnualReviewGoal[]) => void; showAddButton?: boolean;
}) {
  return (
    <div className="annual-review-goals">
      {goals.map((goal, index) => (
        <article className="annual-review-goal" key={goal.id}>
          <header><strong>Objectif {index + 1}</strong>{onChange ? <button aria-label={`Supprimer l’objectif ${index + 1}`} className="is-secondary" onClick={() => onChange(goals.filter((item) => item.id !== goal.id))} type="button"><Trash2 size={15} /></button> : null}</header>
          {onChange ? (
            <>
              <label><strong>Objectif</strong><input maxLength={1_000} onChange={(event) => onChange(goals.map((item) => item.id === goal.id ? { ...item, objective: event.target.value } : item))} value={goal.objective} /></label>
              <label className="annual-review-goal-progress"><strong>Pourcentage d’atteinte</strong><div><input aria-label={`Pourcentage d’atteinte de l’objectif ${index + 1}`} max="100" min="0" onChange={(event) => onChange(goals.map((item) => item.id === goal.id ? { ...item, progress: Number(event.target.value) } : item))} step="1" type="range" value={goal.progress} /><output>{goal.progress} %</output></div></label>
              <label><strong>Commentaire</strong><textarea maxLength={2_000} onChange={(event) => onChange(goals.map((item) => item.id === goal.id ? { ...item, comment: event.target.value } : item))} rows={3} value={goal.comment} /></label>
            </>
          ) : (
            <div className="annual-review-goal-summary">
              <AnswerText value={goal.objective} />
              <p>Pourcentage d’atteinte initial · {goal.progress} %</p>
              {goal.comment ? <AnswerText value={goal.comment} /> : null}
            </div>
          )}
        </article>
      ))}
      {!goals.length ? <p className="annual-review-answer-empty">Aucun objectif ajouté.</p> : null}
      {showAddButton && onChange ? <div><AddGoalButton onClick={() => onChange([...goals, createAnnualReviewGoal()])} /></div> : null}
    </div>
  );
}

function GuideSection() {
  return (
    <section className="annual-review-guide">
      <header><BookOpenCheck aria-hidden="true" size={28} /><div><p>À consulter à tout moment</p><h2>Guide du collaborateur</h2></div></header>
      {ANNUAL_REVIEW_GUIDE.map((section) => <article key={section.title}><h3>{section.title}</h3>{'paragraphs' in section ? section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}{'subsections' in section ? <div className="annual-review-guide-grid">{section.subsections.map((subsection) => <section key={subsection.title}><h4>{subsection.title}</h4><p>{subsection.body}</p></section>)}</div> : null}{'bullets' in section ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</article>)}
    </section>
  );
}
