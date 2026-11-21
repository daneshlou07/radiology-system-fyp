import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsSDK } from '../../services/googleMapsService';
import type { Clinic } from '../../types';

export interface FacilityMapOption {
  clinic: Clinic;
  isAvailable: boolean;
  machineState: string;
  distanceKm: number | null;
  durationMin: number | null;
}

interface ReferralRouteMapProps {
  patientCoords: { lat: number; lon: number } | null;
  patientLabel?: string;
  facilities: FacilityMapOption[];
  selectedFacilityId: string;
  onSelectFacility: (clinicId: string) => void;
  heightClass?: string;
}

export default function ReferralRouteMap({
  patientCoords,
  patientLabel = 'Patient Location',
  facilities,
  selectedFacilityId,
  onSelectFacility,
  heightClass = 'h-[340px]',
}: ReferralRouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const onSelectFacilityRef = useRef(onSelectFacility);
  onSelectFacilityRef.current = onSelectFacility;

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const selectedFacility = facilities.find((f) => f.clinic.id === selectedFacilityId)?.clinic || null;
  const pLat = patientCoords?.lat ?? null;
  const pLon = patientCoords?.lon ?? null;
  const fLat = selectedFacility?.latitude ?? null;
  const fLon = selectedFacility?.longitude ?? null;

  // 1. Initialize Google Map once
  useEffect(() => {
    let cancelled = false;

    loadGoogleMapsSDK()
      .then((g) => {
        if (cancelled || !mapContainerRef.current) return;
        const center =
          pLat !== null && pLon !== null
            ? { lat: pLat, lng: pLon }
            : { lat: 3.139, lng: 101.6869 };

        mapRef.current = new g.maps.Map(mapContainerRef.current, {
          center,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Render patient & facility markers
  useEffect(() => {
    const map = mapRef.current;
    const g = (window as any).google as typeof google | undefined;
    if (!mapReady || !map || !g?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (pLat !== null && pLon !== null) {
      const patientMarker = new g.maps.Marker({
        position: { lat: pLat, lng: pLon },
        map,
        title: patientLabel,
        zIndex: 20,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#2563EB',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });
      markersRef.current.push(patientMarker);
    }

    facilities.forEach(({ clinic, isAvailable, distanceKm, durationMin }) => {
      if (!clinic.latitude || !clinic.longitude) return;
      const isSelected = clinic.id === selectedFacilityId;
      const labelExtra =
        distanceKm !== null
          ? ` (${distanceKm} km${durationMin ? `, ${durationMin} min` : ''})`
          : '';

      const marker = new g.maps.Marker({
        position: { lat: clinic.latitude, lng: clinic.longitude },
        map,
        title: `${clinic.name}${labelExtra}${isAvailable ? '' : ' - Unavailable'}`,
        zIndex: isSelected ? 30 : 10,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 11 : 8,
          fillColor: !isAvailable ? '#D97706' : isSelected ? '#0F4C42' : '#10B981',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: isSelected ? 3 : 2,
        },
      });

      if (isAvailable) {
        marker.addListener('click', () => onSelectFacilityRef.current(clinic.id));
      }

      markersRef.current.push(marker);
    });
  }, [mapReady, pLat, pLon, patientLabel, facilities, selectedFacilityId]);

  // 3. Draw driving route ONLY when patient or selected facility coordinates actually change
  useEffect(() => {
    const map = mapRef.current;
    const g = (window as any).google as typeof google | undefined;
    if (!mapReady || !map || !g?.maps) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (pLat === null || pLon === null || fLat === null || fLon === null) {
      if (fLat !== null && fLon !== null) {
        map.setCenter({ lat: fLat, lng: fLon });
        map.setZoom(13);
      }
      return;
    }

    const fitPair = () => {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend({ lat: pLat, lng: pLon });
      bounds.extend({ lat: fLat, lng: fLon });
      map.fitBounds(bounds, 56);
    };

    const drawPath = (path: { lat: number; lng: number }[]) => {
      if (!mapRef.current) return;
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
      const routeBounds = new g.maps.LatLngBounds();
      path.forEach((pt) => routeBounds.extend(pt));

      routePolylineRef.current = new g.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#2563EB',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        zIndex: 15,
        map: mapRef.current,
      });

      mapRef.current.fitBounds(routeBounds, 48);
    };

    const controller = new AbortController();
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${pLon},${pLat};${fLon},${fLat}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const coords: [number, number][] | undefined = data?.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 0) {
          drawPath(coords.map(([lng, lat]) => ({ lat, lng })));
          return;
        }
        // Fallback: try Google DirectionsService if available
        if (g.maps.DirectionsService) {
          const ds = new g.maps.DirectionsService();
          ds.route(
            {
              origin: { lat: pLat, lng: pLon },
              destination: { lat: fLat, lng: fLon },
              travelMode: g.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              if (status === g.maps.DirectionsStatus.OK && result?.routes?.[0]?.overview_path) {
                drawPath(
                  result.routes[0].overview_path.map((pt) => ({ lat: pt.lat(), lng: pt.lng() }))
                );
              } else {
                fitPair();
              }
            }
          );
        } else {
          fitPair();
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        fitPair();
      });

    return () => {
      controller.abort();
    };
  }, [mapReady, pLat, pLon, fLat, fLon]);

  if (mapError) {
    return (
      <div className={`${heightClass} w-full rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center text-xs text-surface-500 px-4 text-center`}>
        Map could not load. Check that Maps JavaScript API is enabled for your Google Maps key.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        ref={mapContainerRef}
        className={`${heightClass} w-full rounded-lg overflow-hidden border border-surface-200 bg-surface-100`}
      />
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-surface-500 px-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
          Patient
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0F4C42] inline-block" />
          Selected Facility
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          Other Active Facilities (click pin to select)
        </span>
      </div>
    </div>
  );
}
