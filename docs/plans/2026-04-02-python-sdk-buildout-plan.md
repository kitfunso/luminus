# Python SDK Build-Out Plan

**Generated**: 2026-04-02
**Estimated Complexity**: Medium

## Overview

Finish the locally-feasible Python SDK roadmap items for `python/` without changing the core Node MCP server surface. The work should leave PyPI publish as the only remaining blocked item, improve notebook ergonomics, make Python-side failures easier to understand, add CI coverage for the package, and ship polished analyst-ready notebook demos.

## Prerequisites

- Existing `luminus-mcp` TypeScript server remains the source of truth for tool behavior.
- Python package work stays notebook-first and thin-wrapper-first.
- PyPI publish itself remains out of scope because it depends on credentials not present on this machine.

## Sprint 1: Contract Expansion
**Goal**: Define the missing Python SDK behavior with failing tests before implementation.
**Demo/Validation**:
- Run focused pytest targets for the new behaviors.
- Confirm new tests fail for the right reasons before code changes.

### Task 1.1: Add tests for notebook helper methods
- **Location**: `python/tests/test_client.py`, `python/tests/fake_mcp_server.py`
- **Description**: Add failing tests for opinionated helpers covering outages, cross-border flows, grid proximity, grid connection queue, and site revenue, including multi-call/DataFrame-oriented notebook flows where helpful.
- **Dependencies**: None
- **Acceptance Criteria**:
  - Tests describe the public method names and expected DataFrame/result shapes.
  - Fake server exposes deterministic payloads for the new helper coverage.
- **Validation**:
  - `python -m pytest python/tests/test_client.py -q`

### Task 1.2: Add tests for clearer error translation
- **Location**: `python/tests/test_client.py`, `python/tests/fake_mcp_server.py`
- **Description**: Add failing tests for missing API key errors, tool startup failures, and upstream tool-call failures so Python users get targeted exception types/messages instead of opaque transport/protocol failures.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Tests distinguish startup failures from runtime tool failures.
  - At least one case covers a missing API key style upstream error.
- **Validation**:
  - `python -m pytest python/tests/test_client.py -q`

### Task 1.3: Add tests for typed result models
- **Location**: `python/tests/test_client.py`, `python/tests/test_results.py`
- **Description**: Add failing tests for lightweight typed models where they materially improve notebook use without removing dynamic access, such as typed metadata or convenience accessors for common result shapes.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Tests verify opt-in typed access for common flows while `LuminusResult` remains available.
  - No test requires hand-written wrappers for the full MCP surface.
- **Validation**:
  - `python -m pytest python/tests/test_client.py python/tests/test_results.py -q`

## Sprint 2: SDK Runtime and API Improvements
**Goal**: Implement the tested client/runtime features with minimal surface expansion.
**Demo/Validation**:
- Run the Python test suite.
- Exercise a few helpers against the fake MCP server.

### Task 2.1: Implement notebook helper methods
- **Location**: `python/luminus/client.py`, `python/luminus/__init__.py`
- **Description**: Add opinionated helper methods for the high-usage flows called out in the roadmap, reusing generic helper primitives rather than duplicating transport logic.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Helpers are discoverable from the main `Luminus` client.
  - Helpers return notebook-friendly frames/results with consistent request metadata where applicable.
- **Validation**:
  - `python -m pytest python/tests/test_client.py -q`

### Task 2.2: Implement typed exceptions and result helpers
- **Location**: `python/luminus/client.py`, `python/luminus/exceptions.py`, `python/luminus/result.py`, `python/luminus/__init__.py`
- **Description**: Introduce targeted Python exception types and lightweight typed result helpers/models for the common flows covered by the new tests.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Missing-key and upstream tool failures surface actionable Python exceptions.
  - Typed helpers improve common notebook flows without replacing dynamic result access.
- **Validation**:
  - `python -m pytest python/tests -q`

## Sprint 3: CI and Packaging Confidence
**Goal**: Ensure the Python package is validated automatically in CI and remains packable.
**Demo/Validation**:
- CI workflow includes Python package checks on push/PR.
- Local packaging commands succeed.

### Task 3.1: Add Python package checks to GitHub Actions
- **Location**: `.github/workflows/ci.yml`
- **Description**: Extend the existing workflow to install Python, run Python tests, and validate Python packaging alongside the Node checks.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - Push/PR CI runs `pytest` for `python/tests`.
  - Packaging checks cover wheel/sdist buildability for `python/`.
- **Validation**:
  - `python -m pytest python/tests -q`
  - `python -m build python`

## Sprint 4: Analyst Demos and Documentation
**Goal**: Ship polished notebook-first demos and align docs with the expanded SDK surface.
**Demo/Validation**:
- Notebook files exist, open cleanly, and read as top-to-bottom analyst workflows.
- Python README references the new helpers and notebook artifacts accurately.

### Task 4.1: Create trader workflow notebook
- **Location**: `python/examples/` or notebook output path selected for repo consistency
- **Description**: Add an analyst-ready notebook covering common trader pulls such as prices, flows, outages, and comparison/export steps.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - Notebook is tutorial-style, runnable in order, and uses the new helper surface where appropriate.
- **Validation**:
  - Open notebook JSON and smoke-check structure locally

### Task 4.2: Create GIS siting and BESS shortlist notebooks
- **Location**: `python/examples/` or notebook output path selected for repo consistency
- **Description**: Add polished notebooks for GIS site screening and BESS shortlist generation, replacing rough script-only examples as the primary demo artifacts.
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - Notebooks demonstrate map/export-friendly flows and ranking workflows.
  - Existing examples/docs point readers at the notebooks.
- **Validation**:
  - Open notebook JSON and smoke-check structure locally

### Task 4.3: Refresh Python SDK documentation
- **Location**: `python/README.md`, `docs/python-sdk-roadmap.md`
- **Description**: Update docs to reflect the expanded helper surface, the CI status, and the remaining publish-only blocker.
- **Dependencies**: Tasks 4.1-4.2
- **Acceptance Criteria**:
  - README examples match the implemented client API.
  - Roadmap is updated so only genuinely-open items remain unchecked.
- **Validation**:
  - Manual doc pass against implemented APIs

## Testing Strategy

- Use TDD for client/runtime behavior: write focused failing tests, verify failure, implement minimum passing code, then run the full Python suite.
- Keep notebook/demo work separate from transport logic so failures are easy to localize.
- Run both Python and Node verification before claiming completion.

## Potential Risks and Gotchas

- Upstream tool errors may arrive as transport, protocol, or text payload failures; translation must avoid overfitting brittle message parsing.
- Adding typed helpers should not lock the SDK to a static tool surface or duplicate business logic from the Node server.
- Notebook artifacts can become stale if they hard-code too much output; keep them instructional and lightweight.
- CI changes should not significantly slow the existing Node validation path.

## Rollback Plan

- Revert `python/` SDK changes independently from notebook/demo updates if the runtime surface proves too opinionated.
- Revert CI additions separately if they destabilize the main workflow.
