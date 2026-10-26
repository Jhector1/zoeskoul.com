import {PROVIDER_PRESENTATIONS, type ProviderDirectoryCategory} from "@/lib/integrations/providerDirectoryCatalog";

// A model has ALREADY semantically interpreted the conversation. This function
// resolves its exact provider selection against a trusted directory. It never
// classifies natural language, creates a connection, or guesses account status.
export type ZoeProviderSelection =
  | Readonly<{kind:"provider";providerId:string;providerName:string;
      section:ProviderDirectoryCategory;setup:"native"|"stripe-settings"|"shopify-oauth"|"unavailable"}>
  | Readonly<{kind:"ambiguous";name:string;sections:readonly ProviderDirectoryCategory[]}>;

const CATEGORIES=["commerce","payments","marketing","databases","seo"] as const;
const normalized=(s:string)=>s.trim().normalize("NFKC").toLocaleLowerCase("en");
type ZoeProviderSetup = "native"|"stripe-settings"|"shopify-oauth"|"unavailable";
const setupFor=(id:string,section:ProviderDirectoryCategory):ZoeProviderSetup=>
  id==="zoebuild-native"&&section==="commerce"?"native":
  id==="stripe"&&section==="payments"?"stripe-settings":
  id==="shopify"&&section==="commerce"?"shopify-oauth":"unavailable";

export function resolveZoeSelectedProvider(selection:string):ZoeProviderSelection|null{
  if(typeof selection!=="string"||selection.length>120)return null;
  const text=normalized(selection);
  if(!text)return null;
  const pair=text.split(":");
  if(pair.length>2)return null;
  const category=pair.length===2?pair[0]:null;
  if(category!==null&&!CATEGORIES.some(c=>c===category))return null;
  const candidate=pair.length===2?pair[1]:text;
  const matches=CATEGORIES.flatMap(section=>{
    if(category!==null&&section!==category)return [];
    return PROVIDER_PRESENTATIONS[section].filter(provider=>
      normalized(provider.id)===candidate||normalized(provider.name)===candidate)
      .map(provider=>({kind:"provider" as const, providerId:provider.id,
        providerName:provider.name,section,setup:setupFor(provider.id,section)}));
  });
  if(!matches.length)return null;
  if(matches.length>1)return {kind:"ambiguous",name:matches[0]!.providerName,
    sections:matches.map(item=>item.section)};
  return matches[0]!;
}

/** Presentation/implementation hints for semantic planning, NOT live connections. */
export function zoeProviderDirectoryEvidence(){
  return CATEGORIES.map(section=>({section,providers:PROVIDER_PRESENTATIONS[section]
    .map(provider=>({id:provider.id,name:provider.name,
      setup:setupFor(provider.id,section)}))}));
}
