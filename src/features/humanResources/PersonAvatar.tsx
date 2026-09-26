import { useState } from 'react';
import type { PersonRecord } from './peopleQueries';

export function PersonAvatar({ person, className }: { person: Pick<PersonRecord, 'firstName' | 'lastName' | 'photoUrl'>; className: string }) {
  const [failedUrl, setFailedUrl] = useState('');
  return <span className={className}>{person.photoUrl && person.photoUrl !== failedUrl
    ? <img src={person.photoUrl} alt={`Photo de ${person.firstName} ${person.lastName}`} onError={() => setFailedUrl(person.photoUrl!)} />
    : `${person.firstName.trim()[0] || ''}${person.lastName.trim()[0] || ''}`.toLocaleUpperCase('fr')}</span>;
}
