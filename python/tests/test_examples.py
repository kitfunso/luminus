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
    assert 'ordered_labels = rankings["label"].head(3).tolist()' in source
    assert 'frame["site"] = site.site_name' in source
    assert 'frame["site_label"] = site.label' in source


def test_release_workflow_cleans_old_python_artifacts_before_building():
    source = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")

    assert "Clean stale Python build artifacts" in source
    assert "python/dist" in source
    assert "python/build" in source
