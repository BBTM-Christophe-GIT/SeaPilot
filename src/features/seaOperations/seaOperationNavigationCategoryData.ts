import raw from './mapData/shom-navigation-categories.json?raw';
import { prepareNavigationCategoryLines } from './seaOperationNavigationCategoryGeometry';

// Loaded on demand, once per browser session. No SHOM request while navigating.
export const navigationCategoryLines = prepareNavigationCategoryLines(JSON.parse(raw));
