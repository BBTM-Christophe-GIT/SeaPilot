import { UserAvatar } from '../../components/UserAvatar';
import type { PersonRecord } from './peopleQueries';

export function PersonAvatar({ person, className }: { person: Pick<PersonRecord, 'firstName' | 'lastName' | 'photoUrl'>; className: string }) {
  return <UserAvatar
    className={className}
    imageAlt={`Photo de ${person.firstName} ${person.lastName}`}
    initials={`${person.firstName.trim()[0] || ''}${person.lastName.trim()[0] || ''}`.toLocaleUpperCase('fr')}
    photoUrl={person.photoUrl}
  />;
}
