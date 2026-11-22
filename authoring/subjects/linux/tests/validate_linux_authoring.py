#!/usr/bin/env python3
"""Read-only structural, prerequisite and exercise checks for Linux Course 1 + 2 authoring sources."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
AUTHORING = ROOT.parents[1]
C1 = ROOT / 'courses/linux-terminal-fundamentals'
C2 = ROOT / 'courses/linux-files-permissions-users'

def load(p):return json.loads(p.read_text(encoding='utf-8'))
def topic_map(modules):
    return {t['topicId']:(m['moduleNumber'], t) for m in modules for s in m['sections'] for t in s['topics']}

def all_ids(modules):
    return [t['topicId'] for m in modules for s in m['sections'] for t in s['topics']]

class LinuxCourseValidation(unittest.TestCase):
    def test_course1_published_identifiers_preserved(self):
        spec = load(C1/'course.spec.json'); plan=load(C1/'course.plan.json')
        self.assertEqual(spec['modules'],plan['modules'])
        self.assertEqual([m['moduleNumber'] for m in spec['modules']], [1,2,3])
        ids=all_ids(spec['modules'])
        self.assertEqual(set(ids), {
            'what-the-terminal-is','where-am-i','moving-around',
            'module-1-terminal-map-project','creating-folders-and-files',
            'copy-move-rename','viewing-file-contents',
            'module-2-notes-organizer-project','final-capstone-file-room-handoff'})
        self.assertEqual(len(ids),len(set(ids)))
        idx=topic_map(spec['modules'])
        nav=idx['module-1-terminal-map-project'][1]
        self.assertIn('prebuilt',nav['summary'])
        self.assertNotRegex(nav['summary'],r'\b(mkdir|touch)\b')
        self.assertNotRegex(spec['modules'][0]['moduleProject'],r'\b(mkdir|touch)\b')
        writer=idx['viewing-file-contents'][1]
        for s in ('echo','>', '>>','wc -l'):
            self.assertIn(s,writer['summary'])
        self.assertEqual(spec['modules'][-1]['title'],'Final Capstone: Community Media Archive')
        self.assertEqual(spec['courseOverview']['moduleSummary'][-1]['title'],'Final Capstone: Community Media Archive')
        self.assertTrue((C1/'COURSE1_LESSON_ALIGNMENT_REVIEW.md').exists())

    def test_course1_policy_covers_prerequisites(self):
        val=load(C1/'validation.policy.json')
        self.assertTrue({'echo','>','>>','wc -l'}.issubset(set(val['allowedConcepts'])))
        self.assertIn('sudo',val['disallowedConcepts'])
        spec=load(C1/'course.spec.json')
        intro=topic_map(spec['modules'])['what-the-terminal-is'][1]
        self.assertTrue(intro['practice']['requiresTryIt'])
        self.assertFalse(intro['practice'].get('conceptualOnly',False))

    def test_course2_exactly_four_consistent_modules(self):
        spec,plan,blue,policy=[load(C2/f) for f in (
            'course.spec.json','course.plan.json','course.blueprint.json','validation.policy.json')]
        self.assertEqual(spec['modules'],plan['modules'])
        self.assertEqual(len(spec['modules']),4)
        self.assertEqual(blue['constraints']['moduleCount'],4)
        self.assertEqual(plan['moduleOrder'],[m['moduleSlug'] for m in spec['modules']])
        self.assertEqual([m['moduleNumber'] for m in spec['modules']],[1,2,3,4])
        self.assertEqual(spec['releasePlan']['currentRelease']['endModuleNumber'],4)
        self.assertEqual(spec['modules'][-1]['role'],'capstone')
        self.assertEqual(spec['modules'][-1]['sections'][0]['role'],'capstone')
        self.assertEqual(len(spec['modules'][-1]['sections']),1)
        self.assertTrue(policy['validationRequirements']['actualPermissionBitsVerifierRequiredBeforePublish'])
        self.assertFalse(policy['validationRequirements']['publishedContentReady'])
        self.assertFalse(policy['validationRequirements']['modeVerifierIntegratedWithRunner'])
        self.assertEqual({x['courseSlug'] for x in (spec,plan,blue)}, {'linux-files-permissions-users'})
        self.assertEqual({x['profileId'] for x in (spec,plan,blue)}, {'bash'})

    def test_unique_ids_and_safe_progression(self):
        mods=load(C2/'course.spec.json')['modules']
        ids=all_ids(mods)
        self.assertEqual(len(ids),18)
        self.assertEqual(len(ids),len(set(ids)))
        self.assertEqual(len({m['moduleSlug'] for m in mods}),4)
        sections=[s['sectionSlug'] for m in mods for s in m['sections']]
        self.assertEqual(len(sections),len(set(sections)))
        index=topic_map(mods)
        self.assertLess(index['parent-path-access'][0],index['symbolic-chmod-basics'][0])
        self.assertEqual(index['sudo-root-concepts'][0],3)
        for key in ('ownership-administration-concepts','sudo-root-concepts','least-privilege-decisions'):
            p=index[key][1]['practice']
            self.assertTrue(p['conceptualOnly'])
            self.assertFalse(p['requiresTryIt'])
        for key in ('module-1-permission-detective','module-3-secure-script-folder',
                    'module-7-permission-debugging-lab','final-capstone-secure-project'):
            self.assertEqual(index[key][1]['practice']['terminalSessionScope'],'project')
        cap=index['final-capstone-secure-project'][1]['projectBrief']
        self.assertEqual(cap['stepCountTarget'],5)
        self.assertEqual([x['step'] for x in cap['stepLadder']],[1,2,3,4,5])
        self.assertEqual(cap['targetModes']['secure-project/secrets.env'],'600')

    def test_all_lessons_and_practice_bank_complete(self):
        mods=load(C2/'course.spec.json')['modules']
        bank=load(C2/'LESSON_PRACTICE_BANK.json')
        index=topic_map(mods)
        self.assertEqual(set(bank['topics']),set(index))
        self.assertEqual(sum(len(x['exercises']) for x in bank['topics'].values()),60)
        for number in range(1,5):
            text=(C2/f'MODULE_{number}_LESSONS.md').read_text(encoding='utf-8')
            self.assertGreater(len(text),3500)
            for sec in mods[number-1]['sections']:
                for t in sec['topics']:
                    self.assertIn('`'+t['topicId']+'`',text)
                    items=bank['topics'][t['topicId']]['exercises']
                    self.assertEqual(bank['topics'][t['topicId']]['moduleNumber'],number)
                    if t['topicId'].startswith('module-') or t['topicId'].startswith('final-'):
                        self.assertEqual(items[0]['kind'],'project')
                    else:
                        self.assertGreaterEqual(len(items),4)
                        self.assertEqual(sum(i['kind']=='single_choice' for i in items),3)
                        conceptual=t['practice'].get('conceptualOnly',False)
                        if conceptual:
                            self.assertEqual(items[-1]['kind'],'scenario_choice')
                            self.assertIsNone(items[-1]['recipeType'])
                        else:
                            self.assertEqual(items[-1]['kind'],'code_input')
                            self.assertEqual(items[-1]['recipeType'],'shell_task')
                            self.assertEqual(items[-1]['runtimeMode'],'terminal_workspace')
            # No executable privileged command in fenced student examples.
            for block in re.findall(r'```(?:bash|sh)\n(.*?)\n```',text,re.S):
                self.assertNotRegex(block,r'(?m)^\s*(?:sudo|su|chown|chgrp|chmod\s+-R|useradd|groupadd)\b')
        self.assertIn('stat.S_IMODE',(C2/'ASSESSMENT_MATRIX.md').read_text())

    def test_course2_registered_as_draft_not_public(self):
        idx=load(AUTHORING/'authoring.index.json')
        linux=next(row for row in idx['subjects'] if row['subjectSlug']=='linux')
        self.assertIn('linux-files-permissions-users',linux['courseOrder'])
        self.assertEqual(linux['courseOrder'][-1],'linux-files-permissions-users')
        plan=load(ROOT/'subject.plan.json')
        self.assertIn('linux-files-permissions-users',plan['courseOrder'])
        course=next(c for c in plan['courses'] if c['courseSlug']=='linux-files-permissions-users')
        self.assertEqual(course['status'],'draft')
        self.assertEqual(plan['publishTarget']['courseSlug'],'linux-terminal-fundamentals')
        self.assertNotIn('linux-files-permissions-users',load(AUTHORING/'catalogs/linux.catalog.json')['subjectSlugs'])
        self.assertFalse((ROOT/'course-lifecycle/linux-files-permissions-users.json').exists())

if __name__=='__main__':unittest.main(verbosity=2)
