import unittest

import render_https


class HttpsTest(unittest.TestCase):
    def test_renderer_shares_cloudflare_allowlist_and_preserves_loopback_boundary(self):
        # given
        args = ("grafana.example.com", "192.0.2.1/32", "192.0.2.2/32", "ens5", "173.245.48.0/20\n")
        # when
        files = render_https.render(*args)
        # then
        self.assertIn("173.245.48.0/20", files["host-guard.nft"])
        self.assertIn("set_real_ip_from 173.245.48.0/20;", files["knot-cloudflare-realip.conf"])
        self.assertIn("tcp dport { 80, 443 }", files["host-guard.nft"])
        self.assertIn("ip saddr 192.0.2.2/32 tcp dport 443 accept", files["host-guard.nft"])
        self.assertIn("proxy_pass http://127.0.0.1:3000;", files["knot-grafana-public.conf"])
        self.assertIn("$request_uri", files["knot-grafana-public.conf"])
        self.assertNotIn("${", "".join(files.values()))
        self.assertNotIn("flush ruleset", files["host-guard.nft"])

    def test_renderer_rejects_broad_or_injected_inputs(self):
        # given
        valid = ["grafana.example.com", "192.0.2.1/32", "192.0.2.2/32", "ens5", "173.245.48.0/20"]
        invalid = [(0, "example.com;return 200"), (1, "0.0.0.0/0"),
                   (2, "192.0.2.0/24"), (3, 'ens5" accept'), (4, ""),
                   (4, "0.0.0.0/0"), (4, "127.0.0.0/8"),
                   (4, "173.245.48.0/20\n173.245.48.0/20"), (4, "::/0")]
        for index, value in invalid:
            with self.subTest(index=index, value=value):
                args = valid.copy()
                args[index] = value
                # when / then
                with self.assertRaises(ValueError):
                    render_https.render(*args)


if __name__ == "__main__":
    unittest.main()
