from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(slots=True)
class GridProximitySubstation:
    name: str | None
    voltage_kv: int | None
    operator: str | None
    distance_km: float
    lat: float
    lon: float


@dataclass(slots=True)
class GridProximityLine:
    voltage_kv: int
    operator: str | None
    distance_km: float
    cables: int | None


@dataclass(slots=True)
class GridProximitySummary:
    nearest_substation_km: float | None
    nearest_line_km: float | None
    max_nearby_voltage_kv: int | None


@dataclass(slots=True)
class GridProximitySnapshot:
    lat: float
    lon: float
    radius_km: float
    substations: list[GridProximitySubstation]
    lines: list[GridProximityLine]
    summary: GridProximitySummary
    source_metadata: dict[str, Any]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridProximitySnapshot":
        return cls(
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            radius_km=float(payload["radius_km"]),
            substations=[
                GridProximitySubstation(
                    name=item.get("name"),
                    voltage_kv=item.get("voltage_kv"),
                    operator=item.get("operator"),
                    distance_km=float(item["distance_km"]),
                    lat=float(item["lat"]),
                    lon=float(item["lon"]),
                )
                for item in payload.get("substations", [])
            ],
            lines=[
                GridProximityLine(
                    voltage_kv=int(item.get("voltage_kv", 0)),
                    operator=item.get("operator"),
                    distance_km=float(item["distance_km"]),
                    cables=item.get("cables"),
                )
                for item in payload.get("lines", [])
            ],
            summary=GridProximitySummary(**dict(payload.get("summary", {}))),
            source_metadata=dict(payload.get("source_metadata", {})),
        )


@dataclass(slots=True)
class GridConnectionQueueFilters:
    connection_site_query: str | None
    project_name_query: str | None
    host_to: str | None
    plant_type: str | None
    project_status: str | None
    agreement_type: str | None


@dataclass(slots=True)
class GridConnectionQueueSummary:
    matched_projects: int
    returned_projects: int
    total_connected_mw: float
    total_net_change_mw: float
    total_cumulative_capacity_mw: float
    earliest_effective_from: str | None
    latest_effective_from: str | None


@dataclass(slots=True)
class GridConnectionSiteSummary:
    connection_site: str
    project_count: int
    total_net_change_mw: float
    total_connected_mw: float
    total_cumulative_capacity_mw: float
    plant_types: list[str]
    project_statuses: list[str]
    earliest_effective_from: str | None


@dataclass(slots=True)
class GridConnectionProject:
    project_name: str
    customer_name: str | None
    connection_site: str
    stage: int | None
    mw_connected: float
    mw_increase_decrease: float
    cumulative_total_capacity_mw: float
    mw_effective_from: str | None
    project_status: str | None
    agreement_type: str | None
    host_to: str | None
    plant_type: str | None
    project_id: str | None
    project_number: str | None
    gate: int | None


@dataclass(slots=True)
class GridConnectionQueueSnapshot:
    filters: GridConnectionQueueFilters
    summary: GridConnectionQueueSummary
    connection_sites: list[GridConnectionSiteSummary]
    projects: list[GridConnectionProject]
    source_metadata: dict[str, Any]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionQueueSnapshot":
        return cls(
            filters=GridConnectionQueueFilters(**dict(payload.get("filters", {}))),
            summary=GridConnectionQueueSummary(**dict(payload.get("summary", {}))),
            connection_sites=[
                GridConnectionSiteSummary(**dict(item))
                for item in payload.get("connection_sites", [])
            ],
            projects=[
                GridConnectionProject(**dict(item))
                for item in payload.get("projects", [])
            ],
            source_metadata=dict(payload.get("source_metadata", {})),
            disclaimer=str(payload.get("disclaimer", "")),
        )


@dataclass(slots=True)
class SiteRevenueTerrain:
    elevation_m: float
    slope_deg: float
    aspect_cardinal: str


@dataclass(slots=True)
class SiteRevenueMetrics:
    estimated_annual_revenue_eur: float
    annual_generation_mwh: float | None = None
    capacity_factor: float | None = None
    capture_price_eur_mwh: float | None = None
    daily_spread_eur_mwh: float | None = None
    daily_revenue_eur: float | None = None
    arb_signal: str | None = None


@dataclass(slots=True)
class PriceSnapshot:
    date: str
    peak_eur_mwh: float
    off_peak_eur_mwh: float
    mean_eur_mwh: float


@dataclass(slots=True)
class SiteRevenueEstimate:
    lat: float
    lon: float
    zone: str
    technology: str
    capacity_mw: float
    terrain: SiteRevenueTerrain | None
    revenue: SiteRevenueMetrics
    price_snapshot: PriceSnapshot | None
    caveats: list[str]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteRevenueEstimate":
        terrain_payload = payload.get("terrain")
        price_payload = payload.get("price_snapshot")
        return cls(
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            zone=str(payload["zone"]),
            technology=str(payload["technology"]),
            capacity_mw=float(payload["capacity_mw"]),
            terrain=SiteRevenueTerrain(**dict(terrain_payload)) if isinstance(terrain_payload, Mapping) else None,
            revenue=SiteRevenueMetrics(**dict(payload.get("revenue", {}))),
            price_snapshot=PriceSnapshot(**dict(price_payload)) if isinstance(price_payload, Mapping) else None,
            caveats=[str(item) for item in payload.get("caveats", [])],
            disclaimer=str(payload.get("disclaimer", "")),
        )
