/**
 * V12J.11D opt-in REAL authenticated Chromium shell acceptance.
 * Needs preexisting auth storage state and a nonproduction ZoeBuild project URL.
 * Assistant intent is intercepted before the API: ZERO provider/credit calls.
 * The real project/context session must be valid; no fake login is installed.
 * Run ONLY on a throwaway development project.
 */
import {test,expect,type Page} from "@playwright/test";

const projectUrl=process.env.ZOEBUILD_E2E_PROJECT_URL;
const authState=process.env.ZOEBUILD_E2E_AUTH_STORAGE_STATE;
const submitSelector=process.env.ZOEBUILD_E2E_PROMPT_SUBMIT_SELECTOR;
const enabled=Boolean(projectUrl && authState && submitSelector &&
  /^https?:\/\/(?:localhost|127\.0\.0\.1|dev-build\.zoeskoul\.com)(?::[0-9]+)?\//.test(projectUrl));

if(authState)test.use({storageState:authState});
test.skip(!enabled,"Requires development project URL, authenticated storageState and exact composer submit selector");

test("same-tab reload preserves original billable intent identity and clears it after completion",async({page})=>{
  const url=new URL(projectUrl!);
  const match=/^\/(?:en|fr|es|ht)\/projects\/([^/?#]+)$/.exec(url.pathname);
  expect(match,"Project URL must target a specific authenticated development project").toBeTruthy();
  const projectId=decodeURIComponent(match![1]);
  const contextPath=`/api/build/projects/${encodeURIComponent(projectId)}/assistant/context`;
  const intentPath=`/api/build/projects/${encodeURIComponent(projectId)}/assistant/intent`;
  await page.goto(url.toString());
  await expect(page.locator(".zb-project-assistant-composer")).toBeVisible();

  // Verify actual authenticated access BEFORE intercepting AI calls.
  const realContext=await page.request.get(new URL(contextPath,url.origin).toString());
  expect(realContext.status(),"An authenticated ZoeBuild test user must own the project").toBe(200);
  const authenticated=await realContext.json();
  expect(authenticated.ok).toBe(true);
  expect(Number.isSafeInteger(authenticated.project?.sourceVersion)).toBe(true);

  const prompt=`V12J11D browser retry smoke ${Date.now()} (no source changes)`;
  const calls:Array<{id:string;history:unknown}>=[];
  let successes=0;
  // An unexpected edit/plan request is blocked; this test must never call a model.
  let forbiddenDispatches=0;
  await page.route("**/api/build/plan",route=>{forbiddenDispatches++;return route.fulfill({status:503,
    contentType:"application/json",body:JSON.stringify({ok:false,code:"TEST_DISPATCH_REFUSED"})});});
  await page.route("**/assistant/edit",route=>{forbiddenDispatches++;return route.fulfill({status:503,
    contentType:"application/json",body:JSON.stringify({ok:false,code:"TEST_DISPATCH_REFUSED"})});});
  await page.route(`**${intentPath}`,async route=>{
    const headers=route.request().headers();
    const body=route.request().postDataJSON();
    calls.push({id:headers["x-zoebuild-ai-operation-id"]??"",history:body?.previousInstructions});
    if(calls.length===1)return route.fulfill({status:503,contentType:"application/json",
      body:JSON.stringify({ok:false,code:"TEST_UNCERTAIN_NETWORK",message:"Simulated uncertain response. Try again."})});
    successes++;
    return route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({ok:true,intent:{action:"answer",reply:"V12J11D safe browser acceptance"}})});
  });

  async function submit(page:Page){
    const composer=page.locator('.zb-project-assistant-composer');
    const field=composer.getByPlaceholder('Ask Zoé to build, change, or refine anything…');
    await field.fill(prompt);
    const trigger=composer.locator(submitSelector!);
    expect(await trigger.count(),"Provide exact composer button selector").toBe(1);
    await trigger.click();
  }

  await submit(page);
  await expect.poll(()=>calls.length).toBe(1);
  await expect(page.getByText("Simulated uncertain response. Try again.")).toBeVisible();
  const persisted=await page.evaluate(id=>sessionStorage.getItem(`zoebuild:ai-attempt:v11c:${id}`),projectId);
  expect(persisted).not.toBeNull();
  expect(persisted).not.toContain(prompt);
  expect(calls[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);

  await page.reload();
  await expect(page.locator('.zb-project-assistant-composer')).toBeVisible();
  await submit(page);
  await expect.poll(()=>calls.length).toBe(2);
  await expect(page.getByText("V12J11D safe browser acceptance")).toBeVisible();
  expect(calls[1].id).toBe(calls[0].id);
  expect(calls[1].history).toEqual(calls[0].history);
  await expect.poll(()=>page.evaluate(id=>sessionStorage.getItem(`zoebuild:ai-attempt:v11c:${id}`),projectId)).toBeNull();

  await submit(page);
  await expect.poll(()=>calls.length).toBe(3);
  expect(calls[2].id).not.toBe(calls[0].id);
  expect(successes).toBe(2);
  expect(forbiddenDispatches).toBe(0);
});
