'use client';

import dynamic from 'next/dynamic';

// deck.gl and maplibre-gl require browser APIs, so we must disable SSR
const EnergyMap = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  return (
    <main>
      <EnergyMap />
    </main>
  );
}
