"""Entry point para ``python -m workbench``."""

from __future__ import annotations

import sys

from workbench.cli import main

if __name__ == "__main__":
    sys.exit(main())
