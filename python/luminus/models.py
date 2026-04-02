from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


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
class DistributionHeadroomSite:
    asset_id: str
    licence_area: str
    substation: str
    substation_type: str | None
    voltage_kv: str | None
    upstream_gsp: str | None
    upstream_bsp: str | None
    distance_km: float
    estimated_demand_headroom_mva: float | None
    demand_rag_status: str | None
    demand_constraint: str | None
    connected_generation_mw: float | None
    contracted_generation_mw: float | None
    estimated_generation_headroom_mw: float | None
    generation_rag_status: str | None
    generation_constraint: str | None
    upstream_reinforcement_works: str | None
    upstream_reinforcement_completion_date: str | None
    substation_reinforcement_works: str | None
    substation_reinforcement_completion_date: str | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "DistributionHeadroomSite":
        return cls(
            asset_id=str(payload["asset_id"]),
            licence_area=str(payload["licence_area"]),
            substation=str(payload["substation"]),
            substation_type=payload.get("substation_type"),
            voltage_kv=payload.get("voltage_kv"),
            upstream_gsp=payload.get("upstream_gsp"),
            upstream_bsp=payload.get("upstream_bsp"),
            distance_km=float(payload["distance_km"]),
            estimated_demand_headroom_mva=_optional_float(payload.get("estimated_demand_headroom_mva")),
            demand_rag_status=payload.get("demand_rag_status"),
            demand_constraint=payload.get("demand_constraint"),
            connected_generation_mw=_optional_float(payload.get("connected_generation_mw")),
            contracted_generation_mw=_optional_float(payload.get("contracted_generation_mw")),
            estimated_generation_headroom_mw=_optional_float(payload.get("estimated_generation_headroom_mw")),
            generation_rag_status=payload.get("generation_rag_status"),
            generation_constraint=payload.get("generation_constraint"),
            upstream_reinforcement_works=payload.get("upstream_reinforcement_works"),
            upstream_reinforcement_completion_date=payload.get("upstream_reinforcement_completion_date"),
            substation_reinforcement_works=payload.get("substation_reinforcement_works"),
            substation_reinforcement_completion_date=payload.get("substation_reinforcement_completion_date"),
        )


@dataclass(slots=True)
class DistributionHeadroomSnapshot:
    lat: float
    lon: float
    operator: str
    radius_km: float
    nearest_site: DistributionHeadroomSite | None
    matches: list[DistributionHeadroomSite]
    confidence_notes: list[str]
    source_metadata: dict[str, Any]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "DistributionHeadroomSnapshot":
        nearest_site_payload = payload.get("nearest_site")
        return cls(
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            operator=str(payload["operator"]),
            radius_km=float(payload["radius_km"]),
            nearest_site=(
                DistributionHeadroomSite.from_dict(nearest_site_payload)
                if isinstance(nearest_site_payload, Mapping)
                else None
            ),
            matches=[
                DistributionHeadroomSite.from_dict(item)
                for item in payload.get("matches", [])
                if isinstance(item, Mapping)
            ],
            confidence_notes=[str(item) for item in payload.get("confidence_notes", [])],
            source_metadata=dict(payload.get("source_metadata", {})),
            disclaimer=str(payload.get("disclaimer", "")),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNearestGsp:
    gsp_id: str
    gsp_name: str
    distance_km: float
    region_id: str
    region_name: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNearestGsp":
        return cls(
            gsp_id=str(payload["gsp_id"]),
            gsp_name=str(payload["gsp_name"]),
            distance_km=float(payload["distance_km"]),
            region_id=str(payload["region_id"]),
            region_name=str(payload["region_name"]),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceQueue:
    projects: list[dict[str, Any]]
    total_mw_queued: float
    search_term: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceQueue":
        return cls(
            projects=[
                dict(item)
                for item in payload.get("projects", [])
                if isinstance(item, Mapping)
            ],
            total_mw_queued=float(payload["total_mw_queued"]),
            search_term=str(payload["search_term"]),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceSubstation:
    name: str | None
    voltage_kv: int | None
    distance_km: float

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceSubstation":
        return cls(
            name=payload.get("name"),
            voltage_kv=_optional_int(payload.get("voltage_kv")),
            distance_km=float(payload["distance_km"]),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceDistributionHeadroom:
    operator: str
    substation: str
    substation_type: str | None
    distance_km: float
    estimated_generation_headroom_mw: float | None
    estimated_demand_headroom_mva: float | None
    generation_rag_status: str | None
    demand_rag_status: str | None
    generation_constraint: str | None
    demand_constraint: str | None
    upstream_reinforcement_works: str | None
    upstream_reinforcement_completion_date: str | None

    @classmethod
    def from_dict(
        cls, payload: Mapping[str, Any]
    ) -> "GridConnectionIntelligenceDistributionHeadroom":
        return cls(
            operator=str(payload["operator"]),
            substation=str(payload["substation"]),
            substation_type=payload.get("substation_type"),
            distance_km=float(payload["distance_km"]),
            estimated_generation_headroom_mw=_optional_float(payload.get("estimated_generation_headroom_mw")),
            estimated_demand_headroom_mva=_optional_float(payload.get("estimated_demand_headroom_mva")),
            generation_rag_status=payload.get("generation_rag_status"),
            demand_rag_status=payload.get("demand_rag_status"),
            generation_constraint=payload.get("generation_constraint"),
            demand_constraint=payload.get("demand_constraint"),
            upstream_reinforcement_works=payload.get("upstream_reinforcement_works"),
            upstream_reinforcement_completion_date=payload.get("upstream_reinforcement_completion_date"),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceSnapshot:
    lat: float
    lon: float
    country: str
    nearest_gsp: GridConnectionIntelligenceNearestGsp | None
    connection_queue: GridConnectionIntelligenceQueue | None
    nearby_substations: list[GridConnectionIntelligenceSubstation]
    distribution_headroom: GridConnectionIntelligenceDistributionHeadroom | None
    confidence_notes: list[str]
    source_metadata: dict[str, Any]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceSnapshot":
        nearest_gsp_payload = payload.get("nearest_gsp")
        connection_queue_payload = payload.get("connection_queue")
        distribution_headroom_payload = payload.get("distribution_headroom")
        return cls(
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            country=str(payload["country"]),
            nearest_gsp=(
                GridConnectionIntelligenceNearestGsp.from_dict(nearest_gsp_payload)
                if isinstance(nearest_gsp_payload, Mapping)
                else None
            ),
            connection_queue=(
                GridConnectionIntelligenceQueue.from_dict(connection_queue_payload)
                if isinstance(connection_queue_payload, Mapping)
                else None
            ),
            nearby_substations=[
                GridConnectionIntelligenceSubstation.from_dict(item)
                for item in payload.get("nearby_substations", [])
                if isinstance(item, Mapping)
            ],
            distribution_headroom=(
                GridConnectionIntelligenceDistributionHeadroom.from_dict(distribution_headroom_payload)
                if isinstance(distribution_headroom_payload, Mapping)
                else None
            ),
            confidence_notes=[str(item) for item in payload.get("confidence_notes", [])],
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
