# The agent's sandbox: common dev tools, an unprivileged user, nothing else.
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git ripgrep python3 python3-venv python3-pip python3-pytest \
      nodejs npm build-essential jq less procps tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -u 1000 -m -s /bin/bash agent
COPY exec_server.py /opt/exec_server.py
USER agent
ENV HOME=/home/agent PIP_BREAK_SYSTEM_PACKAGES=1 PATH=/home/agent/.local/bin:$PATH
WORKDIR /workspaces
CMD ["python3", "/opt/exec_server.py"]
