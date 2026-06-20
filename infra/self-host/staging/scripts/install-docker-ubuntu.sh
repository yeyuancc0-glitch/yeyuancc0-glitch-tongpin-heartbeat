#!/usr/bin/env bash
set -euo pipefail

if ! command -v lsb_release >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y lsb-release
fi

. /etc/os-release

if [ "${ID:-}" != "ubuntu" ]; then
  echo "This installer is intended for Ubuntu only." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker "${SUDO_USER:-$USER}"

sudo systemctl enable docker
sudo systemctl restart docker

docker --version
docker compose version

echo "Docker installed. Log out and back in if docker commands require sudo."
