#!/usr/bin/env python3
"""Offline fail-closed tests; all values are synthetic; no API or DB calls."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
import unittest

script = Path(__file__).with_name('platform_stripe_sandbox_readiness.py')
spec = importlib.util.spec_from_file_location('platform_stripe_sandbox_readiness', script)
m = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = m
spec.loader.exec_module(m)


def good():
    common = {'LEARNOIR_STRIPE_SECRET_KEY':'sk_test_abc123','ZOEBUILD_AI_STRIPE_PRICE_IDS':'price_builder1',
              'STRIPE_PRICE_MONTHLY_ID':'price_learn1','STRIPE_PRICE_YEARLY_ID':'price_learn2'}
    web = m.Loaded({**common,'STRIPE_WEBHOOK_SECRET':'whsec_local1','AUTH_URL':'http://localhost:3000'},(),2)
    builder = m.Loaded({**common,'NEXT_PUBLIC_WEBSITE_ORIGIN':'http://localhost:3000',
                        'NEXT_PUBLIC_ZOEBUILD_ORIGIN':'http://localhost:3004'},(),2)
    return web, builder


class ReadinessTest(unittest.TestCase):
    def test_clean_test_environment_is_only_candidate_pass(self):
        self.assertFalse(m.analyze(*good())[1])

    def test_mismatched_secrets_fail_closed(self):
        web, b = good(); b.values['LEARNOIR_STRIPE_SECRET_KEY']='sk_test_different'
        self.assertIn('PLATFORM_KEYS_DIFFER_OR_MISSING',m.analyze(web,b)[1])

    def test_live_mode_never_qualifies_as_sandbox(self):
        web, b = good(); web.values['LEARNOIR_STRIPE_SECRET_KEY']='sk_live_real'
        self.assertIn('WEB_TEST_KEY_REQUIRED',m.analyze(web,b)[1])

    def test_cross_product_price_collision_fails(self):
        web, b = good(); web.values['STRIPE_PRICE_MONTHLY_ID']='price_builder1'
        self.assertIn('WEB_CROSS_PRODUCT_PRICE_COLLISION',m.analyze(web,b)[1])

    def test_builder_price_list_must_match(self):
        web, b = good(); b.values['ZOEBUILD_AI_STRIPE_PRICE_IDS']='price_elsewhere'
        self.assertIn('BUILDER_PRICES_INVALID_OR_DIFFERENT',m.analyze(web,b)[1])

    def test_refuses_invalid_secret_patterns(self):
        for secret in (None,'','sk_test_', 'rk_test_abc','sk_live_valid','whsec_abc'):
            self.assertNotEqual(m.key_mode(secret),'TEST')

    def test_rejects_remote_http_origin_and_userinfo(self):
        for o in ('http://remote.example','https://bad:pass@example.org','https://example.org/billing',
                  'https://example.org/#x','https://example.org/?x=1'):
            self.assertFalse(m.valid_origin(o),o)
        self.assertTrue(m.valid_origin('http://localhost:3004'))

    def test_duplicate_and_syntactically_invalid_prices(self):
        for s in ('price_1,price_1','price_1,','price_1,wrong','price_1;price_2'):
            self.assertFalse(m.price_set(s)[1])

    def test_does_not_load_database_url(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'config.env').write_text('DATABASE_URL=postgresql://user:secret@host/db\n'
                                           'LEARNOIR_STRIPE_SECRET_KEY=sk_test_ok\n')
            snap = m.load_allowed(root,['config.env'])
            self.assertNotIn('DATABASE_URL',snap.values)
            self.assertEqual(snap.files,1)

    def test_conflicting_definitions_fail_closed_without_values(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'a.env').write_text('LEARNOIR_STRIPE_SECRET_KEY=sk_test_one\n')
            (root/'b.env').write_text('LEARNOIR_STRIPE_SECRET_KEY=sk_test_two\n')
            snap = m.load_allowed(root,['a.env','b.env'])
            self.assertEqual(snap.conflicts,('LEARNOIR_STRIPE_SECRET_KEY',))

    def test_requires_same_website_origin(self):
        web, b = good(); b.values['NEXT_PUBLIC_WEBSITE_ORIGIN']='https://different.example'
        self.assertIn('WEB_AND_BUILDER_WEBSITE_ORIGINS_DIFFER',m.analyze(web,b)[1])

    def test_refuses_external_paths_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with self.assertRaises(ValueError):m.load_allowed(root,['../other'])
            with self.assertRaises(ValueError):m.load_allowed(root,['/etc/passwd'])
            (root/'target').write_text('OK=1\n')
            (root/'link').symlink_to(root/'target')
            with self.assertRaises(ValueError):m.load_allowed(root,['link'])

    def test_no_network_even_when_running_cli(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'apps/web').mkdir(parents=True)
            (root/'apps/zoebuild').mkdir(parents=True)
            self.assertEqual(m.main([str(root)]),2)


if __name__ == '__main__':unittest.main()
