#!/usr/bin/env python3
"""Offline tests for the preflight's fail-closed target parsing; no DB/network."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

path=Path(__file__).with_name('platform_billing_preflight.py')
spec=importlib.util.spec_from_file_location('platform_billing_preflight',path)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BillingPreflightTests(unittest.TestCase):
    def test_parse_target_does_not_expose_password(self):
        out=module.target_info('postgresql://user:secret%40pw@db.example.test:6432/zoeskoul?schema=public&sslmode=require')
        self.assertEqual(out['host'],'db.example.test')
        self.assertEqual(out['database'],'zoeskoul')
        self.assertEqual(out['password'],'secret@pw')
        self.assertEqual(out['sslmode'],'require')
    def test_fail_closed_on_other_schemas(self):
        with self.assertRaises(ValueError):
            module.target_info('postgresql://user:pw@host/db?schema=private')
    def test_multiple_env_assignments_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            env=Path(folder)/'.env.shared.local'
            env.write_text('DATABASE_URL=postgresql://one/db\nDATABASE_URL=postgresql://two/db\n')
            with self.assertRaises(ValueError):module.read_url(env)
    def test_static_mode_never_opens_db(self):
        with tempfile.TemporaryDirectory() as folder:
            repo=Path(folder)
            p=repo/'packages/db/prisma/migrations'/module.MIGRATION
            p.mkdir(parents=True)
            (p/'migration.sql').write_text('ALTER TABLE "Subscription" ADD COLUMN "billingProduct" TEXT;\nCREATE INDEX "Subscription_userId_billingProduct_idx" ON "Subscription"("userId","billingProduct");\nALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingProduct_allowed" CHECK ("billingProduct" IS NULL);\n')
            (repo/'packages/db/prisma/schema.prisma').write_text('billingProduct String?')
            self.assertEqual(module.main([str(repo)]),0)
            with self.assertRaises(ValueError):
                module.main([str(repo),'--inspect-database'])
    def test_invalid_database_url_rejected(self):
        with self.assertRaises(ValueError):module.target_info('sqlite:///dev.db')

if __name__=='__main__':unittest.main()
