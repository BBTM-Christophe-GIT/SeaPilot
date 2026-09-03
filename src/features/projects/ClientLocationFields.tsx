import { useEffect, useRef, useState } from 'react';
import {
  fetchFrenchCitiesByPostalCode,
  inferClientCountry,
  isFrenchClientLocation,
  isFrenchPostalCode,
  normalizeClientPostalCode,
  type ClientCitySuggestion,
  type ClientLocationValue,
} from './clientLocation';

type PostalLookupStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'foreign';

interface ClientLocationFieldsProps {
  onChange: (patch: Partial<ClientLocationValue>) => void;
  value: ClientLocationValue;
}

export function ClientLocationFields({ onChange, value }: ClientLocationFieldsProps) {
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [citySuggestions, setCitySuggestions] = useState<ClientCitySuggestion[]>([]);
  const [manualCity, setManualCity] = useState(Boolean(value.city));
  const [status, setStatus] = useState<PostalLookupStatus>('idle');
  const explicitCountry = inferClientCountry(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    if (explicitCountry && explicitCountry !== value.country) onChangeRef.current({ country: explicitCountry });
  }, [explicitCountry, value.country]);

  useEffect(() => {
    const postalCode = normalizeClientPostalCode(value.postalCode);
    if (explicitCountry && explicitCountry !== 'France') {
      setCitySuggestions([]);
      setManualCity(true);
      setStatus('foreign');
      return undefined;
    }
    if (!postalCode) {
      setCitySuggestions([]);
      setManualCity(Boolean(value.city));
      setStatus('idle');
      return undefined;
    }
    if (!isFrenchPostalCode(postalCode)) {
      setCitySuggestions([]);
      setManualCity(true);
      setStatus('foreign');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const cities = await fetchFrenchCitiesByPostalCode(postalCode, { signal: controller.signal });
        if (!cities.length) {
          setCitySuggestions([]);
          setManualCity(true);
          setStatus('empty');
          return;
        }
        setCitySuggestions(cities);
        setManualCity(false);
        setStatus('ready');
        const currentCity = valueRef.current.city;
        onChangeRef.current({
          city: cities.some((city) => city.name === currentCity) ? currentCity : cities[0].name,
          country: 'France',
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setCitySuggestions([]);
        setManualCity(true);
        setStatus('error');
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [explicitCountry, value.postalCode]);

  useEffect(() => {
    if (explicitCountry || status === 'ready' || (!value.address.trim() && !value.city.trim())) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        if (await isFrenchClientLocation(value, { signal: controller.signal })) {
          onChangeRef.current({ country: 'France' });
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setStatus((current) => current === 'ready' ? current : 'error');
      }
    }, 550);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [explicitCountry, status, value.address, value.city, value.postalCode]);

  const statusText = status === 'loading'
    ? 'Recherche des communes…'
    : status === 'ready'
      ? citySuggestions.length > 1
        ? `${citySuggestions.length} villes proposées. Le pays sera enregistré automatiquement.`
        : 'Ville présélectionnée. Le pays sera enregistré automatiquement.'
      : status === 'empty'
        ? 'Aucune commune française reconnue : utilisez « Autre ville ».'
        : status === 'error'
          ? 'Service temporairement indisponible : la saisie libre reste disponible.'
          : status === 'foreign'
            ? 'Adresse étrangère : utilisez « Autre ville ». Le pays sera détecté depuis l’adresse.'
            : 'Saisissez un code postal pour proposer les villes.';

  const selectedCity = manualCity ? '__manual__' : value.city;
  return (
    <>
      <label>
        <span>Code postal</span>
        <input
          autoComplete="postal-code"
          onChange={(event) => onChange({ postalCode: event.target.value })}
          placeholder="Ex. 50340"
          value={value.postalCode}
        />
      </label>
      <label>
        <span>Ville</span>
        <select
          aria-describedby="client-location-status"
          onChange={(event) => {
            if (event.target.value === '__manual__') {
              setManualCity(true);
              onChange({ city: '' });
              return;
            }
            setManualCity(false);
            onChange({ city: event.target.value, country: event.target.value ? 'France' : value.country });
          }}
          value={selectedCity}
        >
          <option value="">{status === 'loading' ? 'Recherche en cours…' : 'Sélectionner une ville'}</option>
          {citySuggestions.map((city) => <option key={city.name} value={city.name}>{city.name}</option>)}
          <option value="__manual__">Autre ville…</option>
        </select>
        {manualCity ? (
          <input
            aria-label="Ville (saisie libre)"
            autoComplete="address-level2"
            onChange={(event) => onChange({ city: event.target.value })}
            placeholder="Nom de la ville"
            value={value.city}
          />
        ) : null}
      </label>
      <p aria-live="polite" className="sr-only" id="client-location-status">{statusText}</p>
    </>
  );
}
