import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationLogoProvider, useApplicationLogo } from './ApplicationLogoProvider';
import { DEFAULT_APPLICATION_LOGO, type ApplicationBranding } from './applicationLogo';
import { SeaPilotLogo } from '../../components/SeaPilotLogo';

const path = 'logos/ba870000-0000-4000-8000-000000000001/ba870000-0000-4000-8000-000000000101.png';
const newer: ApplicationBranding = { logoPath: path, revision: 5, canManage: true, updatedAt: null };
const older: ApplicationBranding = { logoPath: null, revision: 1, canManage: false, updatedAt: null };
function Probe() {
  const { logoUrl, isCustom, applyBranding, setPreviewLogo } = useApplicationLogo();
  return <><img alt="Application logo" src={logoUrl} /><span>{isCustom ? 'Custom logo' : 'Default logo'}</span>
    <button onClick={() => applyBranding(newer)}>Apply saved logo</button>
    <button onClick={() => setPreviewLogo(new File(['preview'], 'logo.png', { type: 'image/png' }))}>Preview logo</button>
    <button onClick={() => setPreviewLogo(null)}>Reset preview</button></>;
}
function LogoControls() {
  const { applyBranding } = useApplicationLogo();
  return <><SeaPilotLogo /><button onClick={() => applyBranding({ ...older, revision: 6 })}>Apply reset</button></>;
}
function clientFixture() {
  const publicUrl = vi.fn((logoPath: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/application-branding/${logoPath}` } }));
  const client = { rpc: vi.fn(), storage: { from: vi.fn(() => ({ getPublicUrl: publicUrl })) } };
  return { client, publicUrl, sdk: client as unknown as SupabaseClient };
}
afterEach(() => vi.restoreAllMocks());

describe('application logo shared state', () => {
  it('starts with the offline bundled logo when no provider is present', () => {
    render(<Probe />);
    expect(screen.getByRole('img')).toHaveAttribute('src', DEFAULT_APPLICATION_LOGO);
    expect(screen.getByText('Default logo')).toBeInTheDocument();
  });

  it('keeps the bundled logo when public configuration is unavailable and retries on focus', async () => {
    const { client, sdk } = clientFixture();
    client.rpc.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ data: newer, error: null });
    render(<ApplicationLogoProvider client={sdk} previewMode={false}><Probe /></ApplicationLogoProvider>);
    await waitFor(() => expect(client.rpc).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('img')).toHaveAttribute('src', DEFAULT_APPLICATION_LOGO);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining(path)));
    expect(screen.getByText('Custom logo')).toBeInTheDocument();
  });

  it('keeps a newer successful save when an older pre-save fetch finishes late', async () => {
    const { client, sdk } = clientFixture();
    let resolveFetch!: (response: { data: ApplicationBranding; error: null }) => void;
    client.rpc.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    render(<ApplicationLogoProvider client={sdk} previewMode={false}><Probe /></ApplicationLogoProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Apply saved logo' }));
    await act(async () => { resolveFetch({ data: older, error: null }); });
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining(path));
    expect(screen.getByText('Custom logo')).toBeInTheDocument();
  });

  it('ignores a completed fetch after unmount and removes its focus subscription', async () => {
    const { client, publicUrl, sdk } = clientFixture();
    let resolveFetch!: (response: { data: ApplicationBranding; error: null }) => void;
    client.rpc.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const view = render(<ApplicationLogoProvider client={sdk} previewMode={false}><Probe /></ApplicationLogoProvider>);
    view.unmount();
    await act(async () => { resolveFetch({ data: newer, error: null }); window.dispatchEvent(new Event('focus')); });
    expect(publicUrl).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('uses the custom contain layout and restores the bundled layout after a saved reset', async () => {
    const { client, sdk } = clientFixture();
    client.rpc.mockResolvedValue({ data: newer, error: null });
    render(<ApplicationLogoProvider client={sdk} previewMode={false}><LogoControls /></ApplicationLogoProvider>);
    const image = screen.getByRole('img', { name: 'SeaPilot by BBTM' });
    await waitFor(() => expect(image).toHaveAttribute('src', expect.stringContaining(path)));
    expect(image.parentElement).toHaveClass('is-custom-logo');
    fireEvent.click(screen.getByRole('button', { name: 'Apply reset' }));
    expect(image).toHaveAttribute('src', DEFAULT_APPLICATION_LOGO);
    expect(image.parentElement).not.toHaveClass('is-custom-logo');
  });

  it('falls back to the bundled image and layout when a published custom image fails to load', async () => {
    const { client, sdk } = clientFixture();
    client.rpc.mockResolvedValue({ data: newer, error: null });
    render(<ApplicationLogoProvider client={sdk} previewMode={false}><LogoControls /></ApplicationLogoProvider>);
    const image = screen.getByRole('img', { name: 'SeaPilot by BBTM' });
    await waitFor(() => expect(image).toHaveAttribute('src', expect.stringContaining(path)));
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', DEFAULT_APPLICATION_LOGO);
    expect(image.parentElement).not.toHaveClass('is-custom-logo');
  });

  it('previews and resets locally on preview hosts without reading or writing production branding', () => {
    const { client, sdk } = clientFixture();
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview-logo') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    try {
      const view = render(<ApplicationLogoProvider client={sdk} previewMode><Probe /></ApplicationLogoProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Preview logo' }));
      expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview-logo');
      fireEvent.click(screen.getByRole('button', { name: 'Reset preview' }));
      expect(screen.getByRole('img')).toHaveAttribute('src', DEFAULT_APPLICATION_LOGO);
      expect(revoke).toHaveBeenCalledWith('blob:preview-logo');
      fireEvent.click(screen.getByRole('button', { name: 'Preview logo' }));
      view.unmount();
      expect(revoke).toHaveBeenCalledTimes(2);
      expect(client.rpc).not.toHaveBeenCalled();
      expect(client.storage.from).not.toHaveBeenCalled();
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate); else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke); else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
