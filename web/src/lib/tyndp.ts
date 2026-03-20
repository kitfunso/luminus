/** TYNDP 2024 planned/under-construction projects (hardcoded subset) */

export interface TyndpProject {
  name: string;
  fuel: string;
  capacity: number;
  lat: number;
  lon: number;
  country: string;
  status: 'under_construction' | 'permitted' | 'planned' | 'concept';
  expectedYear: string;
}

export const TYNDP_PROJECTS: TyndpProject[] = [
  // Nuclear
  { name: 'Hinkley Point C', fuel: 'Nuclear', capacity: 3260, lat: 51.21, lon: -3.13, country: 'GB', status: 'under_construction', expectedYear: '2027' },
  { name: 'Flamanville 3', fuel: 'Nuclear', capacity: 1630, lat: 49.54, lon: -1.88, country: 'FR', status: 'under_construction', expectedYear: '2024' },
  { name: 'Paks II', fuel: 'Nuclear', capacity: 2400, lat: 46.57, lon: 18.85, country: 'HU', status: 'under_construction', expectedYear: '2030' },
  { name: 'Sizewell C', fuel: 'Nuclear', capacity: 3340, lat: 52.22, lon: 1.62, country: 'GB', status: 'planned', expectedYear: '2035' },

  // Offshore wind
  { name: 'Dogger Bank', fuel: 'Wind', capacity: 3600, lat: 54.75, lon: 2.00, country: 'GB', status: 'under_construction', expectedYear: '2026' },
  { name: 'Hornsea Three', fuel: 'Wind', capacity: 2852, lat: 53.90, lon: 1.50, country: 'GB', status: 'planned', expectedYear: '2027' },
  { name: 'IJmuiden Ver Alpha', fuel: 'Wind', capacity: 2000, lat: 52.60, lon: 3.50, country: 'NL', status: 'planned', expectedYear: '2029' },
  { name: 'He Dreiht', fuel: 'Wind', capacity: 960, lat: 54.35, lon: 6.30, country: 'DE', status: 'under_construction', expectedYear: '2025' },
  { name: 'Baltic Power', fuel: 'Wind', capacity: 1200, lat: 55.00, lon: 17.50, country: 'PL', status: 'planned', expectedYear: '2026' },
  { name: 'Courseulles-sur-Mer', fuel: 'Wind', capacity: 448, lat: 49.40, lon: -0.50, country: 'FR', status: 'under_construction', expectedYear: '2025' },
  { name: 'Hollandse Kust West', fuel: 'Wind', capacity: 1400, lat: 52.50, lon: 4.00, country: 'NL', status: 'under_construction', expectedYear: '2026' },

  // Interconnectors (modeled as plants at midpoint)
  { name: 'NeuConnect (DE-GB)', fuel: 'Other', capacity: 1400, lat: 53.50, lon: 4.00, country: 'DE', status: 'under_construction', expectedYear: '2028' },
  { name: 'Celtic Interconnector (IE-FR)', fuel: 'Other', capacity: 700, lat: 50.00, lon: -5.00, country: 'IE', status: 'under_construction', expectedYear: '2027' },
  { name: 'Viking Link (DK-GB)', fuel: 'Other', capacity: 1400, lat: 54.50, lon: 3.00, country: 'DK', status: 'under_construction', expectedYear: '2024' },
];
