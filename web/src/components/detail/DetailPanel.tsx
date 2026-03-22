'use client';

import { useMapStore } from '@/lib/store';
import CountryDetail from './CountryDetail';
import CorridorDetail from './CorridorDetail';
import PlantDetail from './PlantDetail';
import TyndpDetail from './TyndpDetail';

export default function DetailPanel() {
  const detail = useMapStore((s) => s.detail);
  const clearDetail = useMapStore((s) => s.clearDetail);
  const plants = useMapStore((s) => s.plants);
  const prices = useMapStore((s) => s.prices);
  const flows = useMapStore((s) => s.flows);
  const outages = useMapStore((s) => s.outages);

  if (detail.kind === 'none') return null;

  return (
    <div className="detail-panel">
      {detail.kind === 'country' && (
        <CountryDetail
          data={detail.data}
          plants={plants}
          flows={flows}
          outages={outages}
          onClose={clearDetail}
        />
      )}
      {detail.kind === 'corridor' && (
        <CorridorDetail
          data={detail.data}
          prices={prices}
          outages={outages}
          onClose={clearDetail}
        />
      )}
      {detail.kind === 'plant' && (
        <PlantDetail data={detail.data} onClose={clearDetail} />
      )}
      {detail.kind === 'tyndp' && (
        <TyndpDetail data={detail.data} onClose={clearDetail} />
      )}
    </div>
  );
}
