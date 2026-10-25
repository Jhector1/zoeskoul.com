import {describe,it,expect} from "vitest";
import {isValidReactPreviewReadyDocument} from "./reactPreviewReadiness.js";
const doc=(status:number,contentType:string,html:string)=>({status,headers:{"content-type":contentType},bodyBase64:Buffer.from(html).toString("base64")});
const page="<!doctype html><html><head><title>Vite</title></head><body><div id='root'></div></body></html>";
describe("trusted React preview readiness",()=>{
  it("accepts only actual successful HTML documents",()=>{
    expect(isValidReactPreviewReadyDocument(doc(200,"text/html; charset=utf-8",page))).toBe(true);
  });
  it("rejects 404, 401, redirect, 500 even if they contain HTML",()=>{
    for(const status of [301,401,403,404,500,502])
      expect(isValidReactPreviewReadyDocument(doc(status,"text/html",page))).toBe(false);
  });
  it("rejects JSON, JavaScript, empty and error documents",()=>{
    for(const response of [doc(200,"application/javascript",page),doc(200,"text/html",""),doc(200,"text/html","Preview failed")])
      expect(isValidReactPreviewReadyDocument(response)).toBe(false);
  });
});
