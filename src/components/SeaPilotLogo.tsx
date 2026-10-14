import { useState } from 'react';
import { useApplicationLogo } from '../features/branding/ApplicationLogoProvider';
import { DEFAULT_APPLICATION_LOGO } from '../features/branding/applicationLogo';
import './SeaPilotLogo.css';

export function SeaPilotLogo() {
  const { logoUrl } = useApplicationLogo();
  const [failedUrl, setFailedUrl] = useState('');
  const failed = failedUrl === logoUrl;
  return <span className="seapilot-logo">
    <img src={failed ? DEFAULT_APPLICATION_LOGO : logoUrl} alt="SeaPilot by BBTM" onError={() => setFailedUrl(logoUrl)} />
  </span>;
}
