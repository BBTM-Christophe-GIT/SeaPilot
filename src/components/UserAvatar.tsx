import { useState } from 'react';

interface UserAvatarProps {
  initials: string;
  photoUrl?: string;
  className?: string;
  imageAlt?: string;
}

export function UserAvatar({ initials, photoUrl, className = 'user-avatar', imageAlt = '' }: UserAvatarProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string>();
  const source = photoUrl?.trim();
  const hasVisiblePhoto = Boolean(source && source !== failedPhotoUrl);

  return (
    <span aria-hidden={hasVisiblePhoto && imageAlt ? undefined : true} className={className}>
      {hasVisiblePhoto ? (
        <img alt={imageAlt} key={source} onError={() => setFailedPhotoUrl(source)} referrerPolicy="no-referrer" src={source} />
      ) : initials}
    </span>
  );
}
