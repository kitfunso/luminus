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
class GridConnectionIntelligenceNgedQueueSummary:
    matched_projects: int
    returned_projects: int
    total_site_export_capacity_mw: float
    total_site_import_capacity_mw: float
    status_breakdown: dict[str, int]
    fuel_type_breakdown: dict[str, int]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNgedQueueSummary":
        return cls(
            matched_projects=int(payload["matched_projects"]),
            returned_projects=int(payload["returned_projects"]),
            total_site_export_capacity_mw=float(payload["total_site_export_capacity_mw"]),
            total_site_import_capacity_mw=float(payload["total_site_import_capacity_mw"]),
            status_breakdown={
                str(key): int(value)
                for key, value in dict(payload.get("status_breakdown", {})).items()
            },
            fuel_type_breakdown={
                str(key): int(value)
                for key, value in dict(payload.get("fuel_type_breakdown", {})).items()
            },
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNgedQueueProject:
    licence_area: str | None
    gsp: str | None
    tanm: bool | None
    danm: bool | None
    status: str | None
    bus_number: int | None = None
    bus_name: str | None = None
    site_id: int | None = None
    application_id: int | None = None
    site_export_capacity_mw: float | None = None
    site_import_capacity_mw: float | None = None
    machine_export_capacity_mw: float | None = None
    machine_import_capacity_mw: float | None = None
    fuel_type: str | None = None
    machine_id: str | None = None
    position: int | None = None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNgedQueueProject":
        return cls(
            licence_area=payload.get("licence_area"),
            gsp=payload.get("gsp"),
            tanm=payload.get("tanm"),
            danm=payload.get("danm"),
            status=payload.get("status"),
            bus_number=_optional_int(payload.get("bus_number")),
            bus_name=payload.get("bus_name"),
            site_id=_optional_int(payload.get("site_id")),
            application_id=_optional_int(payload.get("application_id")),
            site_export_capacity_mw=_optional_float(payload.get("site_export_capacity_mw")),
            site_import_capacity_mw=_optional_float(payload.get("site_import_capacity_mw")),
            machine_export_capacity_mw=_optional_float(payload.get("machine_export_capacity_mw")),
            machine_import_capacity_mw=_optional_float(payload.get("machine_import_capacity_mw")),
            fuel_type=payload.get("fuel_type"),
            machine_id=payload.get("machine_id"),
            position=_optional_int(payload.get("position")),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNgedQueueSignal:
    resource_name: str
    summary: GridConnectionIntelligenceNgedQueueSummary
    projects: list[GridConnectionIntelligenceNgedQueueProject]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNgedQueueSignal":
        return cls(
            resource_name=str(payload["resource_name"]),
            summary=GridConnectionIntelligenceNgedQueueSummary.from_dict(
                dict(payload.get("summary", {}))
            ),
            projects=[
                GridConnectionIntelligenceNgedQueueProject.from_dict(item)
                for item in payload.get("projects", [])
                if isinstance(item, Mapping)
            ],
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNgedTdLimitsSummary:
    matched_rows: int
    seasons: list[str]
    min_import_tl_mw: float | None
    max_export_tl_mw: float | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNgedTdLimitsSummary":
        return cls(
            matched_rows=int(payload["matched_rows"]),
            seasons=[str(item) for item in payload.get("seasons", [])],
            min_import_tl_mw=_optional_float(payload.get("min_import_tl_mw")),
            max_export_tl_mw=_optional_float(payload.get("max_export_tl_mw")),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNgedTdLimitRow:
    gsp_name: str | None
    from_bus_number: int | None = None
    to_bus_number: int | None = None
    tertiary_bus_number: int | None = None
    from_bus_name: str | None = None
    to_bus_name: str | None = None
    tertiary_bus_name: str | None = None
    circuit_id: str | None = None
    season: str | None = None
    import_tl_mw: float | None = None
    export_tl_mw: float | None = None
    import_cafpl_mva: float | None = None
    export_carpl_mva: float | None = None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNgedTdLimitRow":
        return cls(
            gsp_name=payload.get("gsp_name"),
            from_bus_number=_optional_int(payload.get("from_bus_number")),
            to_bus_number=_optional_int(payload.get("to_bus_number")),
            tertiary_bus_number=_optional_int(payload.get("tertiary_bus_number")),
            from_bus_name=payload.get("from_bus_name"),
            to_bus_name=payload.get("to_bus_name"),
            tertiary_bus_name=payload.get("tertiary_bus_name"),
            circuit_id=payload.get("circuit_id"),
            season=payload.get("season"),
            import_tl_mw=_optional_float(payload.get("import_tl_mw")),
            export_tl_mw=_optional_float(payload.get("export_tl_mw")),
            import_cafpl_mva=_optional_float(payload.get("import_cafpl_mva")),
            export_carpl_mva=_optional_float(payload.get("export_carpl_mva")),
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNgedTdLimits:
    resource_name: str
    summary: GridConnectionIntelligenceNgedTdLimitsSummary
    rows: list[GridConnectionIntelligenceNgedTdLimitRow]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceNgedTdLimits":
        return cls(
            resource_name=str(payload["resource_name"]),
            summary=GridConnectionIntelligenceNgedTdLimitsSummary.from_dict(
                dict(payload.get("summary", {}))
            ),
            rows=[
                GridConnectionIntelligenceNgedTdLimitRow.from_dict(item)
                for item in payload.get("rows", [])
                if isinstance(item, Mapping)
            ],
        )


@dataclass(slots=True)
class GridConnectionIntelligenceNgedConnectionSignal:
    queue_signal: GridConnectionIntelligenceNgedQueueSignal | None
    td_limits: GridConnectionIntelligenceNgedTdLimits | None

    @classmethod
    def from_dict(
        cls, payload: Mapping[str, Any]
    ) -> "GridConnectionIntelligenceNgedConnectionSignal":
        queue_signal_payload = payload.get("queue_signal")
        td_limits_payload = payload.get("td_limits")
        return cls(
            queue_signal=(
                GridConnectionIntelligenceNgedQueueSignal.from_dict(queue_signal_payload)
                if isinstance(queue_signal_payload, Mapping)
                else None
            ),
            td_limits=(
                GridConnectionIntelligenceNgedTdLimits.from_dict(td_limits_payload)
                if isinstance(td_limits_payload, Mapping)
                else None
            ),
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
    nged_connection_signal: GridConnectionIntelligenceNgedConnectionSignal | None
    confidence_notes: list[str]
    source_metadata: dict[str, Any]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "GridConnectionIntelligenceSnapshot":
        nearest_gsp_payload = payload.get("nearest_gsp")
        connection_queue_payload = payload.get("connection_queue")
        distribution_headroom_payload = payload.get("distribution_headroom")
        nged_connection_signal_payload = payload.get("nged_connection_signal")
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
            nged_connection_signal=(
                GridConnectionIntelligenceNgedConnectionSignal.from_dict(
                    nged_connection_signal_payload
                )
                if isinstance(nged_connection_signal_payload, Mapping)
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


# ---------------------------------------------------------------------------
# ECR (Embedded Capacity Register)
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class EcrSnapshot:
    total_matched: int
    total_export_mw: float
    total_import_mw: float
    total_storage_mwh: float
    energy_source_breakdown: dict[str, int]
    status_breakdown: dict[str, int]
    entries: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "EcrSnapshot":
        return cls(
            total_matched=int(payload.get("total_matched", 0)),
            total_export_mw=float(payload.get("total_export_mw", 0)),
            total_import_mw=float(payload.get("total_import_mw", 0)),
            total_storage_mwh=float(payload.get("total_storage_mwh", 0)),
            energy_source_breakdown={
                str(k): int(v)
                for k, v in dict(payload.get("energy_source_breakdown", {})).items()
            },
            status_breakdown={
                str(k): int(v)
                for k, v in dict(payload.get("status_breakdown", {})).items()
            },
            entries=[dict(item) for item in payload.get("entries", [])],
        )


# ---------------------------------------------------------------------------
# Flexibility Market
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class FlexMarketSnapshot:
    total_dispatches: int
    total_mwh: float
    avg_utilisation_price: float
    zone_breakdown: dict[str, int]
    dispatches: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "FlexMarketSnapshot":
        return cls(
            total_dispatches=int(payload.get("total_dispatches", 0)),
            total_mwh=float(payload.get("total_mwh", 0)),
            avg_utilisation_price=float(payload.get("avg_utilisation_price", 0)),
            zone_breakdown={
                str(k): int(v)
                for k, v in dict(payload.get("zone_breakdown", {})).items()
            },
            dispatches=[dict(item) for item in payload.get("dispatches", [])],
        )


# ---------------------------------------------------------------------------
# Constraint Breaches
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class ConstraintBreachesSnapshot:
    total_breaches: int
    total_curtailment_kwh: float
    total_curtailment_hours: float
    scheme_breakdown: dict[str, int]
    breaches: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "ConstraintBreachesSnapshot":
        return cls(
            total_breaches=int(payload.get("total_breaches", 0)),
            total_curtailment_kwh=float(payload.get("total_curtailment_kwh", 0)),
            total_curtailment_hours=float(payload.get("total_curtailment_hours", 0)),
            scheme_breakdown={
                str(k): int(v)
                for k, v in dict(payload.get("scheme_breakdown", {})).items()
            },
            breaches=[dict(item) for item in payload.get("breaches", [])],
        )


# ---------------------------------------------------------------------------
# SPEN Grid Intelligence
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class SpenQueueSummary:
    total_projects: int
    total_mw: float
    projects: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpenQueueSummary":
        return cls(
            total_projects=int(payload.get("total_projects", 0)),
            total_mw=float(payload.get("total_mw", 0)),
            projects=[dict(item) for item in payload.get("projects", [])],
        )


@dataclass(slots=True)
class SpenDgCapacitySummary:
    total_substations: int
    entries: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpenDgCapacitySummary":
        return cls(
            total_substations=int(payload.get("total_substations", 0)),
            entries=[dict(item) for item in payload.get("entries", [])],
        )


@dataclass(slots=True)
class SpenCurtailmentSummary:
    total_events: int
    total_curtailed_mwh: float
    events: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpenCurtailmentSummary":
        return cls(
            total_events=int(payload.get("total_events", 0)),
            total_curtailed_mwh=float(payload.get("total_curtailed_mwh", 0)),
            events=[dict(item) for item in payload.get("events", [])],
        )


@dataclass(slots=True)
class SpenGridSnapshot:
    queue: SpenQueueSummary
    dg_capacity: SpenDgCapacitySummary
    curtailment: SpenCurtailmentSummary

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpenGridSnapshot":
        return cls(
            queue=SpenQueueSummary.from_dict(dict(payload.get("queue", {}))),
            dg_capacity=SpenDgCapacitySummary.from_dict(dict(payload.get("dg_capacity", {}))),
            curtailment=SpenCurtailmentSummary.from_dict(dict(payload.get("curtailment", {}))),
        )


# ---------------------------------------------------------------------------
# UKPN Grid Overview
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class UkpnGridSnapshot:
    gsps: list[dict[str, Any]]
    flex_zones: list[dict[str, Any]]
    live_faults: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "UkpnGridSnapshot":
        return cls(
            gsps=[dict(item) for item in payload.get("gsps", [])],
            flex_zones=[dict(item) for item in payload.get("flex_zones", [])],
            live_faults=[dict(item) for item in payload.get("live_faults", [])],
        )


# ---------------------------------------------------------------------------
# NGED Connection Signal
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class NgedConnectionSignalSnapshot:
    resource_name: str
    summary: dict[str, Any]
    queue: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "NgedConnectionSignalSnapshot":
        return cls(
            resource_name=str(payload.get("resource_name", "")),
            summary=dict(payload.get("summary", {})),
            queue=[dict(item) for item in payload.get("queue", [])],
        )


# ---------------------------------------------------------------------------
# Terrain Analysis
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class TerrainSnapshot:
    lat: float
    lon: float
    elevation_m: float
    slope_deg: float
    aspect_cardinal: str
    land_cover: str | None
    flood_risk: str | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "TerrainSnapshot":
        return cls(
            lat=float(payload.get("lat", 0)),
            lon=float(payload.get("lon", 0)),
            elevation_m=float(payload.get("elevation_m", 0)),
            slope_deg=float(payload.get("slope_deg", 0)),
            aspect_cardinal=str(payload.get("aspect_cardinal", "")),
            land_cover=payload.get("land_cover"),
            flood_risk=payload.get("flood_risk"),
        )


# ---------------------------------------------------------------------------
# BESS Site Shortlist
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class BessSiteShortlistSnapshot:
    total_candidates: int
    total_shortlisted: int
    shortlist: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "BessSiteShortlistSnapshot":
        return cls(
            total_candidates=int(payload.get("total_candidates", 0)),
            total_shortlisted=int(payload.get("total_shortlisted", 0)),
            shortlist=[dict(item) for item in payload.get("shortlist", [])],
        )


# ---------------------------------------------------------------------------
# Site Connection Report
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CanonicalConnectionEntrySnapshot:
    source: str
    source_row_id: str
    connection_site: str
    capacity_kind: str
    lifecycle_stage: str
    gsp_name_raw: str | None
    gsp_id_normalised: str | None
    mw_capacity: float | None
    mva_capacity: float | None
    agreement_type: str | None
    application_date: str | None
    mw_connection_date: str | None
    status_text_raw: str | None
    raw: Mapping[str, Any]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "CanonicalConnectionEntrySnapshot":
        return cls(
            source=str(payload.get("source", "")),
            source_row_id=str(payload.get("source_row_id", "")),
            connection_site=str(payload.get("connection_site", "")),
            capacity_kind=str(payload.get("capacity_kind", "unknown")),
            lifecycle_stage=str(payload.get("lifecycle_stage", "unknown")),
            gsp_name_raw=payload.get("gsp_name_raw"),
            gsp_id_normalised=payload.get("gsp_id_normalised"),
            mw_capacity=_optional_float(payload.get("mw_capacity")),
            mva_capacity=_optional_float(payload.get("mva_capacity")),
            agreement_type=payload.get("agreement_type"),
            application_date=payload.get("application_date"),
            mw_connection_date=payload.get("mw_connection_date"),
            status_text_raw=payload.get("status_text_raw"),
            raw=dict(payload.get("raw", {})),
        )


@dataclass(frozen=True)
class SiteConnectionReportTrafficLights:
    queue: str
    headroom: str
    land_constraints: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportTrafficLights":
        return cls(
            queue=str(payload.get("queue", "unknown")),
            headroom=str(payload.get("headroom", "unknown")),
            land_constraints=str(payload.get("land_constraints", "unknown")),
        )


@dataclass(frozen=True)
class SiteConnectionReportConstraintFlag:
    flag: bool
    reason: str | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportConstraintFlag":
        return cls(
            flag=bool(payload.get("flag", False)),
            reason=payload.get("reason"),
        )


@dataclass(frozen=True)
class SiteConnectionReportNearestGsp:
    gsp_id: str
    gsp_name: str
    region_name: str
    distance_km: float

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportNearestGsp":
        return cls(
            gsp_id=str(payload["gsp_id"]),
            gsp_name=str(payload["gsp_name"]),
            region_name=str(payload["region_name"]),
            distance_km=float(payload["distance_km"]),
        )


@dataclass(frozen=True)
class SiteConnectionReportTecQueue:
    total_mw_queued: float | None
    project_count: int | None
    top_entries: tuple[CanonicalConnectionEntrySnapshot, ...]

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportTecQueue":
        return cls(
            total_mw_queued=_optional_float(payload.get("total_mw_queued")),
            project_count=_optional_int(payload.get("project_count")),
            top_entries=tuple(
                CanonicalConnectionEntrySnapshot.from_dict(item)
                for item in payload.get("top_entries", [])
                if isinstance(item, Mapping)
            ),
        )


@dataclass(frozen=True)
class SiteConnectionReportDnoHeadroom:
    operator: str | None
    substation: str | None
    distance_km: float | None
    generation_headroom_mw: float | None
    demand_headroom_mva: float | None
    generation_rag_status: str | None
    demand_rag_status: str | None
    canonical: CanonicalConnectionEntrySnapshot | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportDnoHeadroom":
        canonical_payload = payload.get("canonical")
        return cls(
            operator=payload.get("operator"),
            substation=payload.get("substation"),
            distance_km=_optional_float(payload.get("distance_km")),
            generation_headroom_mw=_optional_float(payload.get("generation_headroom_mw")),
            demand_headroom_mva=_optional_float(payload.get("demand_headroom_mva")),
            generation_rag_status=payload.get("generation_rag_status"),
            demand_rag_status=payload.get("demand_rag_status"),
            canonical=(
                CanonicalConnectionEntrySnapshot.from_dict(canonical_payload)
                if isinstance(canonical_payload, Mapping)
                else None
            ),
        )


@dataclass(frozen=True)
class SiteConnectionReportNgedContext:
    queue_matched_projects: int | None
    queue_total_mw_export: float | None
    td_limits_resource: str | None
    td_max_export_mw: float | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportNgedContext":
        return cls(
            queue_matched_projects=_optional_int(payload.get("queue_matched_projects")),
            queue_total_mw_export=_optional_float(payload.get("queue_total_mw_export")),
            td_limits_resource=payload.get("td_limits_resource"),
            td_max_export_mw=_optional_float(payload.get("td_max_export_mw")),
        )


@dataclass(frozen=True)
class SiteConnectionReportConstraints:
    protected_area: SiteConnectionReportConstraintFlag
    flood: SiteConnectionReportConstraintFlag
    alc_grade: SiteConnectionReportConstraintFlag

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportConstraints":
        return cls(
            protected_area=SiteConnectionReportConstraintFlag.from_dict(
                dict(payload.get("protected_area", {}))
            ),
            flood=SiteConnectionReportConstraintFlag.from_dict(dict(payload.get("flood", {}))),
            alc_grade=SiteConnectionReportConstraintFlag.from_dict(
                dict(payload.get("alc_grade", {}))
            ),
        )


@dataclass(frozen=True)
class SiteConnectionReportStructured:
    nearest_gsp: SiteConnectionReportNearestGsp | None
    tec_queue: SiteConnectionReportTecQueue
    dno_headroom: SiteConnectionReportDnoHeadroom
    nged_context: SiteConnectionReportNgedContext | None
    constraints: SiteConnectionReportConstraints

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportStructured":
        nearest_gsp_payload = payload.get("nearest_gsp")
        nged_context_payload = payload.get("nged_context")
        return cls(
            nearest_gsp=(
                SiteConnectionReportNearestGsp.from_dict(nearest_gsp_payload)
                if isinstance(nearest_gsp_payload, Mapping)
                else None
            ),
            tec_queue=SiteConnectionReportTecQueue.from_dict(
                dict(payload.get("tec_queue", {}))
            ),
            dno_headroom=SiteConnectionReportDnoHeadroom.from_dict(
                dict(payload.get("dno_headroom", {}))
            ),
            nged_context=(
                SiteConnectionReportNgedContext.from_dict(nged_context_payload)
                if isinstance(nged_context_payload, Mapping)
                else None
            ),
            constraints=SiteConnectionReportConstraints.from_dict(
                dict(payload.get("constraints", {}))
            ),
        )


@dataclass(frozen=True)
class SiteConnectionReportSnapshot:
    project_name: str | None
    lat: float
    lon: float
    capacity_kind: str
    radius_km: float
    summary: str
    structured: SiteConnectionReportStructured
    traffic_lights: SiteConnectionReportTrafficLights
    traffic_light_thresholds: Mapping[str, Any]
    source_metadata: Mapping[str, Any]
    confidence_notes: tuple[str, ...]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SiteConnectionReportSnapshot":
        return cls(
            project_name=payload.get("project_name"),
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            capacity_kind=str(payload.get("capacity_kind", "")),
            radius_km=float(payload.get("radius_km", 0.0)),
            summary=str(payload.get("summary", "")),
            structured=SiteConnectionReportStructured.from_dict(
                dict(payload.get("structured", {}))
            ),
            traffic_lights=SiteConnectionReportTrafficLights.from_dict(
                dict(payload.get("traffic_lights", {}))
            ),
            traffic_light_thresholds=dict(payload.get("traffic_light_thresholds", {})),
            source_metadata=dict(payload.get("source_metadata", {})),
            confidence_notes=tuple(str(item) for item in payload.get("confidence_notes", [])),
            disclaimer=str(payload.get("disclaimer", "")),
        )


# ---------------------------------------------------------------------------
# Gate 2 Readiness Check
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Gate2ReadinessProject:
    name: str
    technology: str
    capacity_mw: float
    connection_voltage_kv: float | None
    planning_status: str
    land_rights_status: str
    nominated_connection_point: str | None
    grid_reference: str | None
    target_energisation_year: int | None

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "Gate2ReadinessProject":
        return cls(
            name=str(payload.get("name", "")),
            technology=str(payload.get("technology", "")),
            capacity_mw=float(payload.get("capacity_mw", 0.0)),
            connection_voltage_kv=_optional_float(payload.get("connection_voltage_kv")),
            planning_status=str(payload.get("planning_status", "")),
            land_rights_status=str(payload.get("land_rights_status", "")),
            nominated_connection_point=payload.get("nominated_connection_point"),
            grid_reference=payload.get("grid_reference"),
            target_energisation_year=_optional_int(payload.get("target_energisation_year")),
        )


@dataclass(frozen=True)
class Gate2ReadinessRuleResult:
    rule_id: str
    label: str
    category: str
    severity: str
    status: str
    reason: str
    reference_url: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "Gate2ReadinessRuleResult":
        return cls(
            rule_id=str(payload.get("rule_id", "")),
            label=str(payload.get("label", "")),
            category=str(payload.get("category", "")),
            severity=str(payload.get("severity", "")),
            status=str(payload.get("status", "")),
            reason=str(payload.get("reason", "")),
            reference_url=str(payload.get("reference_url", "")),
        )


@dataclass(frozen=True)
class Gate2ReadinessSummary:
    pass_: int
    warn: int
    fail: int
    not_applicable: int
    total: int

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "Gate2ReadinessSummary":
        return cls(
            pass_=int(payload.get("pass", 0)),
            warn=int(payload.get("warn", 0)),
            fail=int(payload.get("fail", 0)),
            not_applicable=int(payload.get("not_applicable", 0)),
            total=int(payload.get("total", 0)),
        )


@dataclass(frozen=True)
class Gate2ReadinessCheckSnapshot:
    project: Gate2ReadinessProject
    results: tuple[Gate2ReadinessRuleResult, ...]
    summary: Gate2ReadinessSummary
    confidence_notes: tuple[str, ...]
    source_metadata: Mapping[str, Any]
    disclaimer: str

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "Gate2ReadinessCheckSnapshot":
        return cls(
            project=Gate2ReadinessProject.from_dict(dict(payload.get("project", {}))),
            results=tuple(
                Gate2ReadinessRuleResult.from_dict(item)
                for item in payload.get("results", [])
                if isinstance(item, Mapping)
            ),
            summary=Gate2ReadinessSummary.from_dict(dict(payload.get("summary", {}))),
            confidence_notes=tuple(str(item) for item in payload.get("confidence_notes", [])),
            source_metadata=dict(payload.get("source_metadata", {})),
            disclaimer=str(payload.get("disclaimer", "")),
        )
