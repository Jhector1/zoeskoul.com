// src/lib/certificates/policy.ts
export const CERT_REQUIRE_ASSIGNMENT = false; // or true
export const APP_NAME = process.env.APP_NAME?.trim() || "ZoeSkoul";
export const ISSUER_NAME = "ZoeSkoul";
export const ISSUER_TITLE = "Issued By";
export const CERT_DISCLAIMER =
    "This is a private course completion certificate issued by ZoeSkoul. It is not an academic degree, license, or accredited professional certification.";
