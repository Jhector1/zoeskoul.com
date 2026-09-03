
export type InviteLocale = "en" | "es" | "fr" | "ht";
export function normalizeInviteLocale(value: string | null | undefined): InviteLocale {
 const v=value?.trim().toLowerCase(); return v==="es"||v==="fr"||v==="ht"?v:"en";
}
export function resolveInviteLocaleFromRequest(request: Request): InviteLocale {
 const ref=request.headers.get("referer");
 if(ref){try{const x=new URL(ref).pathname.split("/").filter(Boolean)[0];if(x==="en"||x==="es"||x==="fr"||x==="ht") return x;}catch{}}
 return normalizeInviteLocale(request.headers.get("accept-language")?.split(",")[0]?.split("-")[0]);
}
