# Copyright 2026 Turbo7
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0

"""Runs the server over stdio using an OAuth refresh token from environment variables.

Required: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN.
Optional: GOOGLE_PROJECT_ID (quota project), GOOGLE_ADS_LOGIN_CUSTOMER_ID.
"""

import json
import os
import sys
import tempfile

_REQUIRED = (
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
)


def _write_authorized_user_file() -> str:
    missing = [name for name in _REQUIRED if not os.environ.get(name)]
    if missing:
        sys.exit("google-ads-mcp: faltam variaveis de ambiente: " + ", ".join(missing))
    info = {
        "type": "authorized_user",
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
    }
    if os.environ.get("GOOGLE_PROJECT_ID"):
        info["quota_project_id"] = os.environ["GOOGLE_PROJECT_ID"]
    fd, path = tempfile.mkstemp(prefix="gads-adc-", suffix=".json")
    with os.fdopen(fd, "w") as handle:
        json.dump(info, handle)
    os.chmod(path, 0o600)
    return path


def main() -> None:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _write_authorized_user_file()
    # Force stdio mode: the OAuth proxy variables switch the server to HTTP.
    os.environ.pop("GOOGLE_ADS_MCP_OAUTH_CLIENT_ID", None)
    os.environ.pop("GOOGLE_ADS_MCP_OAUTH_CLIENT_SECRET", None)

    from ads_mcp.server import run_server

    run_server()


if __name__ == "__main__":
    main()
