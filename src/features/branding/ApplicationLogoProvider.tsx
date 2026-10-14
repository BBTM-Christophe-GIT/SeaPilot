import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isSeaPilotPreviewDeployment } from '../preview/previewMode';
import { applicationLogoUrl, DEFAULT_APPLICATION_LOGO, fetchApplicationBranding, type ApplicationBranding } from './applicationLogo';

interface LogoContextValue {
  logoUrl: string;
  isCustom: boolean;
  applyBranding: (branding: ApplicationBranding) => void;
  setPreviewLogo: (file: File | null) => void;
}

const LogoContext = createContext<LogoContextValue>({ logoUrl: DEFAULT_APPLICATION_LOGO, isCustom: false,
  applyBranding: () => {}, setPreviewLogo: () => {} });

export function ApplicationLogoProvider({ children, client = supabase, previewMode = isSeaPilotPreviewDeployment() }: {
  children: ReactNode; client?: SupabaseClient; previewMode?: boolean;
}) {
  const [logo, setLogo] = useState({ logoUrl: DEFAULT_APPLICATION_LOGO, isCustom: false, revision: -1 });
  const previewUrl = useRef('');
  const applyBranding = useCallback((branding: ApplicationBranding) => {
    if (previewMode) return;
    const logoUrl = applicationLogoUrl(client, branding);
    setLogo((current) => branding.revision < current.revision ? current
      : { logoUrl, isCustom: Boolean(branding.logoPath), revision: branding.revision });
  }, [client, previewMode]);

  const setPreviewLogo = useCallback((file: File | null) => {
    if (!previewMode) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : '';
    setLogo({ logoUrl: previewUrl.current || DEFAULT_APPLICATION_LOGO, isCustom: Boolean(file), revision: -1 });
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;
    let active = true;
    const refresh = () => {
      void fetchApplicationBranding(client).then((branding) => { if (active) applyBranding(branding); }).catch(() => {
        // A temporary configuration/network failure must never block login or remove the bundled logo.
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [client, previewMode, applyBranding]);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  const value = useMemo(() => ({ logoUrl: logo.logoUrl, isCustom: logo.isCustom, applyBranding, setPreviewLogo }), [logo, applyBranding, setPreviewLogo]);
  return <LogoContext.Provider value={value}>{children}</LogoContext.Provider>;
}

export function useApplicationLogo(): LogoContextValue {
  return useContext(LogoContext);
}
