import {describe,it,expect} from 'vitest';
import {hostedPublishSelection} from './privatePublishControl';
const id='cmwvhcusk0002u0dlwhxh9uh2';
const old='cmw4n3kv70006u8dl1xji1rvr';
const env={NODE_ENV:'development',ZOEBUILD_PUBLISH_ENABLED:'0',ZOEBUILD_HOSTED_PUBLISH_DEV:'1',ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER:'owner-one',ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT:'cmwq2ynpn0002f3dl4kkz7uhi',ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS:old+',cmwpd1v3z00026pdl6vkaj6zk',ZOEBUILD_HOSTED_FENCED_DEV:'1',ZOEBUILD_HOSTED_FENCED_DEV_PROJECT:id};
const select=(project:string,overrides:Record<string,string>={},origin='http://localhost:3004')=>hostedPublishSelection(origin,project,{...env,...overrides});
describe('dedicated fenced development selection',()=>{
  it('preserves both old slots and admits only the explicit new project',()=>{expect(select(old)).toEqual({ownerId:'owner-one'});expect(select('cmwpd1v3z00026pdl6vkaj6zk')).toEqual({ownerId:'owner-one'});expect(select(id)).toEqual({ownerId:'owner-one'});expect(select('other-project')).toBeNull();});
  it('requires both fenced flags',()=>{expect(select(id,{ZOEBUILD_HOSTED_FENCED_DEV:'0'})).toBeNull();expect(select(id,{ZOEBUILD_HOSTED_FENCED_DEV_PROJECT:''})).toBeNull();});
  it('denies public and nonlocal requests',()=>{expect(select(id,{NODE_ENV:'production'})).toBeNull();expect(select(id,{VERCEL_ENV:'production'})).toBeNull();expect(select(id,{},'https://example.com')).toBeNull();});
  it('retains the strict two-slot validation',()=>{expect(select(id,{ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS:env.ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS+',another-project'})).toBeNull();expect(select(id,{ZOEBUILD_HOSTED_PUBLISH_DEV_PROJECTS:old+','+old})).toBeNull();});
});
