export const PLANNING_OUT_OF_PROJECT_CODE = 'HP';
export const PLANNING_OUT_OF_PROJECT_SOURCE = 'seapilot-hors-projet';
export const PLANNING_OUT_OF_PROJECT_NAME_MAX_LENGTH = 300;

const titlePrefix = `${PLANNING_OUT_OF_PROJECT_CODE} - `;

export function isPlanningOutOfProject(project: { sourceLabel: string }): boolean {
  return project.sourceLabel === PLANNING_OUT_OF_PROJECT_SOURCE;
}

export function planningOutOfProjectName(title: string): string {
  return title.startsWith(titlePrefix) ? title.slice(titlePrefix.length) : title;
}

export function planningOutOfProjectTitle(name: string): string {
  return `${titlePrefix}${name.trim()}`;
}
