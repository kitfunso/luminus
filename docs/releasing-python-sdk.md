# Releasing The Python SDK

This repo publishes `luminus-py` through GitHub Trusted Publishing.

## Preconditions

- PyPI publisher is configured for:
  - repository: `kitfunso/luminus`
  - workflow: `release.yml`
  - environment: `pypi`
- Python package tests pass
- `python -m build python` succeeds

## Files to bump

- `python/pyproject.toml`
- `python/luminus/__init__.py`
- `python/luminus/client.py`
- `README.md` if the top-level latest-release link should move
- `CHANGELOG.md`
- `docs/releases/<version>.md`
- `docs/python-sdk-roadmap.md` when the roadmap status changes

## Local verification

From the repo root:

```bash
rm -rf python/dist python/build python/*.egg-info
python -m pytest python/tests -q
python -m build python
python -m twine check python/dist/*
```

Optional clean-install smoke test:

```bash
python -m venv .venv-pypi-smoke
.venv-pypi-smoke/bin/python -m pip install --upgrade pip
.venv-pypi-smoke/bin/python -m pip install python/dist/*.whl
.venv-pypi-smoke/bin/python -c "import luminus; print(luminus.__version__)"
```

## Release steps

1. Commit the version bump and release-note updates on `master`.
2. Push `master`.
3. Create and push a tag such as `v0.2.3`.
4. Watch the `release` workflow in GitHub Actions.

## Post-release checks

- Confirm the workflow passed.
- Confirm `https://pypi.org/pypi/luminus-py/<version>/json` exists.
- Confirm the PyPI integrity provenance reports:
  - `repository: "kitfunso/luminus"`
  - `workflow: "release.yml"`
  - `environment: "pypi"`

Version-specific provenance URL shape:

```text
https://pypi.org/integrity/luminus-py/<version>/luminus_py-<version>-py3-none-any.whl/provenance
```
