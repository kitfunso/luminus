import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "python" / "examples"


def read_notebook_source(name: str) -> str:
    notebook = json.loads((EXAMPLES / name).read_text(encoding="utf-8"))
    chunks: list[str] = []
    for cell in notebook["cells"]:
        chunks.extend(cell.get("source", []))
    return "".join(chunks)


def test_bess_shortlist_workflow_keeps_rank_labels_aligned_with_candidates():
    source = read_notebook_source("bess_shortlist_workflow.ipynb")

    assert '{"label": "A", "site_name": "Alpha"' in source
    assert 'shortlist_bess_sites(' in source
    assert 'country="GB"' in source
    assert 'rankings = shortlist_result.to_pandas(data_key="rankings")' in source
    assert 'shortlist = shortlist_result.to_pandas(data_key="shortlist")' in source
    assert '"dno_generation_headroom_mw"' in source
    assert '"dno_headroom_site"' in source


def test_gis_siting_workflow_uses_python_gis_helpers_for_connection_context():
    source = read_notebook_source("gis_siting_workflow.ipynb")

    assert "GridConnectionIntelligenceSnapshot" in source
    assert "DistributionHeadroomSnapshot" in source
    assert "get_grid_connection_intelligence_snapshot(" in source
    assert "get_distribution_headroom_matches(" in source
    assert "intelligence.nged_connection_signal" in source
    assert "nged_queue_projects" in source
    assert "nged_td_limits" in source
    assert 'operator="SSEN"' in source
    assert 'country="GB"' in source


def test_release_workflow_cleans_old_python_artifacts_before_building():
    source = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")

    assert "Clean stale Python build artifacts" in source
    assert "python/dist" in source
    assert "python/build" in source
