import concurrent.futures, json, subprocess, sys, threading, time, unittest
from hosted_fast_gateway import LineProcess, WorkerPool, MAX_REQUEST, committed_guard

ECHO='import sys;\nfor l in sys.stdin.buffer: sys.stdout.buffer.write(l);sys.stdout.buffer.flush()'
class Tests(unittest.TestCase):
    def channel(self,program=ECHO,limit=8192,timeout=2):
        return LineProcess([sys.executable,'-u','-c',program],limit,timeout)
    def test_reuse(self):
        c=self.channel()
        try:
            for i in range(3):self.assertEqual(json.loads(c.exchange([i])),[i])
        finally:c.close()
    def test_input_limit(self):
        c=self.channel()
        try:
            with self.assertRaises(RuntimeError):c.exchange('x'*MAX_REQUEST)
        finally:c.close()
    def test_output_limit(self):
        c=self.channel('import sys;sys.stdin.readline();print("x"*10000)',limit=100)
        try:
            with self.assertRaises(RuntimeError):c.exchange([])
        finally:c.close()
    def test_timeout(self):
        c=self.channel('import time;time.sleep(10)',timeout=.05)
        try:
            with self.assertRaises(TimeoutError):c.exchange([])
        finally:c.close()
    def test_eof(self):
        c=self.channel('pass')
        try:
            with self.assertRaises((RuntimeError,OSError)):c.exchange([])
        finally:c.close()
    def test_pool_reuses_and_separates_project(self):
        made=[]
        def factory(project):made.append(project);return self.channel()
        p=WorkerPool(factory,json.loads)
        try:
            for project in ('project-a','project-a','project-b','project-b'):
                self.assertEqual(p.fetch('h',project,'GET','/'),['h','GET','/'])
            self.assertEqual(made,['project-a','project-b'])
        finally:p.close()
    def test_pool_failure_evicts(self):
        made=[]
        def factory(project):
            made.append(project);return self.channel('pass' if len(made)==1 else ECHO)
        p=WorkerPool(factory,json.loads)
        try:
            with self.assertRaises((RuntimeError,OSError)):p.fetch('h','project-a','GET','/')
            self.assertEqual(p.sessions,[])
            self.assertEqual(p.fetch('h','project-a','GET','/'),['h','GET','/'])
        finally:p.close()
    def test_pool_bounds_and_concurrency(self):
        entered=threading.Barrier(3);release=threading.Event()
        class Fake:
            class Process:
                def poll(self):return None
            p=Process()
            def exchange(self,v):entered.wait(timeout=3);release.wait(timeout=3);return b'null'
            def close(self):pass
        p=WorkerPool(lambda project:Fake(),json.loads)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            a=ex.submit(p.fetch,'h','project-a','GET','/');b=ex.submit(p.fetch,'h','project-a','GET','/')
            try:
                entered.wait(timeout=3)
                with self.assertRaisesRegex(RuntimeError,'POOL_BUSY'):p.fetch('h','project-a','GET','/')
            finally:release.set();a.result();b.result();p.close()
    def test_legacy_denied(self):
        class G:
            def serving_guard(self,*_):return ('legacy','p')
        self.assertIsNone(committed_guard(G(),'h','p'))
if __name__=='__main__':unittest.main()
