"""Render reviewable HTTPS candidates without changing host services or firewall.

Cloudflare IPv4 input: one CIDR per line from https://www.cloudflare.com/ips-v4/.
Only IPv4 is supported by this deployment; no IPv6 listener or public AAAA origin.
"""
import argparse
import ipaddress
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent


def render(domain, admin, mac, interface, ranges):
    if len(domain) > 253 or not re.fullmatch(
            r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain):
        raise ValueError("공개 도메인 형식을 확인하세요")
    for address in (admin, mac):
        network = ipaddress.IPv4Network(address)
        if network.prefixlen != 32:
            raise ValueError("관리자와 Mac 주소는 IPv4 /32여야 합니다")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,15}", interface):
        raise ValueError("네트워크 인터페이스 형식을 확인하세요")
    networks = [ipaddress.IPv4Network(line) for line in ranges.splitlines() if line.strip()]
    if not networks or len(set(networks)) != len(networks):
        raise ValueError("Cloudflare 대역이 비어 있거나 중복되었습니다")
    if any(n.prefixlen < 8 or not n.network_address.is_global for n in networks):
        raise ValueError("Cloudflare 공개 IPv4 대역을 확인하세요")
    cidrs = [str(n) for n in networks]
    guard = (ROOT / "host-guard.nft.template").read_text()
    for name, value in (("ADMIN_IPV4", admin), ("MAC_IPV4", mac), ("PRIMARY_IFACE", interface)):
        guard = guard.replace("${" + name + "}", value)
    anchor = f"    ip saddr {mac} tcp dport 443 accept\n"
    guard = guard.replace(anchor, anchor + "    ip saddr { " + ", ".join(cidrs)
                          + " } tcp dport { 80, 443 } accept\n")
    return {
        "host-guard.nft": guard,
        "knot-cloudflare-realip.conf": "".join("set_real_ip_from " + n + ";\n" for n in cidrs)
            + "real_ip_header CF-Connecting-IP;\nreal_ip_recursive off;\n",
        "knot-grafana-public.conf": (ROOT / "grafana-public.conf.template").read_text().replace(
            "${GRAFANA_DOMAIN}", domain),
        "grafana-https.env": "KNOT_GRAFANA_DOMAIN=" + domain + "\n"
            + "COMPOSE_FILE=compose.yml:compose.https.yml\n"
            + "KNOT_CENTRAL_SECRETS_DIR=/opt/knot-observability/private\n",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("domain", "admin", "mac", "interface"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--cloudflare-ipv4", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    files = render(args.domain, args.admin, args.mac, args.interface, args.cloudflare_ipv4.read_text())
    args.out.mkdir(mode=0o700)  # Refuse overwrite, including symlink/existing directories.
    for name, content in files.items():
        (args.out / name).write_text(content)
    print("후보 설정 생성 완료. 서비스와 방화벽에는 적용하지 않았습니다")


if __name__ == "__main__":
    main()
